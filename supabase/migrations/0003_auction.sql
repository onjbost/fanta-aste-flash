-- =====================================================================
-- Sala d'asta: stato del lotto in tempo reale e rilancio atomico
-- =====================================================================
-- Il rilancio è l'unico punto dove due persone possono premere lo stesso
-- pulsante nello stesso istante. Vive dentro una funzione che blocca la
-- riga del lotto: il server decide chi è arrivato prima, con il suo
-- orologio, e nessun browser può forzare un prezzo.
-- =====================================================================

alter table lots add column if not exists current_price  int;
alter table lots add column if not exists current_leader uuid references teams(id);
alter table lots add column if not exists timer_ends_at  timestamptz;

alter table auction_sessions add column if not exists room_opened_at timestamptz;

-- il registro delle offerte non si riscrive: si aggiunge e basta
create index if not exists bids_lot_created on bids (lot_id, created_at desc);

-- ---------------------------------------------------------------------
-- fn_place_bid
--   p_budget arriva dal server (mai dal client): è crediti aggiornati +
--   rimborso dello svincolando dichiarato per QUESTO lotto.
-- ---------------------------------------------------------------------
create or replace function fn_place_bid(
  p_lot_id  uuid,
  p_team_id uuid,
  p_amount  int,
  p_budget  int,
  p_is_auto boolean default false
)
returns table (ok boolean, reason text, price int, leader uuid, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_lot     lots%rowtype;
  v_base       int;
  v_inc        int;
  v_timer      int;
  v_min        int;
  v_new_price  int;
  v_new_leader uuid;
  v_new_ends   timestamptz;
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    return query select false, 'Lotto inesistente', null::int, null::uuid, null::timestamptz;
    return;
  end if;

  select l.base_price, l.min_increment, l.timer_seconds
    into v_base, v_inc, v_timer
  from leagues l
  join auction_sessions s on s.league_id = l.id
  where s.id = v_lot.session_id;

  if v_lot.status <> 'live' then
    return query select false, 'Il lotto non è aperto', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  if v_lot.timer_ends_at is not null and now() > v_lot.timer_ends_at then
    return query select false, 'Tempo scaduto', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  if v_lot.current_leader = p_team_id then
    return query select false, 'Sei già il migliore offerente', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  v_min := coalesce(v_lot.current_price + v_inc, v_base);
  if p_amount < v_min then
    return query select false, format('L''offerta minima adesso è %s crediti', v_min),
                        v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  if p_amount > p_budget then
    return query select false, format('Il tuo budget su questo lotto è %s crediti', p_budget),
                        v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  -- deve essere una partecipazione viva
  if not exists (
    select 1 from lot_participants
    where lot_id = p_lot_id and team_id = p_team_id
      and status = 'confirmed' and withdrawn = false
  ) then
    return query select false, 'Non partecipi a questo lotto', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  insert into bids (lot_id, team_id, amount, is_auto)
  values (p_lot_id, p_team_id, p_amount, p_is_auto);

  update lots
     set current_price  = p_amount,
         current_leader = p_team_id,
         timer_ends_at  = now() + make_interval(secs => v_timer)
   where id = p_lot_id
  returning current_price, current_leader, timer_ends_at
  into v_new_price, v_new_leader, v_new_ends;

  return query select true, null::text, v_new_price, v_new_leader, v_new_ends;
end;
$$;

-- La funzione la chiama solo il server con il service role: nessun client
-- deve poterla invocare da sé. I ruoli anon/authenticated esistono su
-- Supabase; il blocco è difensivo per farla girare anche altrove.
do $$
begin
  execute 'revoke all on function fn_place_bid(uuid, uuid, int, int, boolean) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fn_place_bid(uuid, uuid, int, int, boolean) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function fn_place_bid(uuid, uuid, int, int, boolean) from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Realtime: il client segue lotti e offerte della sessione in corso.
-- Le partecipazioni restano fuori dal canale finché la sala non si apre,
-- perché le policy di lettura valgono anche qui.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table lots';
    execute 'alter publication supabase_realtime add table bids';
    execute 'alter publication supabase_realtime add table lot_participants';
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Blocco degli svincolati: chi esce da una rosa in asta torna chiamabile
-- solo dalla sessione successiva (art. 10.2).
-- ---------------------------------------------------------------------
alter table players add column if not exists locked_until_number int;

comment on column players.locked_until_number is
  'Numero della prima sessione in cui il giocatore torna chiamabile. NULL = libero.';

-- ---------------------------------------------------------------------
-- "Fuori lista" del listone ufficiale: la società non l'ha inserito nella
-- lista di Serie A. Non vale automaticamente lo svincolo al 100% — non è
-- detto che abbia lasciato la Serie A — ma è il primo posto dove guardare,
-- quindi l'app lo segnala e propone la richiesta all'admin.
-- ---------------------------------------------------------------------
alter table players add column if not exists out_of_list boolean not null default false;
