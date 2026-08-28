-- =====================================================================
-- Due allenatori per squadra
-- =====================================================================
-- Una squadra può essere gestita da due persone: entrambe vedono la rosa,
-- entrambe possono chiamare, aderire e rilanciare. Per il mercato sono la
-- stessa squadra — i crediti, i cambi e gli svincolandi sono condivisi.
--
-- Il collegamento passa da una tabella dedicata invece che da una colonna
-- su teams: aggiungere un terzo allenatore un giorno non richiederà di
-- toccare lo schema, e la storia di chi era collegato resta leggibile.
-- =====================================================================

create table if not exists team_members (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  team_id    uuid not null references teams(id) on delete cascade,
  -- un utente sta in una sola squadra: è quello che rende univoco
  -- "la mia squadra" in tutte le policy di sicurezza
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  email      text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index if not exists team_members_team on team_members (team_id);

-- porta dentro i collegamenti già fatti su teams.user_id
insert into team_members (league_id, team_id, user_id, email, is_admin)
select t.league_id, t.id, t.user_id, t.email, t.is_admin
from teams t
where t.user_id is not null
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- Le funzioni di sicurezza guardano qui, non più a teams.user_id
-- ---------------------------------------------------------------------
create or replace function my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from team_members where user_id = auth.uid() limit 1;
$$;

create or replace function my_league_id() returns uuid
language sql stable security definer set search_path = public as $$
  select league_id from team_members where user_id = auth.uid() limit 1;
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from team_members where user_id = auth.uid() limit 1), false);
$$;

-- ---------------------------------------------------------------------
-- Chi sta in una squadra vede i compagni di tutta la lega: sapere chi
-- gestisce cosa non è un segreto, ed evita "ma allora chi ha chiamato?"
-- ---------------------------------------------------------------------
alter table team_members enable row level security;

drop policy if exists "membri leggono gli allenatori" on team_members;
create policy "membri leggono gli allenatori" on team_members
  for select using (league_id = my_league_id());

-- ---------------------------------------------------------------------
-- Quanti allenatori per squadra: due, come da regolamento della lega.
-- Il limite sta nel database, così nessuna dimenticanza nell'interfaccia
-- può aggirarlo.
-- ---------------------------------------------------------------------
create or replace function fn_check_team_members() returns trigger
language plpgsql as $$
declare n int;
begin
  select count(*) into n from team_members where team_id = new.team_id;
  if n >= 2 then
    raise exception 'La squadra ha già due allenatori';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_max_two on team_members;
create trigger team_members_max_two
  before insert on team_members
  for each row execute function fn_check_team_members();

comment on table team_members is
  'Allenatori collegati a una squadra: massimo due, condividono rosa, crediti e cambi.';
