-- =====================================================================
-- Fanta Mansarda · Aste Flash — schema (Fase 1)
-- =====================================================================
-- Principi:
--   * i crediti non sono un campo modificabile: sono la somma dei movimenti
--   * i contratti non si cancellano mai, si chiudono (released_at)
--   * ciò che deve restare segreto sta in tabelle separate, protette da RLS
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- lega
create table leagues (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  season              text not null,
  initial_credits     int  not null default 500,
  -- composizione rosa
  roster_p            int  not null default 3,
  roster_d            int  not null default 8,
  roster_c            int  not null default 8,
  roster_a            int  not null default 6,
  -- cambi girone di andata
  changes_p           int  not null default 1,
  changes_d           int  not null default 3,
  changes_c           int  not null default 3,
  changes_a           int  not null default 2,
  -- bonus cambi dal girone di ritorno (+1 per ruolo, art. 10.2)
  return_bonus        int  not null default 1,
  return_starts_on    date not null default '2027-02-01',
  -- economia
  refund_pct          numeric(4,3) not null default 0.75,
  refund_rounding     text not null default 'floor'
                      check (refund_rounding in ('floor','ceil','half_up')),
  -- asta
  base_price          int not null default 1,
  min_increment       int not null default 1,
  timer_seconds       int not null default 10,
  call_deadline_days  int not null default 5,
  join_deadline_days  int not null default 1,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------ squadre
create table teams (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  name          text not null,
  manager_name  text not null,
  user_id       uuid unique references auth.users(id) on delete set null,
  email         text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (league_id, name)
);

-- ---------------------------------------------------------- giocatori
create table players (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  ext_id       text not null,                    -- id del listone Fantacalcio.it
  name         text not null,
  role         char(1) not null check (role in ('P','D','C','A')),
  club         text not null,
  quotation    int  not null default 1,
  -- active: in Serie A e regolarmente disponibile
  -- injured_long / banned: rimborso 100% previa approvazione admin (art. 8.3)
  -- out_of_serie_a: rimborso 100% (art. 11.2)
  status       text not null default 'active'
               check (status in ('active','injured_long','banned','out_of_serie_a')),
  status_note  text,
  status_until date,
  -- finestra in cui il giocatore è entrato in lega: i "winter" sono esclusi
  -- dalle chiamate nelle sessioni di gennaio (art. 11.2)
  signing_window text not null default 'summer'
               check (signing_window in ('summer','winter')),
  updated_at   timestamptz not null default now(),
  unique (league_id, ext_id)
);
create index on players (league_id, role);
create index on players (league_id, status);

-- ---------------------------------------------------------- contratti
-- storico completo: la rosa attuale è l'insieme dei contratti aperti
create table contracts (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid not null references leagues(id) on delete cascade,
  team_id          uuid not null references teams(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  price            int  not null check (price >= 0),
  acquisition_type text not null default 'initial_auction'
                   check (acquisition_type in ('initial_auction','flash_auction','trade','repair_auction')),
  acquired_at      timestamptz not null default now(),
  released_at      timestamptz,
  -- flash_75: svincolo ordinario, consuma un cambio di ruolo
  -- free_100 : cambio gratuito (infortunio lungo, fuori Serie A, squalifica)
  release_type     text check (release_type in ('flash_75','free_100','trade','repair')),
  release_value    int,
  session_id       uuid,
  constraint release_consistency check (
    (released_at is null and release_type is null) or
    (released_at is not null and release_type is not null)
  )
);
-- un giocatore può avere un solo contratto aperto per volta
create unique index contracts_one_open_per_player
  on contracts (player_id) where released_at is null;
create index on contracts (team_id) where released_at is null;

-- ------------------------------------------------------------- crediti
-- il saldo di una squadra è la somma di questi movimenti, punto.
create table credit_movements (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete cascade,
  amount      int  not null,          -- positivo = accredito
  reason      text not null
              check (reason in ('initial','purchase','refund','trade','adjustment','penalty')),
  note        text,
  session_id  uuid,
  lot_id      uuid,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index on credit_movements (team_id);

-- -------------------------------------------------------- calendario
create table auction_sessions (
  id                    uuid primary key default gen_random_uuid(),
  league_id             uuid not null references leagues(id) on delete cascade,
  number                int  not null,
  auction_at            timestamptz not null,
  -- scheduled → calls_open → calls_closed → joins_closed → live → closed
  status                text not null default 'scheduled'
                        check (status in ('scheduled','calls_open','calls_closed','joins_closed','live','closed')),
  excludes_new_signings boolean not null default false,  -- sessioni di gennaio
  notes                 text,
  unique (league_id, number)
);

-- -------------------------------------------------------------- lotti
-- pubblico: chi ha chiamato chi. Nessun dato segreto qui dentro.
create table lots (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references auction_sessions(id) on delete cascade,
  player_id      uuid not null references players(id),
  caller_team_id uuid not null references teams(id),
  order_index    int  not null,
  status         text not null default 'called'
                 check (status in ('called','uncontested','live','assigned','cancelled')),
  winner_team_id uuid references teams(id),
  final_price    int,
  opened_at      timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (session_id, player_id)          -- due chiamate sullo stesso giocatore = un lotto solo
);

-- --------------------------------------------------- partecipazioni
-- SEGRETO fino all'apertura della sala: svincolando e budget.
-- Il chiamante è una partecipazione con is_caller = true.
create table lot_participants (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references auction_sessions(id) on delete cascade,
  lot_id             uuid not null references lots(id) on delete cascade,
  team_id            uuid not null references teams(id) on delete cascade,
  is_caller          boolean not null default false,
  release_player_id  uuid not null references players(id),
  budget             int  not null,       -- crediti residui + rimborso, al momento dell'adesione
  -- confirmed        : valida, va in sala
  -- pending_approval : c'è una richiesta di svincolo gratuito da decidere; congelata
  -- cancelled        : annullata dall'admin, la squadra può rifarla con un altro svincolando
  status             text not null default 'confirmed'
                     check (status in ('confirmed','pending_approval','cancelled')),
  withdrawn          boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (lot_id, team_id)
);
-- regola integrativa 3: un svincolando può essere impegnato una sola volta per
-- sessione. Le partecipazioni annullate liberano il giocatore per una nuova scelta.
create unique index lot_participants_one_release_per_session
  on lot_participants (session_id, release_player_id) where status <> 'cancelled';

-- --------------------------------------------------- offerte massime
-- segrete SEMPRE, anche in sala: le vede solo chi le ha lasciate.
create table proxy_bids (
  lot_id      uuid not null references lots(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete cascade,
  max_amount  int  not null check (max_amount > 0),
  created_at  timestamptz not null default now(),
  primary key (lot_id, team_id)
);

-- ------------------------------------------------------------ offerte
create table bids (
  id         uuid primary key default gen_random_uuid(),
  lot_id     uuid not null references lots(id) on delete cascade,
  team_id    uuid not null references teams(id),
  amount     int  not null check (amount > 0),
  is_auto    boolean not null default false,
  created_at timestamptz not null default now()
);
create index on bids (lot_id, amount desc);

-- ------------------------------------------- richieste cambio gratuito
-- Richiesta di svincolo gratuito.
-- Nell'app c'è solo il pulsante: prove e spiegazioni passano dal gruppo WhatsApp,
-- dove la lega discute già di suo. Qui resta la traccia della decisione.
create table free_release_requests (
  id                 uuid primary key default gen_random_uuid(),
  league_id          uuid not null references leagues(id) on delete cascade,
  team_id            uuid not null references teams(id) on delete cascade,
  player_id          uuid not null references players(id),
  -- se la richiesta nasce da una chiamata o adesione, questa resta congelata
  -- finché l'admin non decide
  lot_participant_id uuid references lot_participants(id) on delete cascade,
  -- approved : svincolo al 100%, nessun cambio consumato
  -- rejected : svincolo ordinario al 75%, cambio consumato
  -- cancelled: annullata insieme alla chiamata, la squadra ne fa un'altra
  status             text not null default 'pending'
                     check (status in ('pending','approved','rejected','cancelled')),
  decided_by         uuid references auth.users(id),
  decided_at         timestamptz,
  decision_note      text,
  created_at         timestamptz not null default now()
);
-- una sola richiesta aperta per giocatore
create unique index free_release_one_pending_per_player
  on free_release_requests (team_id, player_id) where status = 'pending';

-- --------------------------------------------------- messaggi e log
create table messages (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  session_id uuid references auction_sessions(id) on delete cascade,
  kind       text not null check (kind in ('call','calls_closed','joins_closed','room_open','results')),
  body       text not null,
  status     text not null default 'draft' check (status in ('draft','sent')),
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

-- coda operativa dell'admin: cosa replicare su Leghe Fantacalcio.it
create table admin_tasks (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  session_id   uuid references auction_sessions(id) on delete cascade,
  lot_id       uuid references lots(id) on delete cascade,
  body         text not null,
  done         boolean not null default false,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid references leagues(id) on delete cascade,
  actor      uuid references auth.users(id),
  action     text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Viste di comodo
-- =====================================================================

-- saldo crediti per squadra
create view v_team_credits as
select t.id as team_id, t.league_id, t.name,
       coalesce(sum(m.amount), 0)::int as credits
from teams t
left join credit_movements m on m.team_id = t.id
group by t.id, t.league_id, t.name;

-- rosa attuale
create view v_roster as
select c.team_id, c.league_id, p.id as player_id, p.name, p.role, p.club,
       p.status, p.quotation, c.price, c.acquired_at, c.acquisition_type
from contracts c
join players p on p.id = c.player_id
where c.released_at is null;

-- listone svincolati: nessun contratto aperto e non impegnato in una sessione in corso
create view v_free_agents as
select p.*
from players p
where not exists (
  select 1 from contracts c where c.player_id = p.id and c.released_at is null
);
