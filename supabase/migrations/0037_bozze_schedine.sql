-- =====================================================================
-- Le bozze delle schedine
-- =====================================================================
-- «Salva» tiene le scelte senza giocarle: solo quali esiti, nessun prezzo,
-- perché una schedina non giocata segue sempre le quote di adesso. La
-- schedina vera resta in slips/picks, coi prezzi congelati quando si gioca.
-- Una bozza per squadra e giornata; giocando si cancella.
--
-- La legge e la scrive solo il server (service role), dopo aver
-- riconosciuto la squadra: niente policy per i client.
-- =====================================================================

create table if not exists slip_drafts (
  team_id     uuid not null references teams(id) on delete cascade,
  matchday_id uuid not null references matchdays(id) on delete cascade,
  -- [{ "fixtureId": "…", "market": "1x2", "selection": "1" }, …]
  picks       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (team_id, matchday_id)
);

alter table slip_drafts enable row level security;
