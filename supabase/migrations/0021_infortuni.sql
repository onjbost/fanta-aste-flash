-- =====================================================================
-- Gli indisponibili di Serie A
-- =====================================================================
-- Una raccolta settimanale da fantacalcio.it/indisponibili-serie-a. Serve a
-- tre cose che l'app oggi fa al buio:
--
--  1. le quote del Torneo dei Tipster leggono le rose intere e non sanno
--     quali undici sono davvero schierabili;
--  2. lo svincolo gratuito per infortunio oltre i due mesi lo verifica
--     l'admin a mano, cercandosi la notizia;
--  3. la Redazione racconta la giornata senza sapere chi era fuori.
--
-- Il dato NON è di lega: è Serie A. Per questo non c'è `league_id` e la
-- lettura è aperta a chiunque sia autenticato, mentre a scrivere è solo il
-- service role (il cron), che salta le policy.
--
-- Ogni raccolta è una fotografia a sé: non si aggiorna una riga, se ne
-- scrive una nuova. Così «cosa sapevamo mercoledì scorso» resta leggibile,
-- che è l'unico modo di capire perché una quota di due settimane fa era
-- quella che era.

create table injury_reports (
  id          uuid primary key default gen_random_uuid(),
  fetched_at  timestamptz not null default now(),
  fonte       text not null,
  -- quante righe ha prodotto il parser: un crollo improvviso è il sintomo
  -- che la pagina è cambiata e il parser non se n'è accorto
  righe       int not null default 0,
  -- quante di quelle righe è stato possibile agganciare a un nostro giocatore
  agganciate  int not null default 0,
  created_at  timestamptz not null default now()
);

create table injuries (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references injury_reports(id) on delete cascade,
  club           text not null,
  -- il nome come lo scrive la fonte, sempre conservato anche quando
  -- l'aggancio riesce: se domani cambiano convenzione, è da qui che si
  -- riparte per capire cosa non combacia più
  nome_fonte     text not null,
  player_id      uuid references players(id) on delete set null,
  categoria      text not null
                 check (categoria in ('infortunato','squalificato','in_dubbio','diffidato')),
  descrizione    text not null,
  -- la data dedotta dalla prosa («rientro dalla fine di novembre»), e la
  -- frase originale. La frase c'è sempre, la data no: l'app propone, non
  -- decide, e all'admin si mostra sempre la frase vera accanto alla stima
  rientro_stimato date,
  rientro_testo   text,
  created_at     timestamptz not null default now()
);

create index injuries_report_idx on injuries (report_id);
create index injuries_player_idx on injuries (player_id) where player_id is not null;

alter table injury_reports enable row level security;
alter table injuries enable row level security;

create policy "gli indisponibili li legge chi è dentro" on injury_reports
  for select using (auth.uid() is not null);
create policy "gli indisponibili li legge chi è dentro" on injuries
  for select using (auth.uid() is not null);

-- L'ultima fotografia, che è quella che serve quasi sempre.
create view v_indisponibili_ultimi as
select i.*, r.fetched_at
from injuries i
join injury_reports r on r.id = i.report_id
where r.id = (select id from injury_reports order by fetched_at desc limit 1);
