-- =====================================================================
-- Listone e rose da Leghe Fantacalcio
-- =====================================================================
-- Il registro delle raccolte conta anche le letture di listone e rose
-- dalla lega, fatte dal cron del mattino o dai pulsanti del Pannello.
-- =====================================================================

alter table source_runs drop constraint if exists source_runs_fonte_check;
alter table source_runs add constraint source_runs_fonte_check
  check (fonte in ('quotazioni', 'voti', 'formazioni', 'giornata', 'statistiche', 'listone', 'rose'));
