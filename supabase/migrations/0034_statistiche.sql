-- =====================================================================
-- Le statistiche di stagione dei giocatori di Serie A
-- =====================================================================
-- Dalla pagina «Statistiche Serie A» di fantacalcio.it: partite a voto,
-- media voto, fantamedia, gol, gol subiti, rigori, rigori parati, assist,
-- ammonizioni ed espulsioni. Una riga per giocatore, sovrascritta a ogni
-- raccolta, agganciata ai nostri giocatori come le quotazioni.
--
-- Gli autogol la pagina non li ha: l'app li conta dai tabellini della lega.
-- =====================================================================

create table if not exists player_stats (
  ext_id          text primary key,
  player_id       uuid references players(id) on delete set null,
  stagione        text not null,
  nome_fonte      text not null,
  club_fonte      text not null,
  ruolo           char(1) check (ruolo in ('P','D','C','A')),
  presenze        int,
  media_voto      numeric(4,2),
  fantamedia      numeric(5,2),
  gol             int,
  gol_subiti      int,
  rigori_segnati  int,
  rigori_calciati int,
  rigori_parati   int,
  assist          int,
  ammonizioni     int,
  espulsioni      int,
  updated_at      timestamptz not null default now()
);
create index if not exists player_stats_player_idx on player_stats (player_id) where player_id is not null;

alter table player_stats enable row level security;

drop policy if exists "le statistiche le legge chi è dentro" on player_stats;
create policy "le statistiche le legge chi è dentro" on player_stats
  for select using (auth.uid() is not null);

-- il registro delle raccolte conta anche le statistiche
alter table source_runs drop constraint if exists source_runs_fonte_check;
alter table source_runs add constraint source_runs_fonte_check
  check (fonte in ('quotazioni', 'voti', 'formazioni', 'giornata', 'statistiche'));
