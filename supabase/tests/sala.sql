-- =====================================================================
-- Prove delle funzioni della sala: presenze, grazia, annullo
-- =====================================================================
-- Non girano in vitest: queste regole vivono in Postgres, e provarle a
-- parole in TypeScript vorrebbe dire provare una copia. Si eseguono su un
-- database con tutte le migrazioni applicate, e finiscono con un rollback —
-- non lasciano niente dietro.
--
--   createdb fanta && psql -d fanta -f supabase/migrations/0001_schema.sql ...
--   psql -d fanta -f supabase/tests/sala.sql
--
-- Su un Postgres non-Supabase servono prima gli stub: schema `auth`, tabella
-- `auth.users(id uuid primary key)`, funzione `auth.uid()` e una
-- `publication supabase_realtime`.
--
-- Ogni `assert` che salta ferma tutto e dice cosa non torna.
-- =====================================================================

begin;

-- lega, squadre, giocatori, sessione, lotto con due contendenti
insert into leagues (id, name, season) values
  ('11111111-1111-1111-1111-111111111111', 'Prova', '2026/27');
update leagues set timer_seconds = 15, grace_seconds = 3
  where id = '11111111-1111-1111-1111-111111111111';

insert into teams (id, league_id, name, manager_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Joga', 'Mattia'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Borussia', 'Ale'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Pirati', 'Teo');

insert into auth.users (id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('bbbbbbbb-0000-0000-0000-000000000003');

insert into players (id, league_id, ext_id, name, role, club) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '1', 'MENDY', 'C', 'Lecce'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2', 'BOBCEK', 'C', 'Como'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '3', 'LONTANI', 'C', 'Pisa');

insert into auction_sessions (id, league_id, number, auction_at, status) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, now(), 'live');

insert into lots (id, session_id, player_id, caller_team_id, order_index, status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'live');

insert into lot_participants (session_id, lot_id, team_id, is_caller, release_player_id, budget) values
  ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', true,  'cccccccc-0000-0000-0000-000000000002', 14),
  ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', false, 'cccccccc-0000-0000-0000-000000000003', 11);

do $$
declare
  r record;
  v_lot uuid := 'eeeeeeee-0000-0000-0000-000000000001';
  joga uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  boru uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  pira uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  u1 uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  u2 uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  u3 uuid := 'bbbbbbbb-0000-0000-0000-000000000003';
begin
  -- 1. un rilancio prima delle presenze non passa
  select * into r from fn_place_bid(v_lot, joga, 1, 14);
  assert r.ok = false, 'un rilancio in attesa presenze è passato';
  assert r.reason like 'Il lotto non è ancora partito%', format('motivo inatteso: %s', r.reason);
  raise notice '1 ok — rilancio rifiutato in attesa presenze: %', r.reason;

  -- 2. chi non è in corsa non può confermare
  select * into r from fn_confirm_presence(v_lot, pira, u3);
  assert r.ok = false and r.reason like 'Non sei in corsa%', format('estraneo accettato: %s %s', r.ok, r.reason);
  raise notice '2 ok — estraneo rifiutato: %', r.reason;

  -- 3. la prima conferma non accende il timer
  select * into r from fn_confirm_presence(v_lot, joga, u1);
  assert r.ok and r.started = false and r.ends_at is null, 'la prima conferma ha acceso il timer';
  assert (select timer_ends_at from lots where id = v_lot) is null, 'timer scritto troppo presto';
  raise notice '3 ok — prima conferma registrata, countdown fermo';

  -- 3b. la stessa conferma due volte non cambia niente
  select * into r from fn_confirm_presence(v_lot, joga, u1);
  assert r.ok and r.started = false, 'la conferma ripetuta ha acceso il timer';
  assert (select count(*) from lot_presences where lot_id = v_lot) = 1, 'conferma duplicata';
  raise notice '3b ok — conferma ripetuta idempotente';

  -- 4. la seconda squadra accende il countdown
  select * into r from fn_confirm_presence(v_lot, boru, u2);
  assert r.ok and r.started = true, 'il countdown non è partito con tutti presenti';
  assert r.ends_at > now() + interval '14 seconds', format('timer troppo corto: %s', r.ends_at);
  assert r.ends_at < now() + interval '16 seconds', format('timer troppo lungo: %s', r.ends_at);
  raise notice '4 ok — countdown acceso a 15 secondi dalla conferma: %', r.ends_at;

  -- 5. adesso il rilancio passa, e rimette il timer a 15
  select * into r from fn_place_bid(v_lot, boru, 1, 11);
  assert r.ok, format('rilancio rifiutato: %s', r.reason);
  assert r.price = 1 and r.leader = boru, 'prezzo o leader sbagliati';
  raise notice '5 ok — rilancio a 1 di Borussia, timer a %', r.ends_at;

  -- 6. scaduto da 2 secondi: siamo nella grazia, il rilancio vale e il timer torna pieno
  update lots set timer_ends_at = now() - interval '2 seconds' where id = v_lot;
  select * into r from fn_place_bid(v_lot, joga, 2, 14);
  assert r.ok, format('rilancio nella grazia rifiutato: %s', r.reason);
  assert r.ends_at > now() + interval '14 seconds', 'la grazia non ha rimesso il timer a 15';
  raise notice '6 ok — rilancio nella grazia accettato, timer rimesso a %', r.ends_at;

  -- 7. scaduto da 4 secondi: fuori dalla grazia, congelato
  update lots set timer_ends_at = now() - interval '4 seconds' where id = v_lot;
  select * into r from fn_place_bid(v_lot, boru, 3, 11);
  assert r.ok = false and r.reason = 'Tempo scaduto', format('fuori grazia accettato: %s %s', r.ok, r.reason);
  raise notice '7 ok — fuori dalla grazia: %', r.reason;

  -- 8. una conferma a countdown già partito resta registrata senza toccare il timer
  update lots set timer_ends_at = now() + interval '10 seconds' where id = v_lot;
  select * into r from fn_confirm_presence(v_lot, joga, u3);
  assert r.ok and r.started = false, 'conferma tardiva ha riacceso il timer';
  assert (select count(*) from lot_presences where lot_id = v_lot) = 3, 'conferma tardiva non registrata';
  raise notice '8 ok — conferma tardiva registrata, timer intatto';

  -- 9. su un lotto non aperto non si conferma
  update lots set status = 'called' where id = v_lot;
  select * into r from fn_confirm_presence(v_lot, joga, u1);
  assert r.ok = false and r.reason like 'Il lotto non è aperto%', format('lotto chiuso accettato: %s', r.reason);
  raise notice '9 ok — lotto non aperto: %', r.reason;

  raise notice 'Presenze e grazia: tutto a posto.';
end $$;

-- =====================================================================
-- L'annullo di un'aggiudicazione, sui vincoli veri del database
-- =====================================================================
-- `annullaAssegnazione` fa questi passi da TypeScript. Qui si provano contro
-- lo schema: che il saldo torni identico, che il contratto si possa
-- riaprire, e che NON si possa se intanto il giocatore è finito in un'altra
-- rosa — è il controllo che la funzione fa prima di scrivere, e il database
-- è la rete sotto.
-- =====================================================================

do $$
declare
  joga  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  pira  uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  lega  uuid := '11111111-1111-1111-1111-111111111111';
  sess  uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_lot uuid := 'eeeeeeee-0000-0000-0000-000000000001';
  mendy uuid := 'cccccccc-0000-0000-0000-000000000001';
  bobcek uuid := 'cccccccc-0000-0000-0000-000000000002';
  c_comprato uuid;
  c_svincolato uuid;
  v_saldo int;
  v_prima int;
begin
  -- il punto di partenza: Joga ha 14 crediti e BOBCEK in rosa, pagato 12
  insert into credit_movements (league_id, team_id, amount, reason, note)
  values (lega, joga, 14, 'initial', 'dotazione');
  insert into contracts (league_id, team_id, player_id, price, acquisition_type)
  values (lega, joga, bobcek, 12, 'initial_auction')
  returning id into c_svincolato;

  select credits into v_prima from v_team_credits where team_id = joga;
  assert v_prima = 14, format('saldo di partenza sbagliato: %s', v_prima);

  -- ---------------- l'aggiudicazione (quello che fa applyMovements)
  update lots set status = 'assigned', winner_team_id = joga, final_price = 14,
                  closed_at = now() where id = v_lot;
  update contracts set released_at = now(), release_type = 'flash_75',
                       release_value = 9, session_id = sess
   where id = c_svincolato;
  update players set locked_until_number = 2 where id = bobcek;
  insert into credit_movements (league_id, team_id, amount, reason, note, session_id, lot_id)
  values (lega, joga, 9, 'refund', 'Svincolo BOBCEK', sess, v_lot),
         (lega, joga, -14, 'purchase', 'Acquisto MENDY P.', sess, v_lot);
  insert into contracts (league_id, team_id, player_id, price, acquisition_type, session_id)
  values (lega, joga, mendy, 14, 'flash_auction', sess)
  returning id into c_comprato;

  select credits into v_saldo from v_team_credits where team_id = joga;
  assert v_saldo = 9, format('saldo dopo l''asta sbagliato: %s (14 +9 −14)', v_saldo);
  raise notice '10 ok — aggiudicazione: saldo 14 → %', v_saldo;

  -- ---------------- il controllo che l'annullo fa prima di scrivere:
  --                  se BOBCEK è già in un'altra rosa, non si riapre
  insert into contracts (league_id, team_id, player_id, price, acquisition_type)
  values (lega, pira, bobcek, 5, 'trade');
  begin
    update contracts set released_at = null, release_type = null, release_value = null
     where id = c_svincolato;
    raise exception 'il database ha accettato due contratti aperti sullo stesso giocatore';
  exception when unique_violation then
    raise notice '11 ok — riapertura rifiutata: BOBCEK è in un''altra rosa (è il controllo che fa annullaAssegnazione)';
  end;
  delete from contracts where team_id = pira and player_id = bobcek;

  -- ---------------- l'annullo vero
  update lots set status = 'called', winner_team_id = null, final_price = null,
                  current_price = null, current_leader = null,
                  timer_ends_at = null, opened_at = null, closed_at = null
   where id = v_lot and status = 'assigned';
  delete from contracts where id = c_comprato;
  update contracts set released_at = null, release_type = null, release_value = null,
                       session_id = null
   where id = c_svincolato;
  insert into credit_movements (league_id, team_id, amount, reason, note, session_id, lot_id)
  values (lega, joga, -9, 'adjustment', 'Annullo svincolo BOBCEK', sess, v_lot),
         (lega, joga, 14, 'adjustment', 'Annullo acquisto MENDY P.', sess, v_lot);
  update players set locked_until_number = null where id = bobcek;
  delete from lot_presences where lot_id = v_lot;

  -- ---------------- i conti tornano?
  select credits into v_saldo from v_team_credits where team_id = joga;
  assert v_saldo = v_prima, format('il saldo non è tornato: %s invece di %s', v_saldo, v_prima);

  assert (select count(*) from contracts
          where team_id = joga and player_id = bobcek and released_at is null) = 1,
    'BOBCEK non è tornato in rosa';
  assert (select count(*) from contracts
          where player_id = mendy and released_at is null) = 0,
    'MENDY è rimasto in rosa a qualcuno';
  assert (select locked_until_number from players where id = bobcek) is null,
    'BOBCEK è rimasto bloccato';
  assert (select status from lots where id = v_lot) = 'called',
    'il lotto non è tornato in programma';
  -- il registro resta leggibile: quattro righe, non zero
  assert (select count(*) from credit_movements where lot_id = v_lot) = 4,
    'i movimenti sono stati cancellati invece che compensati';
  raise notice '12 ok — annullo: saldo tornato a %, BOBCEK in rosa, MENDY libero, lotto in programma', v_saldo;

  -- e il lotto si può riaprire da zero
  update lots set status = 'live', opened_at = now() where id = v_lot;
  perform fn_confirm_presence(v_lot, joga, 'bbbbbbbb-0000-0000-0000-000000000001');
  assert (select timer_ends_at from lots where id = v_lot) is null,
    'il lotto riaperto è partito con una sola conferma';
  raise notice '13 ok — lotto riaperto: si ricomincia dalle presenze';

  raise notice 'ANCHE LE PROVE DELL''ANNULLO PASSATE';
end $$;

rollback;
