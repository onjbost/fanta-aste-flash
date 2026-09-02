-- =====================================================================
-- Prova a freddo dello schema della Redazione.
-- =====================================================================
-- NON è una migrazione e non va eseguito su Supabase: le migrazioni sono
-- solo i file NNNN_*.sql. Questo è il test dello schema, da far girare
-- quando lo si tocca, su un'installazione qualsiasi di Postgres.
--
-- Gira dentro una transazione e finisce con rollback, quindi è innocuo,
-- ma la riga "\set ON_ERROR_STOP on" qui sotto è un comando di psql: nel
-- SQL Editor di Supabase darebbe errore di sintassi.
--
--   psql -f supabase/migrations/0001_schema.sql   (…e tutti gli altri)
--   psql -f supabase/smoke-redazione.sql
-- =====================================================================

\set ON_ERROR_STOP on
begin;

insert into leagues (id, name, season)
values ('11111111-1111-1111-1111-111111111111', 'Prova', '2026/2027');

insert into teams (id, league_id, name, manager_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alfa', 'Alfa'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Beta', 'Beta');

insert into matchdays (id, league_id, serie_a, fanta, match_date, first_kickoff_at, lock_at) values
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   2, 1, '2026-08-30', '2026-08-29 15:00+02', '2026-01-01 00:00+01');

insert into fixtures (id, league_id, matchday_id, competition, phase, round_number, slot,
                      home_team_id, away_team_id, home_goals, away_goals, home_fp, away_fp) values
  ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'dddddddd-0000-0000-0000-000000000002', 'campionato', 'regular', 1, 1,
   'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   1, 2, 70.5, 77);

-- ------------------------------------------------------------- verifiche
do $$
declare n int; ok boolean; v int;
begin
  -- 1 · le impostazioni di lega hanno i valori di partenza giusti
  select redazione_tono, redazione_min_parole into n, v from leagues
   where id = '11111111-1111-1111-1111-111111111111';
  if n <> 4 or v <> 150 then
    raise exception '1 · impostazioni redazione sbagliate: tono %, parole %', n, v;
  end if;

  -- 2 · il tono sta fra 1 e 5
  begin
    update leagues set redazione_tono = 9
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception '2 · un tono 9 è stato accettato';
  exception when check_violation then null; end;

  -- 3 · un tabellino normale entra: undici titolari e la panchina
  insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name,
                              role, starter, is_captain, voto, fantavoto, bonus, counted)
  select '11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
         'aaaaaaaa-0000-0000-0000-000000000001', g, 'Titolare ' || g,
         case when g = 1 then 'P' when g <= 5 then 'D' when g <= 9 then 'C' else 'A' end,
         true, g = 11, 6, 6, '{}'::jsonb, true
    from generate_series(1, 11) g;

  insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name,
                              role, starter, entered, voto, fantavoto, counted)
  values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', 12, 'Panchinaro', 'A', false, false,
          null, null, false);

  select count(*) into n from lineup_entries
   where fixture_id = 'ffffffff-0000-0000-0000-000000000001';
  if n <> 12 then raise exception '3 · righe del tabellino: % invece di 12', n; end if;

  -- 4 · un senza voto è ammesso: voto e fantavoto null sono un'informazione
  select (voto is null and fantavoto is null) into ok from lineup_entries
   where fixture_id = 'ffffffff-0000-0000-0000-000000000001' and slot = 12;
  if not ok then raise exception '4 · il senza voto non è stato conservato'; end if;

  -- 5 · la fascia si dà a un titolare
  begin
    insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name,
                                starter, is_captain)
    values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001', 13, 'Capitano in panchina', false, true);
    raise exception '5 · un capitano in panchina è stato accettato';
  exception when check_violation then null; end;

  -- 6 · un solo capitano per squadra e per sfida
  begin
    insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name,
                                starter, is_captain)
    values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001', 14, 'Secondo capitano', true, true);
    raise exception '6 · due capitani nella stessa squadra sono stati accettati';
  exception when unique_violation then null; end;

  -- 7 · solo un panchinaro può subentrare
  begin
    insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name,
                                starter, entered)
    values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001', 15, 'Titolare subentrato', true, true);
    raise exception '7 · un titolare è stato fatto subentrare';
  exception when check_violation then null; end;

  -- 8 · lo stesso slot non si ripete nella stessa squadra
  begin
    insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name, starter)
    values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Doppione', true);
    raise exception '8 · uno slot doppio è stato accettato';
  exception when unique_violation then null; end;

  -- 9 · le due squadre della stessa sfida usano gli stessi slot senza pestarsi
  insert into lineup_entries (league_id, fixture_id, team_id, slot, player_name, starter)
  values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 1, 'Portiere avversario', true);
  select count(*) into n from lineup_entries
   where fixture_id = 'ffffffff-0000-0000-0000-000000000001' and slot = 1;
  if n <> 2 then raise exception '9 · slot 1 presente % volte invece di 2', n; end if;

  -- 10 · la versione dell'articolo se la assegna il trigger
  insert into news_articles (league_id, matchday_id, spunti, corpo, testo, provider)
  values ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002',
          '[]'::jsonb, '{}'::jsonb, 'prima bozza', 'template');
  insert into news_articles (league_id, matchday_id, spunti, corpo, testo, provider, model)
  values ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002',
          '[]'::jsonb, '{}'::jsonb, 'più cattiva', 'gemini', 'gemini-flash');

  select max(versione) into n from news_articles
   where matchday_id = 'dddddddd-0000-0000-0000-000000000002';
  if n <> 2 then raise exception '10 · versione dell''articolo: % invece di 2', n; end if;

  -- 11 · la bozza vecchia resta: rigenerare non cancella
  select count(*) into n from news_articles
   where matchday_id = 'dddddddd-0000-0000-0000-000000000002' and testo = 'prima bozza';
  if n <> 1 then raise exception '11 · la prima bozza è sparita'; end if;

  -- 12 · un provider inventato non passa
  begin
    insert into news_articles (league_id, matchday_id, spunti, corpo, testo, provider)
    values ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002',
            '[]'::jsonb, '{}'::jsonb, 'boh', 'oracolo');
    raise exception '12 · un provider sconosciuto è stato accettato';
  exception when check_violation then null; end;

  -- 13 · i soprannomi: uno per squadra, e l'array parte vuoto
  insert into team_flavour (team_id, league_id, soprannomi, intoccabile)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
          array['gli Alfisti', 'quelli del 4-4-2'], 'il cognato');
  begin
    insert into team_flavour (team_id, league_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
    raise exception '13 · due schede soprannomi per la stessa squadra';
  exception when unique_violation then null; end;

  -- 14 · le colonne nuove di fixtures accettano il riepilogo di squadra
  update fixtures set home_modulo = '442', home_solo_voti = 69,
         home_modificatore = 0.5, home_bonus_capitano = 1,
         home_inviata_at = '2026-08-28 13:22:08+02', tabellino_at = now()
   where id = 'ffffffff-0000-0000-0000-000000000001';
  select (home_modulo = '442' and home_solo_voti = 69) into ok from fixtures
   where id = 'ffffffff-0000-0000-0000-000000000001';
  if not ok then raise exception '14 · il riepilogo di squadra non è stato salvato'; end if;

  -- 15 · cancellare la sfida porta via il suo tabellino, non la squadra
  delete from fixtures where id = 'ffffffff-0000-0000-0000-000000000001';
  select count(*) into n from lineup_entries;
  if n <> 0 then raise exception '15 · sono rimaste % righe di tabellino orfane', n; end if;
  select count(*) into n from teams;
  if n <> 2 then raise exception '15 · le squadre sono state toccate'; end if;

  -- 16 · un import si salva anche senza lega riconosciuta: non si perde niente
  insert into redazione_imports (lega_alias, competizione, giornata, payload)
  values ('lega-mai-vista', '999999', 1, '{"sfide":[]}'::jsonb);
  select count(*) into n from redazione_imports where league_id is null;
  if n <> 1 then raise exception '16 · un import senza lega non è stato salvato'; end if;

  -- 17 · passando a importato, la data se la mette il trigger
  insert into redazione_imports (id, league_id, matchday_id, payload, conti_ok, conti_totali)
  values ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
          'dddddddd-0000-0000-0000-000000000002', '{"sfide":[]}'::jsonb, 8, 8);
  update redazione_imports set stato = 'importato'
   where id = '99999999-0000-0000-0000-000000000001';
  select (importato_il is not null) into ok from redazione_imports
   where id = '99999999-0000-0000-0000-000000000001';
  if not ok then raise exception '17 · la data di import non è stata messa'; end if;

  -- 18 · uno scarto senza motivo non passa
  begin
    update redazione_imports set stato = 'scartato', errore = null
     where id = '99999999-0000-0000-0000-000000000001';
    raise exception '18 · un import scartato senza motivo è stato accettato';
  exception when check_violation then null; end;

  raise notice 'Redazione: 18 verifiche passate.';
end $$;

rollback;
