-- =====================================================================
-- Fantacalciomercato — l'annuncio di uno scambio chiuso
-- =====================================================================
-- Gli scambi diretti fra squadre restano fuori dall'app: li fa la lega come
-- li ha sempre fatti, e il registro delle rose è Leghe Fantacalcio. Qui non
-- entra un movimento, non si tocca un contratto, non cambia un credito.
--
-- Entra solo il *testo* dell'annuncio, come per gli altri cinque messaggi:
-- l'admin compila chi cede cosa, legge il risultato, lo incolla nel gruppo.
-- Per questo l'unica cosa da cambiare è il vincolo sui tipi ammessi.
--
-- `session_id` era già facoltativo, ed è quello che rende possibile questa
-- riga: uno scambio non appartiene a nessuna asta flash, può succedere in
-- qualunque momento della stagione.

alter table messages drop constraint if exists messages_kind_check;

alter table messages add constraint messages_kind_check
  check (kind in ('call','calls_closed','joins_closed','room_open','results','trade'));

-- I messaggi d'asta si trovano per sessione; questi no, e senza indice la
-- rubrica farebbe una scansione piena della tabella a ogni apertura.
create index if not exists messages_trade_idx
  on messages (league_id, created_at desc)
  where session_id is null;
