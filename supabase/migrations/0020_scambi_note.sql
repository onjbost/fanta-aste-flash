-- =====================================================================
-- Fantacalciomercato — le note restano dell'admin, e un guscio non si applica
-- =====================================================================
-- Tre correzioni sul registro degli scambi, tutte in una migrazione nuova:
-- 0018 e 0019 non si riscrivono, si aggiunge sopra.

-- ------------------------------------------------- 1. la lettura torna admin
-- 0018 apriva `trades` in lettura a chiunque fosse nella lega
-- (`league_id = my_league_id()`). Ma la colonna `note` sta su quella riga: è
-- il contesto privato con cui l'admin si forma il giudizio — «è fuori da
-- gennaio, lo sanno tutti tranne chi l'ha preso» — e la anon key è pubblica
-- per definizione. Con un client browser già presente nel progetto, chiunque
-- degli otto poteva leggersi le note dalla console. La spec dice l'opposto:
-- la cronologia degli scambi «per ora la vede solo l'admin».
--
-- Stessa forma degli altri casi solo-admin (0002_rls.sql: messages,
-- admin_tasks, audit_log). La policy «l'admin gestisce gli scambi» (FOR ALL)
-- coprirebbe già la lettura, ma la si scrive esplicita: le policy permissive
-- si sommano, e una riga che dice a chiare lettere chi legge è ciò che manca
-- guardando 0018 e chiedendosi perché tutta la lega vedesse le note.
drop policy "la lega legge gli scambi" on trades;
create policy "scambi solo admin" on trades
  for select using (is_admin() and league_id = my_league_id());

-- Anche `trade_items`, e per la stessa ragione: non contiene le note, ma
-- contiene *chi si è mosso e da dove*, che è la cronologia degli scambi.
-- Lasciarla leggibile a tutta la lega renderebbe la chiusura su `trades`
-- mezza misura — si ricostruirebbe lo scambio senza il giudizio, che è
-- esattamente ciò che «per ora la vede solo l'admin» esclude.
drop policy "la lega legge i giocatori scambiati" on trade_items;
create policy "giocatori scambiati solo admin" on trade_items
  for select using (
    exists (select 1 from trades t
            where t.id = trade_id and t.league_id = my_league_id() and is_admin())
  );

-- ------------------------------- 2. conguaglio e pagatore vanno sempre insieme
-- `salvaScambio` mette `settlement_payer` a null quando il conguaglio è zero,
-- e `firmaScelta` conta su quella coerenza per far combaciare la firma della
-- scelta viva con quella dei fatti congelati. Finora era una convenzione del
-- codice: se una riga arrivasse con conguaglio zero e un pagatore (o con un
-- conguaglio da versare e nessuno che lo versa), le due firme divergerebbero
-- per sempre e «Conferma» non si accenderebbe più, senza che niente spieghi
-- perché. Verificato prima di aggiungerlo: nessuna riga esistente lo viola
-- (la tabella è vuota in produzione).
alter table trades add constraint trades_conguaglio_col_pagatore
  check ((settlement = 0) = (settlement_payer is null));

-- ------------------------------------- 3. un guscio senza giocatori non si applica
-- `fn_applica_scambio` cicla su zero `trade_items` senza fare niente, applica
-- comunque il conguaglio e valorizza `applied_at`: uno scambio «registrato»
-- in cui nessun giocatore si è mosso. `salvaScambio` compensa a mano
-- cancellando il guscio quando la seconda insert fallisce, ma le due insert
-- non sono nella stessa transazione — è il limite di supabase-js che ha fatto
-- nascere queste funzioni — e se il processo muore in mezzo resta un guscio
-- con `body` e `spunti` intatti, che a schermo sembra uno scambio pronto.
--
-- La guardia sta qui e non solo nel chiamante perché qui è l'unico punto da
-- cui `applied_at` può essere valorizzato: un controllo lato applicazione si
-- dimentica, un `raise` dentro la funzione no.
--
-- Il resto del corpo è quello di 0019, riportato tale e quale: `create or
-- replace` sostituisce la funzione intera, quindi va ricopiato per forza.
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

  -- la guardia: senza righe non c'è niente da muovere, e segnarlo applicato
  -- sarebbe registrare un fatto che non è avvenuto
  if not exists (select 1 from trade_items where trade_id = p_trade_id) then
    raise exception 'questo scambio non ha nessun giocatore: non c''è niente da registrare';
  end if;

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

-- `create or replace` azzera i privilegi? No: li conserva. Ma la revoca di
-- 0019 vale per la firma, e rifarla qui costa niente ed è l'unica cosa che
-- garantisce che una funzione ridefinita non torni eseguibile dai client.
do $$
begin
  execute 'revoke all on function fn_applica_scambio(uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fn_applica_scambio(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function fn_applica_scambio(uuid) from authenticated';
  end if;
end $$;
