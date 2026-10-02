-- =====================================================================
-- L'accesso a Leghe Fantacalcio, senza preferito
-- =====================================================================
-- Formazioni, giornate concluse e classifiche l'app le legge da sola
-- dall'API di Leghe Fantacalcio (apileague.fantacalcio.it), la stessa che
-- usa il sito. Per farlo le serve il token di sessione di un account della
-- lega: l'admin lo copia dal browser e lo incolla in /admin/redazione.
--
-- Il token è una credenziale. La tabella ha la RLS accesa e nessuna policy:
-- nessun utente la legge, nemmeno l'admin dal browser. La legge e la scrive
-- solo il server, con la chiave di servizio.
-- =====================================================================

create table if not exists leghe_accesso (
  id            smallint primary key default 1 check (id = 1),
  token         text not null,
  -- dal token stesso: per quale lega vale e quando scade
  lega_id       bigint,
  scade_il      timestamptz,
  aggiornato_il timestamptz not null default now()
);

alter table leghe_accesso enable row level security;

-- il registro delle raccolte conta anche le letture dalla lega
alter table source_runs drop constraint if exists source_runs_fonte_check;
alter table source_runs add constraint source_runs_fonte_check
  check (fonte in ('quotazioni', 'voti', 'formazioni', 'giornata'));
