-- =====================================================================
-- Primi accessi, modifiche alle partecipazioni, annullamenti dell'admin
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · Chi entra per la prima volta
-- ---------------------------------------------------------------------
-- Serve a due cose: avvisare l'admin che c'è un account da collegare a
-- una squadra, e tenere traccia di chi ha davvero aperto l'app. La riga
-- nasce al primo accesso e non viene più toccata, così "primo accesso"
-- resta un fatto e non una deduzione da last_sign_in_at.
create table if not exists app_logins (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email         text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  logins        int not null default 1
);

alter table app_logins enable row level security;

drop policy if exists "accessi solo admin" on app_logins;
create policy "accessi solo admin" on app_logins
  for select using (is_admin());

-- ---------------------------------------------------------------------
-- 2 · Annullamenti tracciati
-- ---------------------------------------------------------------------
-- Quando una chiamata o un'adesione viene annullata — dall'allenatore o
-- dall'admin — chi la subisce deve poter leggere il perché dentro l'app,
-- senza doverlo chiedere nel gruppo.
alter table lot_participants add column if not exists cancelled_reason text;
alter table lot_participants add column if not exists cancelled_by uuid references auth.users(id);
alter table lot_participants add column if not exists cancelled_at timestamptz;

comment on column lot_participants.cancelled_reason is
  'Motivo dell''annullamento, mostrato all''allenatore nella scheda Asta.';

-- ---------------------------------------------------------------------
-- 3 · Chi partecipa è pubblico, cosa mette sul piatto no
-- ---------------------------------------------------------------------
-- La tabella resta protetta: svincolando, budget e offerte massime sono
-- leggibili solo dal proprietario fino all'apertura della sala. Ma il
-- fatto che una squadra partecipi a un lotto è informazione pubblica —
-- i messaggi di T−5 e T−1 la pubblicano già nel gruppo — e serve per
-- decidere se aderire. Questa vista espone solo quella parte.
--
-- La vista gira con i permessi del proprietario, quindi supera le policy
-- della tabella sottostante: è esattamente il motivo per cui elenca le
-- colonne una per una e non usa l'asterisco.
create or replace view v_lot_participants as
select
  p.id,
  p.session_id,
  p.lot_id,
  p.team_id,
  p.is_caller,
  p.status,
  p.withdrawn,
  p.cancelled_reason,
  p.created_at
from lot_participants p;

comment on view v_lot_participants is
  'Chi partecipa a quale lotto. Mai svincolandi, budget o offerte massime.';
