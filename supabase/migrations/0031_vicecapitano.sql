-- =====================================================================
-- Il vicecapitano nel tabellino
-- =====================================================================
-- Il fattore capitano si calcola sul voto del capitano e, se il capitano
-- resta senza voto, su quello del vicecapitano. La fascia «V» il preferito
-- la leggeva già dalla pagina della lega, ma finora si scriveva solo la «C»:
-- la diretta non poteva sapere a chi passare il fattore.
-- =====================================================================

alter table lineup_entries add column if not exists is_vice boolean not null default false;

comment on column lineup_entries.is_vice is
  'Vicecapitano: il fattore capitano passa a lui quando il capitano non prende voto.';
