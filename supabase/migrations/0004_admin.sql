-- =====================================================================
-- Correzioni dell'admin
-- =====================================================================
-- Le rose si possono correggere a mano o ri-sincronizzare da un nuovo
-- export della lega. In entrambi i casi non si cancella niente: si chiude
-- un contratto con causale 'correction' e si registra il movimento di
-- credito che compensa. Il saldo resta sempre la somma dei movimenti, e
-- l'audit log racconta chi ha cambiato cosa.
-- =====================================================================

alter table contracts drop constraint if exists contracts_release_type_check;
alter table contracts add constraint contracts_release_type_check
  check (release_type in ('flash_75','free_100','trade','repair','correction'));

alter table contracts drop constraint if exists contracts_acquisition_type_check;
alter table contracts add constraint contracts_acquisition_type_check
  check (acquisition_type in ('initial_auction','flash_auction','trade','repair_auction','correction'));

-- una correzione dei crediti ha bisogno di dire perché
comment on column credit_movements.note is
  'Sempre compilata per reason = adjustment: è la spiegazione che l''admin lascia alla lega.';

-- il registro delle correzioni è pubblico dentro la lega: se l'admin gioca,
-- gli altri devono poter vedere cosa ha toccato
drop policy if exists "log solo admin" on audit_log;
create policy "il registro delle correzioni è di tutti" on audit_log
  for select using (league_id = my_league_id());
