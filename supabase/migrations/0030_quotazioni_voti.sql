-- =====================================================================
-- Quotazioni aggiornate e voti di Serie A
-- =====================================================================
-- Due raccolte nuove da fantacalcio.it, con lo stesso spirito degli
-- indisponibili (0021): dato di Serie A e non di lega, letto da tutti gli
-- autenticati, scritto solo dal service role.
--
--  1. Le quotazioni (fantacalcio.it/quotazioni-fantacalcio). `players.quotation`
--     resta quella dell'export della lega: è il dato con cui si sono fatte
--     le aste e non va toccato da una pagina esterna. La quotazione
--     aggiornata è un dato in più, accanto, e il motore delle quote del
--     Torneo dei Tipster la preferisce quando c'è.
--  2. I voti di giornata (fantacalcio.it/voti-fantacalcio-serie-a): servono
--     a stimare la forma di un giocatore. Chi è in forma prende voti
--     migliori e segna di più, e una fantamedia recente dice più di una
--     quotazione d'agosto.
--
-- L'aggancio ai nostri giocatori è l'id di fantacalcio.it, che è lo stesso
-- `ext_id` del listone della lega (Leghe Fantacalcio usa gli stessi id).
-- Quando l'id non combacia si prova con nome e club; quando non combacia
-- niente la riga resta comunque, con `player_id` null e il nome della fonte.
-- =====================================================================

-- ------------------------------------------------------ le quotazioni
-- Una riga per giocatore di Serie A, sovrascritta a ogni raccolta: della
-- quotazione serve l'ultima, e la differenza con quella iniziale la dà già
-- la fonte.
create table if not exists player_prices (
  ext_id       text primary key,
  player_id    uuid references players(id) on delete set null,
  nome_fonte   text not null,
  club_fonte   text not null,
  ruolo        char(1) check (ruolo in ('P','D','C','A')),
  qt_iniziale  int,
  qt_attuale   int not null,
  fvm          int,
  updated_at   timestamptz not null default now()
);
create index if not exists player_prices_player_idx on player_prices (player_id) where player_id is not null;

-- ------------------------------------------------------ i voti
-- Una riga per giocatore e giornata. La giornata è quella di Serie A, la
-- stagione è scritta come la scrive la fonte («2026/27»): rileggere una
-- giornata la sovrascrive, non la duplica.
create table if not exists player_votes (
  stagione     text not null,
  giornata     int  not null check (giornata between 1 and 38),
  ext_id       text not null,
  player_id    uuid references players(id) on delete set null,
  nome_fonte   text not null,
  club_fonte   text not null,
  ruolo        char(1) check (ruolo in ('P','D','C','A')),
  -- null = senza voto: ha giocato troppo poco, o non è entrato
  voto         numeric(4,2) check (voto >= 0 and voto <= 10),
  fantavoto    numeric(5,2),
  updated_at   timestamptz not null default now(),
  primary key (stagione, giornata, ext_id)
);
create index if not exists player_votes_player_idx on player_votes (player_id, giornata) where player_id is not null;

-- ------------------------------------------------------ il registro delle raccolte
-- Quando è stata letta l'ultima volta ciascuna pagina, e con che esito: un
-- crollo delle righe agganciate è il sintomo di una pagina cambiata.
create table if not exists source_runs (
  id          uuid primary key default gen_random_uuid(),
  fonte       text not null check (fonte in ('quotazioni','voti')),
  fetched_at  timestamptz not null default now(),
  righe       int not null default 0,
  agganciate  int not null default 0,
  nota        text
);
create index if not exists source_runs_idx on source_runs (fonte, fetched_at desc);

alter table player_prices enable row level security;
alter table player_votes  enable row level security;
alter table source_runs   enable row level security;

create policy "le quotazioni le legge chi è dentro" on player_prices
  for select using (auth.uid() is not null);
create policy "i voti li legge chi è dentro" on player_votes
  for select using (auth.uid() is not null);
create policy "le raccolte le legge chi è dentro" on source_runs
  for select using (auth.uid() is not null);
