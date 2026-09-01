-- =====================================================================
-- Taratura del motore delle quote
-- =====================================================================
-- Una sola colonna, staccata dalla 0008 perché quella era già stata
-- eseguita in produzione: le migrazioni non si riscrivono, si aggiungono.
--
-- A cosa serve: il modello stima i fantapunti di ogni squadra prima di
-- avere uno storico nostro. Dopo qualche giornata vera si confronta la
-- media stimata con quella osservata e si sposta tutto di qui — cambia
-- quanti gol ci si aspetta, non chi è favorito.
-- =====================================================================

alter table leagues
  add column if not exists tipster_correzione_media numeric(5,2) not null default 0;

comment on column leagues.tipster_correzione_media is
  'taratura del modello: sposta di tanti fantapunti la media di tutte le squadre';
