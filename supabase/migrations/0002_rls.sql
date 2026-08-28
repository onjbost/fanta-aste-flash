-- =====================================================================
-- Row Level Security
-- =====================================================================
-- La regola che conta: svincolandi, budget e offerte massime non sono
-- visibili a nessuno prima del momento giusto — admin compreso.
-- Non è una convenzione dell'interfaccia, è un permesso del database.
-- =====================================================================

create or replace function my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from teams where user_id = auth.uid() limit 1;
$$;

create or replace function my_league_id() returns uuid
language sql stable security definer set search_path = public as $$
  select league_id from teams where user_id = auth.uid() limit 1;
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from teams where user_id = auth.uid() limit 1), false);
$$;

alter table leagues              enable row level security;
alter table teams                enable row level security;
alter table players              enable row level security;
alter table contracts            enable row level security;
alter table credit_movements     enable row level security;
alter table auction_sessions     enable row level security;
alter table lots                 enable row level security;
alter table lot_participants     enable row level security;
alter table proxy_bids           enable row level security;
alter table bids                 enable row level security;
alter table free_release_requests enable row level security;
alter table messages             enable row level security;
alter table admin_tasks          enable row level security;
alter table audit_log            enable row level security;

-- ------------------------------------------------- lettura di lega
create policy "membri leggono la lega" on leagues
  for select using (id = my_league_id());

create policy "membri leggono le squadre" on teams
  for select using (league_id = my_league_id());

create policy "membri leggono i giocatori" on players
  for select using (league_id = my_league_id());

-- le rose sono pubbliche: è un fantacalcio, non un'asta al buio
create policy "membri leggono i contratti" on contracts
  for select using (league_id = my_league_id());

create policy "membri leggono i crediti" on credit_movements
  for select using (league_id = my_league_id());

create policy "membri leggono il calendario" on auction_sessions
  for select using (league_id = my_league_id());

-- chi ha chiamato chi è pubblico dal primo istante: serve per aderire
create policy "membri leggono i lotti" on lots
  for select using (
    exists (select 1 from auction_sessions s
            where s.id = lots.session_id and s.league_id = my_league_id())
  );

-- ------------------------------------------- il cuore della segretezza
-- svincolando e budget: visibili al proprietario sempre, a tutti gli
-- altri solo da quando la sala si apre.
create policy "partecipazioni segrete fino all'apertura" on lot_participants
  for select using (
    team_id = my_team_id()
    or exists (
      select 1 from auction_sessions s
      where s.id = lot_participants.session_id
        and s.league_id = my_league_id()
        and s.status in ('live','closed')
    )
  );

-- l'offerta massima resta segreta per sempre: la vede solo chi l'ha lasciata
create policy "offerte massime private" on proxy_bids
  for select using (team_id = my_team_id());

create policy "rilanci pubblici a lotto aperto" on bids
  for select using (
    exists (select 1 from lots l join auction_sessions s on s.id = l.session_id
            where l.id = bids.lot_id and s.league_id = my_league_id()
              and l.status in ('live','assigned'))
  );

-- --------------------------------------- richieste di cambio gratuito
create policy "vedo le mie richieste, l'admin le vede tutte" on free_release_requests
  for select using (team_id = my_team_id() or is_admin());

create policy "posso richiedere per la mia squadra" on free_release_requests
  for insert with check (team_id = my_team_id());

-- --------------------------------------------------- roba da admin
create policy "messaggi solo admin" on messages
  for select using (is_admin() and league_id = my_league_id());

create policy "coda operativa solo admin" on admin_tasks
  for select using (is_admin() and league_id = my_league_id());

create policy "log solo admin" on audit_log
  for select using (is_admin() and league_id = my_league_id());

-- Nota: tutte le scritture di mercato passano da funzioni SECURITY DEFINER
-- (fase 2) o dal service role lato server. Nessun client scrive
-- direttamente su contracts, credit_movements, lots o bids.
