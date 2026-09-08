-- =====================================================================
-- La Redazione — le classifiche vere della lega, e la coppa
-- =====================================================================
-- Fin qui la classifica ce la calcolavamo noi dai risultati importati: tre
-- punti a vittoria, uno a pareggio, i fantapunti a spareggio. Funziona finché
-- non succede niente — ma una penalità, un punto extra, una partita a tavolino
-- o una regola di spareggio diversa dalla nostra e il pezzo racconta una
-- classifica che non è quella che i partecipanti hanno sotto gli occhi.
--
-- Quella non è un'imprecisione: è il messaggio che perde credibilità. Quindi
-- adesso la classifica **si legge dalla lega**, insieme al tabellino, e si
-- archivia giornata per giornata. La nostra resta come rete di sicurezza per
-- le giornate raccolte prima di questa migrazione.
--
-- Una fotografia per giornata e per competizione: la coppa ne porta due, una
-- per gruppo. Confrontando la fotografia di ieri con quella di oggi si sa chi
-- ha scavalcato chi, senza ricostruirlo a mano.
-- =====================================================================

create table standings_snapshots (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  competition  text not null check (competition in ('campionato','coppa')),
  -- 'A' o 'B' nella fase a gruppi della coppa, stringa vuota nel campionato.
  -- Vuota e non null perché il gruppo entra nella chiave che tiene una sola
  -- riga per squadra, e in una chiave un null non è mai uguale a se stesso:
  -- reimportare accumulerebbe copie invece di aggiornarle.
  group_name   text not null default '' check (group_name in ('','A','B')),
  -- il nome è quello scritto dalla lega: resta anche se la squadra si
  -- rinomina o non la riconosciamo, perché è la fonte
  team_name    text not null,
  team_id      uuid references teams(id) on delete set null,
  posizione    int  not null check (posizione > 0),
  giocate      int,
  vinte        int,
  pari         int,
  perse        int,
  gol_fatti    int,
  gol_subiti   int,
  differenza   int,
  punti        numeric(7,2),
  fantapunti   numeric(9,2),
  rilevato_il  timestamptz not null default now()
);

-- Una riga per squadra dentro la stessa fotografia: reimportare la giornata
-- aggiorna, non accumula.
alter table standings_snapshots
  add constraint standings_snapshots_riga_key
  unique (matchday_id, competition, group_name, team_name);
create index standings_snapshots_lega_idx
  on standings_snapshots (league_id, competition, matchday_id);

comment on table standings_snapshots is
  'la classifica come la scrive la lega, fotografata a ogni import: è la fonte per il pezzo, la nostra è solo il ripiego';
comment on column standings_snapshots.team_id is
  'agganciata per nome quando ci riusciamo; null non invalida la riga, il nome basta a raccontarla';

alter table standings_snapshots enable row level security;

-- Le classifiche le vedono tutti quelli della lega: sono già pubbliche sul
-- sito della lega, nasconderle qui non proteggerebbe niente.
create policy "la lega legge le classifiche" on standings_snapshots
  for select using (league_id = my_league_id());

-- Scriverle è dell'import, che passa dalla service role.
create policy "l'admin gestisce le classifiche" on standings_snapshots
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

-- ---------------------------------------------------------------------
-- Un import corretto a mano non è né importato né scartato
-- ---------------------------------------------------------------------
-- La pagina di correzione manda una copia sistemata come import nuovo e segna
-- l'originale. Quello stato mancava all'elenco e l'aggiornamento cadeva in
-- silenzio: la riga restava 'scartato' e sembrava che la correzione non fosse
-- mai partita.
alter table redazione_imports drop constraint if exists redazione_imports_stato_check;
alter table redazione_imports add constraint redazione_imports_stato_check
  check (stato in ('ricevuto','importato','scartato','corretto'));

-- Anche la correzione è una decisione, e va motivata come lo scarto.
alter table redazione_imports drop constraint if exists redazione_imports_check;
alter table redazione_imports add constraint redazione_imports_motivo_check
  check (stato not in ('scartato','corretto') or errore is not null);
