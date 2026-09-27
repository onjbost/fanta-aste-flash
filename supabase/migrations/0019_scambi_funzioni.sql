-- =====================================================================
-- Fantacalciomercato — l'applicazione di uno scambio, e il suo ritorno
-- =====================================================================

create or replace function fn_applica_scambio(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t           trades%rowtype;
  it          trade_items%rowtype;
  v_vecchio   contracts%rowtype;
  v_nuovo     uuid;
  v_destinata uuid;
begin
  -- il lock è ciò che rende innocuo il doppio clic su «Conferma»: la
  -- seconda chiamata aspetta la prima, poi trova applied_at valorizzato
  select * into t from trades where id = p_trade_id for update;
  if not found then raise exception 'scambio inesistente'; end if;
  if t.applied_at is not null then raise exception 'scambio già registrato'; end if;
  if t.reverted_at is not null then raise exception 'scambio annullato'; end if;

  for it in select * from trade_items where trade_id = p_trade_id loop
    select * into v_vecchio from contracts
      where player_id = it.player_id
        and team_id   = it.from_team_id
        and released_at is null
      for update;
    if not found then
      raise exception 'il giocatore % non è più nella rosa di partenza', it.player_id;
    end if;

    v_destinata := case when it.from_team_id = t.from_team_id
                        then t.to_team_id else t.from_team_id end;

    update contracts
       set released_at = now(), release_type = 'trade', release_value = null
     where id = v_vecchio.id;

    -- il prezzo si conserva: «quanto l'aveva pagato» è il numero che rende
    -- leggibile mezzo campionato. Che non l'abbia pagato chi lo riceve lo
    -- dice acquisition_type.
    insert into contracts (league_id, team_id, player_id, price, acquisition_type)
    values (t.league_id, v_destinata, it.player_id, v_vecchio.price, 'trade')
    returning id into v_nuovo;

    update trade_items
       set contract_closed_id = v_vecchio.id, contract_opened_id = v_nuovo
     where trade_id = p_trade_id and player_id = it.player_id;
  end loop;

  if t.settlement > 0 then
    insert into credit_movements (league_id, team_id, amount, reason, note)
    values
      (t.league_id,
       case when t.settlement_payer = 'to' then t.to_team_id else t.from_team_id end,
       -t.settlement, 'trade', 'conguaglio scambio ' || p_trade_id),
      (t.league_id,
       case when t.settlement_payer = 'to' then t.from_team_id else t.to_team_id end,
        t.settlement, 'trade', 'conguaglio scambio ' || p_trade_id);
  end if;

  update trades set applied_at = now() where id = p_trade_id;
end;
$$;

create or replace function fn_annulla_scambio(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t  trades%rowtype;
  it trade_items%rowtype;
begin
  select * into t from trades where id = p_trade_id for update;
  if not found then raise exception 'scambio inesistente'; end if;
  if t.applied_at  is null     then raise exception 'scambio mai registrato'; end if;
  if t.reverted_at is not null then raise exception 'scambio già annullato'; end if;

  for it in select * from trade_items where trade_id = p_trade_id loop
    -- i contratti non si cancellano mai, si chiudono (principio di 0001): se
    -- nel frattempo quel contratto è stato chiuso da qualcos'altro — il
    -- giocatore svincolato o scambiato di nuovo — cancellarlo qui perderebbe
    -- per sempre quella storia. Meglio rifiutare e far sistemare a mano.
    if exists (select 1 from contracts
               where id = it.contract_opened_id and released_at is not null) then
      raise exception
        'il giocatore % è stato mosso dopo questo scambio: annullalo a mano', it.player_id;
    end if;

    -- prima si spezza il riferimento da trade_items (senza, il vincolo di
    -- chiave esterna trade_items_contract_opened_id_fkey impedirebbe di
    -- cancellare il contratto nuovo), poi si cancella il contratto nuovo,
    -- poi si riapre il vecchio: l'ordine inverso violerebbe «un solo
    -- contratto aperto per giocatore»
    update trade_items set contract_opened_id = null
     where trade_id = p_trade_id and player_id = it.player_id;
    delete from contracts where id = it.contract_opened_id;
    update contracts
       set released_at = null, release_type = null, release_value = null
     where id = it.contract_closed_id;
  end loop;

  -- i crediti non si cancellano, si compensano: credit_movements è un
  -- registro di movimenti, e il saldo deve tornare senza perdere la storia
  if t.settlement > 0 then
    insert into credit_movements (league_id, team_id, amount, reason, note)
    values
      (t.league_id,
       case when t.settlement_payer = 'to' then t.to_team_id else t.from_team_id end,
        t.settlement, 'trade', 'annullato scambio ' || p_trade_id),
      (t.league_id,
       case when t.settlement_payer = 'to' then t.from_team_id else t.to_team_id end,
       -t.settlement, 'trade', 'annullato scambio ' || p_trade_id);
  end if;

  -- niente `applied_at = null` qui: il vincolo `trades_annullato_dopo_applicato`
  -- (Task 1) richiede applied_at valorizzato quando reverted_at lo è.
  -- `reverted_at is not null` è già il segnale che lo scambio non vale più.
  update trades set reverted_at = now() where id = p_trade_id;
end;
$$;

-- Le chiamano solo le server action con il service role: nessun client deve
-- poterle invocare da sé via RPC. La revoke da public non basta, perché su
-- Supabase i ruoli anon/authenticated hanno l'EXECUTE per conto loro; il
-- blocco su pg_roles è difensivo per farle girare anche altrove.
do $$
begin
  execute 'revoke all on function fn_applica_scambio(uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fn_applica_scambio(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function fn_applica_scambio(uuid) from authenticated';
  end if;

  execute 'revoke all on function fn_annulla_scambio(uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fn_annulla_scambio(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function fn_annulla_scambio(uuid) from authenticated';
  end if;
end $$;
