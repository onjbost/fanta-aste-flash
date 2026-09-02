-- =====================================================================
-- La Redazione — tabellini, spunti e notizie della giornata
-- =====================================================================
-- Principi, gli stessi delle migrazioni precedenti:
--   * niente si cancella: reimportare una giornata corregge le righe, e
--     ogni riscrittura del pezzo è una versione in più, non una di meno
--   * gli spunti si congelano dentro l'articolo: rigenerare la prosa non
--     ricalcola i fatti, così due bozze sono confrontabili
--   * quello che è dell'admin lo protegge il database, non l'interfaccia:
--     i soprannomi e le bozze non li vede la lega
-- =====================================================================

-- ------------------------------------------------ impostazioni di lega
alter table leagues
  add column if not exists redazione_tono           int  not null default 4,
  add column if not exists redazione_min_parole     int  not null default 150,
  add column if not exists redazione_parole_vietate text[] not null default '{}';

do $$ begin
  alter table leagues add constraint leagues_redazione_tono_range
    check (redazione_tono between 1 and 5);
exception when duplicate_object then null; end $$;

comment on column leagues.redazione_tono is
  'quanto è cattivo il pezzo, da 1 (bonario) a 5 (nessuna pietà); 4 = cronaca velenosa';
comment on column leagues.redazione_min_parole is
  'parole minime per ogni sfida: sotto questa soglia il pezzo si rigenera';

-- --------------------------------------- il riepilogo di squadra
-- Il risultato e i fantapunti stanno già su fixtures dalla 0008. Qui si
-- aggiunge quello che serve a raccontare *come* è andata: il modulo, i
-- pezzi che compongono il totale, e l'ora in cui è arrivata la
-- formazione — che è materiale da presa in giro quanto un brutto voto.
alter table fixtures
  add column if not exists home_modulo         text,
  add column if not exists away_modulo         text,
  add column if not exists home_solo_voti      numeric(6,2),
  add column if not exists away_solo_voti      numeric(6,2),
  add column if not exists home_modificatore   numeric(5,2),
  add column if not exists away_modificatore   numeric(5,2),
  add column if not exists home_bonus_capitano numeric(5,2),
  add column if not exists away_bonus_capitano numeric(5,2),
  add column if not exists home_inviata_at     timestamptz,
  add column if not exists away_inviata_at     timestamptz,
  add column if not exists tabellino_at        timestamptz;

comment on column fixtures.tabellino_at is
  'quando è stato importato il tabellino giocatore per giocatore; null = solo il risultato';

-- --------------------------------------------- il tabellino, riga per riga
-- Una riga per giocatore schierato. `player_name` è il nome come appare
-- sulla pagina della lega: è la chiave con cui il parser lavora, e resta
-- anche quando l'aggancio al listone non riesce (nomi abbreviati,
-- omonimi, giocatori arrivati a gennaio). `player_id` è l'aggancio, e può
-- essere null senza che si perda niente del racconto.
create table lineup_entries (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  fixture_id   uuid not null references fixtures(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  slot         int  not null check (slot > 0),
  player_name  text not null,
  player_id    uuid references players(id) on delete set null,
  role         char(1) check (role in ('P','D','C','A')),
  starter      boolean not null,
  -- panchinaro entrato al posto di un titolare senza voto
  entered      boolean not null default false,
  is_captain   boolean not null default false,
  -- null quando è senza voto: è un'informazione, non un buco
  voto         numeric(4,2) check (voto >= 0 and voto <= 10),
  fantavoto    numeric(5,2),
  -- {"gol":1,"assist":0,"amm":1,"esp":0,"rig_segnati":0,"rig_sbagliati":0,
  --  "rig_parati":0,"autogol":0,"gol_subiti":2,"portiere_imbattuto":false}
  bonus        jsonb not null default '{}'::jsonb,
  -- ha davvero contribuito al totale: un titolare sostituito non conta
  counted      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (fixture_id, team_id, slot),
  -- la fascia si dà a un titolare: se il parser dice altro, ha sbagliato
  check (not is_captain or starter),
  -- solo un panchinaro può subentrare
  check (not entered or not starter)
);
create index lineup_entries_fixture_idx on lineup_entries (fixture_id);
create index lineup_entries_team_idx    on lineup_entries (team_id);
create index lineup_entries_player_idx  on lineup_entries (league_id, player_id);

-- Un solo capitano per squadra e per sfida.
create unique index lineup_entries_un_capitano
  on lineup_entries (fixture_id, team_id) where is_captain;

-- ------------------------------------------------------- i soprannomi
-- La differenza fra un pezzo generico e uno che sembra scritto da uno
-- della lega. `intoccabile` è la valvola di sicurezza: quello di cui non
-- si scherza, per quella squadra, qualunque sia il tono.
create table team_flavour (
  team_id      uuid primary key references teams(id) on delete cascade,
  league_id    uuid not null references leagues(id) on delete cascade,
  soprannomi   text[] not null default '{}',
  tormentoni   text,
  punti_deboli text,
  intoccabile  text,
  updated_at   timestamptz not null default now()
);

comment on column team_flavour.intoccabile is
  'argomenti da non toccare per questa squadra: finiscono nel prompt come divieto';

-- --------------------------------------------------------- gli articoli
-- Ogni rigenerazione è una versione nuova. «Più cattivo» non distrugge la
-- bozza di prima: la si può sempre rileggere e mandare quella.
create table news_articles (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  versione     int  not null default 1 check (versione > 0),
  -- gli spunti calcolati, congelati: la prosa si riscrive su questi
  spunti       jsonb not null,
  -- {apertura, sfide:[{fixtureId, testo}], classifica, tipster}
  corpo        jsonb not null,
  -- il messaggio montato, pronto da mandare
  testo        text  not null,
  tono         int   not null default 4 check (tono between 1 and 5),
  provider     text  not null check (provider in ('gemini','template')),
  model        text,
  -- esito dei controlli: parole per sfida, numeri inventati, parole vietate
  verifica     jsonb,
  generated_at timestamptz not null default now(),
  approved_at  timestamptz,
  sent_at      timestamptz,
  unique (matchday_id, versione)
);
create index news_articles_matchday_idx on news_articles (matchday_id, versione desc);

-- La versione si assegna da sola: chi scrive non deve contare.
create or replace function fn_news_versione() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.versione is null or new.versione = 1 then
    select coalesce(max(versione), 0) + 1 into new.versione
      from news_articles where matchday_id = new.matchday_id;
  end if;
  return new;
end $$;

create trigger news_articles_versione before insert on news_articles
  for each row execute function fn_news_versione();

-- ------------------------------------------------------------------ RLS
alter table lineup_entries enable row level security;
alter table team_flavour   enable row level security;
alter table news_articles  enable row level security;

-- I tabellini sono pubblici in lega, come le rose: sono già visibili sul
-- sito della lega, nasconderli qui sarebbe teatro.
create policy "la lega legge i tabellini" on lineup_entries
  for select using (league_id = my_league_id());
create policy "admin gestisce i tabellini" on lineup_entries
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

-- I soprannomi e le bozze restano dell'admin: sono gli appunti di chi
-- scrive, e leggerli prima toglierebbe il gusto al messaggio della
-- domenica sera.
create policy "admin gestisce i soprannomi" on team_flavour
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

create policy "admin gestisce gli articoli" on news_articles
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());
