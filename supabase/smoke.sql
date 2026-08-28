-- =====================================================================
-- Prova a freddo del motore d'asta.
-- =====================================================================
-- NON è una migrazione e non va eseguito su Supabase: le migrazioni sono
-- solo i file NNNN_*.sql. Questo è il test dello schema, da far girare
-- quando si tocca il database, su un'installazione qualsiasi di Postgres.
--
-- Gira dentro una transazione e finisce con rollback, quindi è innocuo,
-- ma la riga "\set ON_ERROR_STOP on" qui sotto è un comando di psql: nel
-- SQL Editor di Supabase darebbe errore di sintassi. Se proprio lo vuoi
-- lanciare da lì, togli quella riga.
--
--   psql -f supabase/migrations/0001_schema.sql   (…e gli altri)
--   psql -f supabase/smoke.sql
-- =====================================================================

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------- dati
insert into leagues (id, name, season)
values ('11111111-1111-1111-1111-111111111111', 'Prova', '2026/2027');

insert into teams (id, league_id, name, manager_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alfa',  'Alfa'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Beta',  'Beta'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Gamma', 'Gamma');

insert into players (id, league_id, ext_id, name, role, club, quotation) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'p1', 'OBIETTIVO', 'D', 'Inter', 20),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'p2', 'SVINCOLANDO ALFA', 'D', 'Roma', 10),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'p3', 'SVINCOLANDO BETA', 'D', 'Lazio', 12),
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'p4', 'ALTRO ALFA', 'D', 'Milan', 8);

insert into contracts (league_id, team_id, player_id, price) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 32),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000004', 20),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003', 24);

insert into credit_movements (league_id, team_id, amount, reason) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 50, 'initial'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 40, 'initial');

insert into auction_sessions (id, league_id, number, auction_at, status)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        1, now(), 'live');

insert into lots (id, session_id, player_id, caller_team_id, order_index, status, timer_ends_at)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        1, 'live', now() + interval '1 hour');

insert into lot_participants (session_id, lot_id, team_id, is_caller, release_player_id, budget) values
  ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', true,  'bbbbbbbb-0000-0000-0000-000000000002', 74),
  ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', false, 'bbbbbbbb-0000-0000-0000-000000000003', 58);

-- ------------------------------------------------------------- verifiche

do $$
declare r record; ok boolean;
begin
  -- 1 · i crediti sono la somma dei movimenti
  select credits into r from v_team_credits where team_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert r.credits = 50, 'crediti di Alfa sbagliati';

  -- 2 · prima offerta: deve partire dalla base (1 credito)
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 0, 58, false);
  assert r.ok = false, 'un''offerta di 0 non doveva passare';

  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 1, 58, false);
  assert r.ok, format('la prima offerta doveva passare: %s', r.reason);
  assert r.price = 1 and r.leader = 'aaaaaaaa-0000-0000-0000-000000000002', 'stato del lotto sbagliato';

  -- 3 · chi è già in testa non rilancia contro sé stesso
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 5, 58, false);
  assert r.ok = false and r.reason like '%migliore offerente%', 'doveva rifiutare l''auto-rilancio';

  -- 4 · serve almeno un credito in più
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 74, false);
  assert r.ok = false and r.reason like '%minima%', 'doveva rifiutare la pareggiata';

  -- 5 · il budget è un muro
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 200, 74, false);
  assert r.ok = false and r.reason like '%budget%', 'doveva rifiutare l''offerta oltre budget';

  -- 6 · rilancio valido, e il timer si allunga
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 44, 74, false);
  assert r.ok and r.price = 44, 'il rilancio valido doveva passare';
  assert r.ends_at > now(), 'il timer doveva ripartire';

  -- 7 · chi non partecipa al lotto non può offrire
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 50, 500, false);
  assert r.ok = false and r.reason like '%Non partecipi%', 'un estraneo non doveva poter offrire';

  -- 8 · a lotto chiuso non si offre più
  update lots set status = 'assigned' where id = 'dddddddd-0000-0000-0000-000000000001';
  select * into r from fn_place_bid(
    'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 50, 58, false);
  assert r.ok = false and r.reason like '%non è aperto%', 'doveva rifiutare a lotto chiuso';
  update lots set status = 'live' where id = 'dddddddd-0000-0000-0000-000000000001';

  -- 9 · il registro delle offerte è coerente
  select count(*)::int as n into r from bids where lot_id = 'dddddddd-0000-0000-0000-000000000001';
  assert r.n = 2, format('offerte registrate: %s invece di 2', r.n);

  raise notice 'motore d''asta: tutte le verifiche passate';
end $$;

-- 10 · un giocatore non può essere messo sul piatto due volte nella sessione
do $$
begin
  begin
    insert into lot_participants (session_id, lot_id, team_id, is_caller, release_player_id, budget)
    values ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000003', false, 'bbbbbbbb-0000-0000-0000-000000000002', 10);
    raise exception 'il vincolo sullo svincolando unico non ha funzionato';
  exception when unique_violation then
    raise notice 'svincolando unico per sessione: ok';
  end;
end $$;

-- 11 · un giocatore non può avere due contratti aperti
do $$
begin
  begin
    insert into contracts (league_id, team_id, player_id, price)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003',
            'bbbbbbbb-0000-0000-0000-000000000002', 5);
    raise exception 'il vincolo sul contratto unico non ha funzionato';
  exception when unique_violation then
    raise notice 'un solo contratto aperto per giocatore: ok';
  end;
end $$;

-- 12 · il listone svincolati esclude chi ha un contratto aperto
do $$
declare n int;
begin
  select count(*) into n from v_free_agents;
  assert n = 1, format('svincolati attesi 1, trovati %s', n);
  raise notice 'listone svincolati: ok';
end $$;

rollback;
