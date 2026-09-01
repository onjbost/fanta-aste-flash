-- =====================================================================
-- Prova a freddo dello schema del Torneo dei Tipster.
-- =====================================================================
-- NON è una migrazione e non va eseguito su Supabase: le migrazioni sono
-- solo i file NNNN_*.sql. Questo è il test dello schema, da far girare
-- quando lo si tocca, su un'installazione qualsiasi di Postgres.
--
-- Gira dentro una transazione e finisce con rollback, quindi è innocuo,
-- ma la riga "\set ON_ERROR_STOP on" qui sotto è un comando di psql: nel
-- SQL Editor di Supabase darebbe errore di sintassi.
--
--   psql -f supabase/migrations/0001_schema.sql   (…e gli altri)
--   psql -f supabase/smoke-tipster.sql
-- =====================================================================

\set ON_ERROR_STOP on
begin;

insert into leagues (id, name, season)
values ('11111111-1111-1111-1111-111111111111', 'Prova', '2026/2027');

insert into teams (id, league_id, name, manager_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alfa',  'Alfa'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Beta',  'Beta');

insert into matchdays (id, league_id, serie_a, fanta, match_date, first_kickoff_at, lock_at) values
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   2, 1, '2026-08-30', '2026-08-29 15:00+02', '2026-01-01 00:00+01'),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   3, 2, '2026-09-06', '2026-09-05 15:00+02', '2026-01-01 00:00+01');

insert into fixtures (id, league_id, matchday_id, competition, phase, round_number, slot,
                      home_team_id, away_team_id) values
  ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'dddddddd-0000-0000-0000-000000000002', 'campionato', 'regular', 1, 1,
   'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ffffffff-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'dddddddd-0000-0000-0000-000000000003', 'campionato', 'regular', 2, 1,
   'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');

-- semifinale di coppa senza squadre: deve essere ammessa
insert into fixtures (league_id, matchday_id, competition, phase, round_number, slot)
values ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000003',
        'coppa', 'semifinale', 7, 1);

insert into slips (id, league_id, matchday_id, team_id) values
  ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');

-- ------------------------------------------------------------- verifiche
do $$
declare r record; n int;
begin
  -- 1 · la chiusura la calcola il trigger: prima partita meno 60 minuti
  select lock_at, first_kickoff_at into r from matchdays
   where id = 'dddddddd-0000-0000-0000-000000000002';
  assert r.lock_at = r.first_kickoff_at - interval '60 minutes',
    format('chiusura sbagliata: %s', r.lock_at);

  -- 2 · spostando la prima partita si sposta anche la chiusura
  update matchdays set first_kickoff_at = '2026-08-29 18:00+02'
   where id = 'dddddddd-0000-0000-0000-000000000002';
  select lock_at into r from matchdays where id = 'dddddddd-0000-0000-0000-000000000002';
  assert r.lock_at = timestamptz '2026-08-29 17:00+02', 'la chiusura non ha seguito la partita';

  -- 3 · una quota impossibile non entra
  begin
    insert into odds (fixture_id, market, selection, probability, price)
    values ('ffffffff-0000-0000-0000-000000000001', '1x2', '1', 1.5, 0.66);
    raise exception 'una probabilità > 1 non doveva passare';
  exception when check_violation then null;
  end;

  insert into odds (fixture_id, market, selection, probability, price) values
    ('ffffffff-0000-0000-0000-000000000001', '1x2', '1', 0.418, 2.39),
    ('ffffffff-0000-0000-0000-000000000001', '1x2', 'X', 0.222, 4.50),
    ('ffffffff-0000-0000-0000-000000000001', '1x2', '2', 0.360, 2.78);

  -- 4 · fino a tre giocate sulla stessa sfida
  insert into picks (slip_id, fixture_id, market, selection, price) values
    ('55555555-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', '1x2', '1', 2.39),
    ('55555555-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', '1x2', 'X', 4.50),
    ('55555555-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'gg', 'gg', 1.88);

  -- 5 · la quarta no
  begin
    insert into picks (slip_id, fixture_id, market, selection, price)
    values ('55555555-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'gg', 'ng', 2.13);
    raise exception 'il tetto di tre giocate non ha funzionato';
  exception when raise_exception then
    if sqlerrm not like '%massimo%' then raise; end if;
  end;

  -- 6 · non si gioca una sfida di un'altra giornata
  begin
    insert into picks (slip_id, fixture_id, market, selection, price)
    values ('55555555-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', '1x2', '1', 2.00);
    raise exception 'la sfida di un''altra giornata non doveva passare';
  exception when raise_exception then
    if sqlerrm not like '%non appartiene%' then raise; end if;
  end;

  -- 7 · la stessa giocata non si ripete (su una schedina ancora libera)
  insert into slips (id, league_id, matchday_id, team_id)
  values ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
          'dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002');
  insert into picks (slip_id, fixture_id, market, selection, price)
  values ('55555555-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001', '1x2', '1', 2.39);
  begin
    insert into picks (slip_id, fixture_id, market, selection, price)
    values ('55555555-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001', '1x2', '1', 2.39);
    raise exception 'la giocata doppia non doveva passare';
  exception when unique_violation then null;
  end;

  -- 8 · una sola schedina per squadra e giornata
  begin
    insert into slips (league_id, matchday_id, team_id)
    values ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002',
            'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'la seconda schedina non doveva passare';
  exception when unique_violation then null;
  end;

  -- 9 · i punti: 10/n × quota, con n = giocate su quella sfida
  update picks set outcome = 'lost', multiplier = 10/3.0, points = 0
   where slip_id = '55555555-0000-0000-0000-000000000001';
  update picks set outcome = 'won', multiplier = 10/3.0, points = round((10/3.0) * price, 2)
   where slip_id = '55555555-0000-0000-0000-000000000001' and selection = 'X';
  update slips set points = (select coalesce(sum(points), 0) from picks
                              where slip_id = '55555555-0000-0000-0000-000000000001')
   where id = '55555555-0000-0000-0000-000000000001';

  select punti, giocate, azzeccate into r from v_tipster_giornata
   where team_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert r.giocate = 3 and r.azzeccate = 1, format('conteggi sbagliati: %s/%s', r.azzeccate, r.giocate);
  assert r.punti = 15.00, format('punti attesi 15.00, trovati %s', r.punti);

  select punti into r from v_tipster_classifica
   where team_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert r.punti = 15.00, 'la classifica non somma le giornate';

  -- 10 · una partita di Serie A è rinviata solo con una politica valida
  insert into serie_a_fixtures (matchday_id, home_club, away_club)
  values ('dddddddd-0000-0000-0000-000000000002', 'Inter', 'Milan');
  begin
    update serie_a_fixtures set policy = 'six' where home_club = 'Inter';
    raise exception 'la politica su una partita non rinviata non doveva passare';
  exception when check_violation then null;
  end;
  update serie_a_fixtures set status = 'postponed', policy = 'wait' where home_club = 'Inter';

  raise notice 'tipster: tutte le verifiche passate';
end $$;

rollback;
