-- =====================================================================
-- Gli stemmi delle squadre
-- =====================================================================
-- Il redesign mette lo stemma ovunque compare una squadra: banner partita,
-- classifiche, sala, cassetto. Li carica a mano l'admin dalla pagina
-- Allenatori; finché una squadra non ce l'ha, l'app mostra le iniziali.
--
-- Il file sta nel bucket pubblico `stemmi` (lettura per chiunque abbia
-- l'indirizzo: è un logo, non un dato riservato). Nessuna policy di
-- scrittura: carica e cancella solo il server, con la chiave di servizio,
-- dopo aver controllato che chi chiede sia l'admin della lega.
-- =====================================================================

alter table teams add column if not exists logo_url text;

comment on column teams.logo_url is
  'Indirizzo pubblico dello stemma nel bucket «stemmi». Null: si mostrano le iniziali.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stemmi', 'stemmi', true, 524288,
  array['image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
