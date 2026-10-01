-- =====================================================================
-- Il registro della lega, e l'username di chi agisce
-- =====================================================================
-- Una riga per ogni cosa che è successa, in italiano, leggibile da tutti.
--
-- La tabella tiene i FATTI, non le frasi. La frase la compone
-- `rigaDelRegistro` in src/lib/registro.ts, una funzione pura con i suoi
-- test: così correggere una formulazione sistema tutto il registro —
-- comprese le righe di tre mesi fa — senza una migrazione, e il modo in cui
-- la lega racconta le proprie azioni sta in un posto solo, come già per i
-- messaggi del gruppo e per la coda operativa.
--
-- `attore_nome` è una fotografia, non la verità: il nome da mostrare si
-- risolve in lettura da `team_members`, così chi cambia username lo vede
-- cambiato in tutto il registro. Quella colonna serve per chi non c'è più —
-- un allenatore scollegato dalla lega lascerebbe righe senza nome.
-- =====================================================================

-- ----------------------------------------------------------- l'username
-- Unico in lega e non globale: due leghe diverse possono avere lo stesso
-- «Teo» senza che si diano noia. Minuscole per il confronto, perché
-- «Teo» e «teo» sono la stessa persona per tutti tranne che per il database.
alter table team_members add column if not exists username text;

create unique index if not exists team_members_username_unico
  on team_members (league_id, lower(username))
  where username is not null;

comment on column team_members.username is
  'Come l''allenatore vuole essere chiamato nel registro. Se manca si usa l''email.';

-- ------------------------------------------------------------ il registro
create table if not exists registro (
  id            bigint generated always as identity primary key,
  league_id     uuid not null references leagues(id) on delete cascade,
  -- quando è AVVENUTA, non quando è stata scritta: il travaso dello storico
  -- mette le date vere, e il registro resta in ordine di fatti
  avvenuto_il   timestamptz not null default now(),
  azione        text not null,
  -- chi: la persona, la squadra per cui agiva, e come si chiamava allora
  attore_user   uuid,
  attore_team   uuid references teams(id) on delete set null,
  attore_nome   text,
  da_admin      boolean not null default false,
  -- gli agganci che servono ai filtri e alle frasi
  player_id     uuid references players(id) on delete set null,
  session_id    uuid references auction_sessions(id) on delete set null,
  lot_id        uuid references lots(id) on delete set null,
  -- prezzo, rimborso, controparte di uno scambio, giornata della schedina…
  dati          jsonb not null default '{}'::jsonb,
  -- impronta dell'evento per il travaso dello storico: due passaggi dello
  -- script non devono raddoppiare le righe
  impronta      text
);

comment on table registro is
  'Il registro della lega: una riga per azione, in ordine di quando è avvenuta. Le frasi le compone src/lib/registro.ts.';

create index if not exists registro_lega_tempo on registro (league_id, avvenuto_il desc);
create index if not exists registro_azione on registro (league_id, azione);
create index if not exists registro_giocatore on registro (player_id) where player_id is not null;
create index if not exists registro_squadra on registro (attore_team) where attore_team is not null;
-- Parziale: la stragrande maggioranza delle righe non ha impronta, e
-- indicizzarne i NULL non serve a nessuno. Il travaso dello storico non usa
-- `on conflict` ma un `where not exists` sull'impronta — che con un indice
-- parziale funziona, ed è comunque l'unico modo sensato qui, perché una
-- migrazione di dati gira una volta e non in concorrenza con sé stessa.
create unique index if not exists registro_impronta_unica
  on registro (impronta) where impronta is not null;

-- ------------------------------------------------------------------- RLS
alter table registro enable row level security;

-- Il registro è pubblico in lega: è il suo scopo. Nessuna policy di
-- scrittura: le righe le scrive solo il server col service role, così
-- nessuno può aggiungersi un'azione che non ha fatto o cancellarne una.
drop policy if exists "membri leggono il registro" on registro;
create policy "membri leggono il registro" on registro
  for select using (league_id = my_league_id());

-- Nessuna policy di aggiornamento su `team_members`, nemmeno per il proprio
-- username: una policy `for update using (user_id = auth.uid())` darebbe via
-- libera su TUTTA la riga, e lì dentro c'è `is_admin`. Le policy di Postgres
-- filtrano le righe, non le colonne. L'username lo scrive una server action
-- col service role, che tocca quella colonna e nient'altro.
