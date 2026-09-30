-- =====================================================================
-- La Gazzetta — l'edizione del mercato chiuso
-- =====================================================================
-- Le indiscrezioni escono quando chiudono le chiamate; questa esce quando
-- chiude la sala d'asta, e racconta le stesse aste a cose fatte. Sono due
-- pagine diverse sulla stessa sessione, quindi devono poter convivere: il
-- trigger delle versioni conta per (lega, tipo, giornata), e con lo stesso
-- tipo la seconda avrebbe soprascritto la numerazione della prima.
--
-- `gazzette` non cambia forma: cambia solo cosa può contenere.

alter table gazzette drop constraint if exists gazzette_tipo_check;

alter table gazzette add constraint gazzette_tipo_check
  check (tipo in ('settimanale', 'coppa', 'fantamercato', 'mercato_chiuso'));
