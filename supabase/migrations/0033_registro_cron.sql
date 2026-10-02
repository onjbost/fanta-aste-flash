-- =====================================================================
-- Il registro dei giri sulla giornata
-- =====================================================================
-- Ogni volta che il cron (o l'admin, dal Pannello amministratore) prova a
-- calcolare e importare una giornata da Leghe Fantacalcio, qui resta una
-- riga con i passi fatti e com'è andata: le partite erano finite? la lega
-- ha calcolato? quante sfide sono state scritte? È quello che si guarda
-- quando la mattina dopo i risultati non ci sono.
--
-- La legge e la scrive solo il server: RLS accesa, nessuna policy.
-- =====================================================================

create table if not exists cron_log (
  id           uuid primary key default gen_random_uuid(),
  creato_il    timestamptz not null default now(),
  -- chi l'ha fatto partire
  origine      text not null check (origine in ('cron', 'manuale', 'reimport')),
  competizione text not null check (competizione in ('campionato', 'coppa')),
  -- la giornata della lega (per la coppa il turno) e quella di Serie A
  giornata     int not null,
  serie_a      int,
  esito        text not null check (esito in ('ok', 'ko', 'info')),
  -- [{ nome, esito, dettaglio }]
  passi        jsonb not null default '[]'::jsonb
);
create index if not exists cron_log_giornata_idx on cron_log (competizione, giornata, creato_il desc);

alter table cron_log enable row level security;
