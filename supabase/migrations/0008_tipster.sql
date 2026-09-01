-- =====================================================================
-- Torneo dei Tipster — calendario, quote, schedine, punteggi
-- =====================================================================
-- Principi, gli stessi del mercato:
--   * la quota si congela al momento della giocata, come il prezzo di un
--     contratto: rigenerare le quote non tocca una schedina già inviata
--   * i punti non sono un campo da aggiornare a mano: si ricalcolano dai
--     risultati, e il ricalcolo è idempotente
--   * niente si cancella: una giornata si riapre, non si riscrive
-- =====================================================================

-- ------------------------------------------------ impostazioni di lega
alter table leagues
  add column if not exists tipster_lock_minutes  int     not null default 60,
  add column if not exists tipster_multiplier    numeric(5,2) not null default 10,
  add column if not exists tipster_max_picks     int     not null default 3,
  add column if not exists tipster_slips_public  boolean not null default true;

comment on column leagues.tipster_lock_minutes is
  'minuti prima della prima partita reale in cui si chiudono le schedine';
comment on column leagues.tipster_multiplier is
  'punti = moltiplicatore / n giocate sulla stessa sfida × quota';

-- ------------------------------------------------------------ giornate
-- Una riga per giornata di Serie A. `fanta` è il numero della giornata di
-- campionato corrispondente (null dove il fanta non gioca, es. la 1ª).
create table matchdays (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references leagues(id) on delete cascade,
  serie_a           int  not null check (serie_a between 1 and 38),
  fanta             int  check (fanta > 0),
  match_date        date not null,
  first_kickoff_at  timestamptz not null,
  lock_at           timestamptz not null,
  odds_published_at timestamptz,
  status            text not null default 'scheduled'
                    check (status in ('scheduled','open','locked','waiting','settled')),
  note              text,
  created_at        timestamptz not null default now(),
  unique (league_id, serie_a)
);
comment on column matchdays.status is
  'scheduled → open (quote pubblicate) → locked (schedine chiuse) → waiting (recupero) → settled';

-- ----------------------------------------------- partite di Serie A
-- Servono al motore delle quote e alla gestione dei rinvii: sono il
-- collegamento fra i club veri e le fantasquadre che li schierano.
create table serie_a_fixtures (
  id           uuid primary key default gen_random_uuid(),
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  home_club    text not null,
  away_club    text not null,
  kickoff_at   timestamptz,
  status       text not null default 'scheduled'
               check (status in ('scheduled','postponed','played')),
  postponed_to timestamptz,
  policy       text check (policy in ('six','wait')),
  updated_at   timestamptz not null default now(),
  unique (matchday_id, home_club, away_club),
  -- la politica ha senso solo su una partita rinviata
  check (policy is null or status = 'postponed')
);
comment on column serie_a_fixtures.policy is
  'six = 6 politico, la giornata si chiude lo stesso; wait = si aspetta il recupero';

-- --------------------------------------------------- sfide del fanta
-- Campionato e coppa nella stessa tabella: cambia la fase, non la meccanica.
-- Semifinali e finale nascono senza squadre: le mette l'admin quando si
-- sanno le qualificate.
create table fixtures (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  matchday_id   uuid not null references matchdays(id) on delete cascade,
  competition   text not null check (competition in ('campionato','coppa')),
  phase         text not null default 'regular'
                check (phase in ('regular','gruppi','semifinale','finale')),
  group_name    text check (group_name in ('A','B')),
  round_number  int  not null,
  slot          int  not null,
  home_team_id  uuid references teams(id) on delete restrict,
  away_team_id  uuid references teams(id) on delete restrict,
  home_goals    int check (home_goals >= 0),
  away_goals    int check (away_goals >= 0),
  home_fp       numeric(6,2),
  away_fp       numeric(6,2),
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (matchday_id, competition, slot),
  check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id),
  -- o ci sono entrambi i gol, o non c'è nessuno dei due
  check ((home_goals is null) = (away_goals is null))
);
create index fixtures_matchday_idx on fixtures (matchday_id);

-- --------------------------------------------------------------- quote
create table odds (
  id           uuid primary key default gen_random_uuid(),
  fixture_id   uuid not null references fixtures(id) on delete cascade,
  market       text not null check (market in ('1x2','ou','gg','exact')),
  selection    text not null,
  probability  numeric(7,6) not null check (probability > 0 and probability < 1),
  price        numeric(7,2) not null check (price >= 1.01),
  generated_at timestamptz not null default now(),
  unique (fixture_id, market, selection)
);
comment on table odds is
  'una riga per esito quotato; probability è quella del modello, price = 1/probability';

-- ------------------------------------------------------------ schedine
create table slips (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  points       numeric(9,2),
  unique (matchday_id, team_id)
);

create table picks (
  id          uuid primary key default gen_random_uuid(),
  slip_id     uuid not null references slips(id) on delete cascade,
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  market      text not null check (market in ('1x2','ou','gg','exact')),
  selection   text not null,
  price       numeric(7,2) not null check (price >= 1.01),
  multiplier  numeric(7,3),
  outcome     text check (outcome in ('won','lost','void')),
  points      numeric(9,2),
  created_at  timestamptz not null default now(),
  unique (slip_id, fixture_id, market, selection)
);
create index picks_fixture_idx on picks (fixture_id);

-- La sfida giocata deve appartenere alla giornata della schedina, e le
-- giocate sulla stessa sfida non possono superare il tetto di lega.
create or replace function fn_check_pick() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  md_slip uuid; md_fix uuid; tetto int; quante int; lega uuid;
begin
  select matchday_id, league_id into md_slip, lega from slips where id = new.slip_id;
  select matchday_id into md_fix from fixtures where id = new.fixture_id;
  if md_slip is distinct from md_fix then
    raise exception 'la sfida non appartiene alla giornata della schedina';
  end if;

  select tipster_max_picks into tetto from leagues where id = lega;
  select count(*) into quante from picks
   where slip_id = new.slip_id and fixture_id = new.fixture_id and id <> new.id;
  if quante + 1 > tetto then
    raise exception 'massimo % giocate per sfida', tetto;
  end if;
  return new;
end $$;

create trigger picks_check before insert or update on picks
  for each row execute function fn_check_pick();

-- La chiusura segue la prima partita reale: si aggiorna da sola quando
-- l'admin corregge l'orario o sposta una partita rinviata.
create or replace function fn_sync_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare minuti int;
begin
  select tipster_lock_minutes into minuti from leagues where id = new.league_id;
  new.lock_at := new.first_kickoff_at - make_interval(mins => coalesce(minuti, 60));
  return new;
end $$;

create trigger matchdays_lock before insert or update of first_kickoff_at on matchdays
  for each row execute function fn_sync_lock();

-- ------------------------------------------------------------- classifiche
create view v_tipster_giornata as
  select s.league_id, s.matchday_id, m.serie_a, m.fanta, s.team_id, t.name as team_name,
         coalesce(s.points, 0)                                   as punti,
         count(p.id)                                             as giocate,
         count(p.id) filter (where p.outcome = 'won')             as azzeccate
    from slips s
    join teams t     on t.id = s.team_id
    join matchdays m on m.id = s.matchday_id
    left join picks p on p.slip_id = s.id
   group by s.league_id, s.matchday_id, m.serie_a, m.fanta, s.team_id, t.name, s.points;

create view v_tipster_classifica as
  select league_id, team_id, team_name,
         sum(punti)                          as punti,
         count(*)                            as giornate,
         sum(giocate)                        as giocate,
         sum(azzeccate)                      as azzeccate,
         round(avg(punti), 2)                as media_giornata
    from v_tipster_giornata
   group by league_id, team_id, team_name;

-- ------------------------------------------------------------------ RLS
alter table matchdays        enable row level security;
alter table serie_a_fixtures enable row level security;
alter table fixtures         enable row level security;
alter table odds             enable row level security;
alter table slips            enable row level security;
alter table picks            enable row level security;

create policy "la lega legge le giornate" on matchdays
  for select using (league_id = my_league_id());
create policy "admin gestisce le giornate" on matchdays
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

create policy "la lega legge le partite di serie a" on serie_a_fixtures
  for select using (exists (select 1 from matchdays m
                             where m.id = matchday_id and m.league_id = my_league_id()));
create policy "admin gestisce le partite di serie a" on serie_a_fixtures
  for all using (is_admin() and exists (select 1 from matchdays m
                             where m.id = matchday_id and m.league_id = my_league_id()))
  with check (is_admin() and exists (select 1 from matchdays m
                             where m.id = matchday_id and m.league_id = my_league_id()));

create policy "la lega legge le sfide" on fixtures
  for select using (league_id = my_league_id());
create policy "admin gestisce le sfide" on fixtures
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

-- Le quote sono pubbliche solo da quando l'admin le pubblica.
create policy "la lega legge le quote pubblicate" on odds
  for select using (exists (
    select 1 from fixtures f join matchdays m on m.id = f.matchday_id
     where f.id = fixture_id and m.league_id = my_league_id()
       and (m.odds_published_at is not null or is_admin())));
create policy "admin gestisce le quote" on odds
  for all using (is_admin()) with check (is_admin());

-- Le schedine sono in chiaro per tutta la lega: è una scelta di regolamento
-- (tipster_slips_public). Chi vuole tornare al segreto fino alla chiusura
-- cambia questa policy, non l'interfaccia.
create policy "la lega legge le schedine" on slips
  for select using (league_id = my_league_id() and (
    (select tipster_slips_public from leagues where id = league_id)
    or team_id = my_team_id() or is_admin()
    or exists (select 1 from matchdays m where m.id = matchday_id and now() >= m.lock_at)));
create policy "la squadra gestisce la sua schedina" on slips
  for all using (team_id = my_team_id()) with check (team_id = my_team_id());
create policy "admin gestisce le schedine" on slips
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

create policy "la lega legge le giocate" on picks
  for select using (exists (select 1 from slips s where s.id = slip_id and (
    (select tipster_slips_public from leagues where id = s.league_id)
    or s.team_id = my_team_id() or is_admin()
    or exists (select 1 from matchdays m where m.id = s.matchday_id and now() >= m.lock_at))));
-- Si giocano e si cambiano solo le proprie, e solo prima della chiusura.
create policy "la squadra gestisce le sue giocate" on picks
  for all using (exists (select 1 from slips s join matchdays m on m.id = s.matchday_id
                          where s.id = slip_id and s.team_id = my_team_id() and now() < m.lock_at))
  with check (exists (select 1 from slips s join matchdays m on m.id = s.matchday_id
                          where s.id = slip_id and s.team_id = my_team_id() and now() < m.lock_at));
create policy "admin gestisce le giocate" on picks
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------- tempo reale
do $$ begin
  execute 'alter publication supabase_realtime add table odds';
  execute 'alter publication supabase_realtime add table slips';
exception when others then null;
end $$;
