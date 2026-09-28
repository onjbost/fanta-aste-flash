-- =====================================================================
-- La Gazzetta della Mansarda
-- =====================================================================
-- La prima pagina che sostituisce il messaggione nel gruppo. Due tabelle,
-- con due nature diverse.
--
-- `news_photos` è materiale di Serie A, non di lega: le foto d'azione
-- pescate dalle news di fantacalcio.it. Niente `league_id`, lettura aperta
-- a chi è autenticato, scrittura al solo service role (il cron) — la stessa
-- forma degli indisponibili nella 0021.
--
-- `gazzette` invece è roba dell'admin, come le bozze della Redazione: la
-- prima pagina si legge la domenica sera nel gruppo, non il sabato
-- nell'app. Ogni rigenerazione è una versione in più, mai una di meno.
--
-- Il PNG non si salva da nessuna parte: si rende al volo da `dati` quando
-- l'admin lo scarica. Così non può mai esistere un'immagine che mostra un
-- testo diverso da quello che l'admin ha appena corretto.

-- ---------------------------------------------- le foto delle news
-- Una riga per articolo, non per raccolta: un articolo pubblicato non
-- cambia più, quindi rileggere l'indice la settimana dopo deve aggiungere
-- le nuove e lasciare stare le vecchie. Da qui l'unicità sull'URL.
--
-- Si conserva il materiale grezzo — titolo e indirizzo dell'immagine — e
-- basta. L'abbinamento fra giocatore e foto lo fa `scegliFoto` leggendo il
-- titolo e il nome del file: tenere qui anche i cognomi già estratti
-- vorrebbe dire avere due implementazioni della stessa regola, che dopo tre
-- modifiche non sarebbero più d'accordo.
create table news_photos (
  id            uuid primary key default gen_random_uuid(),
  articolo_url  text not null unique,
  -- dalla forma dell'URL, quando c'è: /news/<sezione>/27_09_2026/...
  pubblicata_il date,
  immagine_url  text not null,
  titolo        text not null,
  -- le misure dell'immagine, lette dai suoi primi byte al momento della
  -- raccolta. Servono a decidere la disposizione in pagina e a calcolare il
  -- ritaglio: senza, una foto verticale finirebbe stirata a tutta larghezza
  larghezza     int,
  altezza       int,
  raccolta_il   timestamptz not null default now()
);

create index news_photos_data_idx on news_photos (pubblicata_il desc nulls last);

comment on table news_photos is
  'foto d''azione dalle news di fantacalcio.it, per l''apertura della Gazzetta';

-- --------------------------------------------------- le prime pagine
create table gazzette (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  -- null per l'edizione fantamercato, che non è legata a una giornata
  matchday_id  uuid references matchdays(id) on delete cascade,
  tipo         text not null check (tipo in ('settimanale', 'fantamercato')),
  versione     int  not null default 1 check (versione > 0),
  -- il `DatiPrima` per intero: è quello che l'editor modifica e che il PNG
  -- rende. Testi e foto insieme, perché una prima pagina è l'uno e
  -- l'altra: separarli vorrebbe dire poterli disallineare
  dati         jsonb not null,
  -- cosa ha detto la verifica, per mostrarlo all'admin accanto all'anteprima
  verifica     jsonb,
  provider     text not null check (provider in ('gemini', 'template')),
  model        text,
  generated_at timestamptz not null default now(),
  -- quando l'admin ha messo mano ai testi: da lì in poi quello che sta in
  -- `verifica` parla di un'altra versione, e l'interfaccia deve dirlo
  edited_at    timestamptz,
  approved_at  timestamptz,
  sent_at      timestamptz
);

create index gazzette_matchday_idx on gazzette (matchday_id, versione desc);
create index gazzette_league_idx   on gazzette (league_id, generated_at desc);

-- La versione si assegna da sola, come per gli articoli. Le edizioni senza
-- giornata (il fantamercato) contano per conto loro: `matchday_id is null`
-- non si confronta con `=`, e senza `is not distinct from` partirebbero
-- tutte da 1.
create or replace function fn_gazzetta_versione() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.versione is null or new.versione = 1 then
    select coalesce(max(versione), 0) + 1 into new.versione
      from gazzette
     where league_id = new.league_id
       and tipo = new.tipo
       and matchday_id is not distinct from new.matchday_id;
  end if;
  return new;
end $$;

create trigger gazzette_versione before insert on gazzette
  for each row execute function fn_gazzetta_versione();

-- ------------------------------------------------------------------ RLS
alter table news_photos enable row level security;
alter table gazzette    enable row level security;

create policy "le foto le legge chi è dentro" on news_photos
  for select using (auth.uid() is not null);

create policy "admin gestisce le gazzette" on gazzette
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());
