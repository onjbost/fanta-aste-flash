-- =====================================================================
-- La Redazione — gli import grezzi, come sono arrivati
-- =====================================================================
-- Una riga per ogni invio del bookmarklet, salvata *prima* di provare a
-- interpretarla e comunque sia andata a finire.
--
-- Il motivo è pratico: quando l'estrattore sbaglia su un caso storto — e
-- succederà, la pagina della lega non è nostra — lo correggiamo e lo
-- rilanciamo su questa riga, invece di chiedere all'admin di riaprire la
-- lega e ricopiare una giornata di tre settimane fa.
--
-- `league_id` può restare null: se l'alias della lega non si riconosce,
-- l'import si salva lo stesso. Perdere il dato è l'unico errore che non si
-- rimedia.
-- =====================================================================

create table redazione_imports (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid references leagues(id) on delete cascade,
  matchday_id         uuid references matchdays(id) on delete set null,
  -- come si è presentato il bookmarklet: alias della lega e id competizione
  lega_alias          text,
  competizione        text,
  giornata            int,
  versione_estrattore int,
  -- il payload intero, sfide e testo grezzo compresi
  payload             jsonb not null,
  stato               text not null default 'ricevuto'
                      check (stato in ('ricevuto','importato','scartato')),
  -- quante squadre avevano i conti giusti al momento dell'invio
  conti_ok            int,
  conti_totali        int,
  errore              text,
  ricevuto_il         timestamptz not null default now(),
  importato_il        timestamptz,
  -- lo scarto è una decisione, e va motivata
  check (stato <> 'scartato' or errore is not null),
  check (stato <> 'importato' or importato_il is not null)
);
create index redazione_imports_lega_idx on redazione_imports (league_id, ricevuto_il desc);
create index redazione_imports_giornata_idx on redazione_imports (matchday_id);

comment on table redazione_imports is
  'il grezzo di ogni invio del bookmarklet: si conserva per poter rifare l''import quando l''estrattore migliora';
comment on column redazione_imports.conti_ok is
  'squadre in cui la somma dei fantavoti tornava col totale della lega: conti_ok = conti_totali vuol dire estrazione certa';

-- `importato_il` si mette da solo quando lo stato passa a importato.
create or replace function fn_import_importato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'importato' and new.importato_il is null then
    new.importato_il := now();
  end if;
  return new;
end $$;

create trigger redazione_imports_importato before insert or update on redazione_imports
  for each row execute function fn_import_importato();

-- ------------------------------------------------------------------ RLS
alter table redazione_imports enable row level security;

-- Solo l'admin, e solo la sua lega. L'endpoint scrive con la service role,
-- quindi queste policy non gli stanno fra i piedi.
create policy "admin gestisce gli import" on redazione_imports
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());
