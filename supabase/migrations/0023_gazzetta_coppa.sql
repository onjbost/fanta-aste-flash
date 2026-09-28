-- =====================================================================
-- La Gazzetta — l'edizione di coppa
-- =====================================================================
-- Le stesse otto squadre, un altro torneo e un'altra classifica: i gironi.
-- Sulla stessa giornata escono due prime pagine, una per competizione, e
-- il vincolo sul tipo ne accettava solo due valori.
--
-- Il trigger che assegna le versioni conta già per (lega, tipo, giornata),
-- quindi la coppa si numera per conto suo senza che ci sia altro da
-- toccare: `gazzette` non cambia forma, cambia solo cosa può contenere.

alter table gazzette drop constraint if exists gazzette_tipo_check;

alter table gazzette add constraint gazzette_tipo_check
  check (tipo in ('settimanale', 'coppa', 'fantamercato'));
