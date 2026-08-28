-- =====================================================================
-- Ricostruzione della vista degli svincolati
-- =====================================================================
-- La vista era nata come "select p.*": Postgres espande l'asterisco al
-- momento della creazione e poi congela l'elenco. Le colonne aggiunte
-- dopo — out_of_list e locked_until_number — non ne facevano parte, e
-- l'app che le chiedeva riceveva un errore, quindi una lista vuota.
--
-- Da qui in avanti le colonne sono scritte una per una: se domani se ne
-- aggiunge un'altra, va aggiunta anche qui, ma almeno il problema si
-- vede subito invece di manifestarsi come "non ci sono svincolati".
-- =====================================================================

drop view if exists v_free_agents;

create view v_free_agents as
select
  p.id,
  p.league_id,
  p.ext_id,
  p.name,
  p.role,
  p.club,
  p.quotation,
  p.status,
  p.status_note,
  p.status_until,
  p.signing_window,
  p.out_of_list,
  p.locked_until_number,
  p.updated_at
from players p
where not exists (
  select 1 from contracts c
  where c.player_id = p.id and c.released_at is null
);

comment on view v_free_agents is
  'Giocatori senza un contratto aperto. Colonne esplicite: aggiungerle qui quando si aggiungono a players.';

-- controllo immediato: se manca una colonna, la migrazione fallisce adesso
-- invece di lasciare l'app con una lista vuota e nessuna spiegazione
do $$
declare mancanti text;
begin
  select string_agg(c.column_name, ', ')
    into mancanti
  from information_schema.columns c
  where c.table_name = 'players'
    and c.table_schema = 'public'
    and c.column_name not in (
      select v.column_name from information_schema.columns v
      where v.table_name = 'v_free_agents' and v.table_schema = 'public'
    );
  if mancanti is not null then
    raise exception 'v_free_agents non espone queste colonne di players: %', mancanti;
  end if;
  raise notice 'v_free_agents allineata a players';
end $$;
