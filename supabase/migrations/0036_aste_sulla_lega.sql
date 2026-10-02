-- =====================================================================
-- Le aste flash riportate su Leghe Fantacalcio
-- =====================================================================
-- Alla chiusura di un'asta l'app scrive sulla lega svincoli e acquisti,
-- come faceva l'admin a mano. Qui resta quando l'ha fatto e com'è andata:
-- un'asta già riportata non si riporta due volte, e una andata storta si
-- riprova (dal cron o dal Pannello) finché non torna.
-- =====================================================================

alter table auction_sessions add column if not exists leghe_riportata_il timestamptz;
alter table auction_sessions add column if not exists leghe_esito text;

-- le aste chiuse prima di questo automatismo le ha già riportate l'admin a
-- mano: si segnano come fatte, così il cron non ci riprova
update auction_sessions
  set leghe_riportata_il = now(), leghe_esito = 'ok: riportata a mano, prima dell''automatismo'
  where status = 'closed' and leghe_riportata_il is null;
