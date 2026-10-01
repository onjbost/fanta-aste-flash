-- =====================================================================
-- Sala d'asta: presenze, grazia sul timer, martello dell'admin
-- =====================================================================
-- Tre cambiamenti che vanno insieme.
--
-- 1. Un lotto aperto non parte subito: aspetta che almeno un allenatore
--    per ogni squadra in corsa confermi di essere in sala. Il countdown lo
--    accende la conferma dell'ultima squadra, dentro la transazione che la
--    registra — non un browser.
--
-- 2. Scaduto il timer c'è una grazia di pochi secondi in cui un rilancio è
--    ancora valido e riporta il countdown a pieno. Fra il dito e il server
--    c'è una rete, e perdere un lotto per 200 millisecondi non è un'asta.
--
-- 3. Passata la grazia il lotto resta aperto ma congelato: si chiude quando
--    l'admin batte il martello. Prima lo chiudeva il primo browser che
--    vedeva il countdown a zero.
--
-- La fase del lotto non diventa una colonna: si deduce da `status` e
-- `timer_ends_at` (vedi `faseDelLotto` in src/lib/rules.ts). Uno stato
-- «congelato» scritto nel database avrebbe bisogno di qualcuno che lo
-- scriva nell'istante in cui il tempo finisce, e quel qualcuno non esiste.
-- =====================================================================

-- --------------------------------------------------------- configurazione
alter table leagues add column if not exists grace_seconds int not null default 3;

comment on column leagues.grace_seconds is
  'Secondi oltre lo scadere in cui un rilancio è ancora valido e riporta il timer a timer_seconds.';

-- 15 secondi dalla conferma delle presenze: deciso per la prima asta vera.
-- Il `where` evita di sovrascrivere un valore cambiato a mano in seguito.
update leagues set timer_seconds = 15 where timer_seconds = 10;

-- ------------------------------------------------------------- presenze
-- Una riga per allenatore, non per squadra: se confermano entrambi resta
-- scritto chi c'era. Per far partire il timer basta una riga per squadra.
--
-- `user_id` non ha la chiave esterna verso `auth.users`, e non è una
-- dimenticanza: crearla su Supabase vuol dire chiedere un lock su
-- `auth.users`, dove il servizio di autenticazione tiene connessioni aperte
-- da settimane, e la migrazione resta appesa. Il vincolo serve a poco qui —
-- chi può confermare lo decide `fn_confirm_presence` guardando
-- `lot_participants`, e le righe se ne vanno in cascata col lotto.
create table if not exists lot_presences (
  lot_id       uuid not null references lots(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  user_id      uuid not null,
  confirmed_at timestamptz not null default now(),
  primary key (lot_id, user_id)
);
create index if not exists lot_presences_lot_team on lot_presences (lot_id, team_id);

comment on table lot_presences is
  'Chi ha confermato di essere in sala per un lotto. Il countdown parte quando c''è almeno una conferma per ogni squadra in corsa.';

alter table lot_presences enable row level security;

-- Le presenze sono pubbliche in lega: la sala mostra chi si sta aspettando,
-- e saperlo non svela nulla che l'apertura della sala non abbia già svelato.
drop policy if exists "membri leggono le presenze" on lot_presences;
create policy "membri leggono le presenze" on lot_presences
  for select using (
    exists (
      select 1 from lots l
      join auction_sessions s on s.id = l.session_id
      where l.id = lot_presences.lot_id and s.league_id = my_league_id()
    )
  );

-- Nessuna policy di scrittura: le presenze le scrive solo
-- fn_confirm_presence, che gira col service role dal server.

-- ---------------------------------------------------------------------
-- fn_confirm_presence
--   Registra la conferma e, se con questa ci sono tutti, accende il
--   countdown nella stessa transazione. Il `for update` sul lotto serializza
--   le conferme: due allenatori che premono nello stesso istante non possono
--   accendere due timer.
-- ---------------------------------------------------------------------
create or replace function fn_confirm_presence(
  p_lot_id  uuid,
  p_team_id uuid,
  p_user_id uuid
)
returns table (ok boolean, reason text, started boolean, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_lot       lots%rowtype;
  v_timer     int;
  v_attese    int;
  v_presenti  int;
  v_ends      timestamptz;
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    return query select false, 'Lotto inesistente', false, null::timestamptz;
    return;
  end if;

  if v_lot.status <> 'live' then
    return query select false, 'Il lotto non è aperto in sala', false, null::timestamptz;
    return;
  end if;

  if not exists (
    select 1 from lot_participants
    where lot_id = p_lot_id and team_id = p_team_id
      and status = 'confirmed' and withdrawn = false
  ) then
    return query select false, 'Non sei in corsa su questo lotto', false, v_lot.timer_ends_at;
    return;
  end if;

  insert into lot_presences (lot_id, team_id, user_id)
  values (p_lot_id, p_team_id, p_user_id)
  on conflict (lot_id, user_id) do nothing;

  -- il countdown è già partito: la conferma resta registrata e basta
  if v_lot.timer_ends_at is not null then
    return query select true, null::text, false, v_lot.timer_ends_at;
    return;
  end if;

  select count(distinct team_id) into v_attese
  from lot_participants
  where lot_id = p_lot_id and status = 'confirmed' and withdrawn = false;

  select count(distinct pr.team_id) into v_presenti
  from lot_presences pr
  where pr.lot_id = p_lot_id
    and exists (
      select 1 from lot_participants lp
      where lp.lot_id = p_lot_id and lp.team_id = pr.team_id
        and lp.status = 'confirmed' and lp.withdrawn = false
    );

  if v_attese = 0 or v_presenti < v_attese then
    return query select true, null::text, false, null::timestamptz;
    return;
  end if;

  select l.timer_seconds into v_timer
  from leagues l
  join auction_sessions s on s.league_id = l.id
  where s.id = v_lot.session_id;

  update lots
     set timer_ends_at = now() + make_interval(secs => coalesce(v_timer, 15))
   where id = p_lot_id
  returning timer_ends_at into v_ends;

  return query select true, null::text, true, v_ends;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_place_bid — rifatta in due punti
--   * timer_ends_at nullo vuol dire «si aspettano le presenze»: prima un
--     rilancio in quello stato passava, perché il controllo sul tempo
--     saltava proprio quando il tempo non c'era.
--   * si accetta fino a timer_ends_at + grace_seconds, e un rilancio nella
--     grazia riporta il countdown a timer_seconds pieni.
-- ---------------------------------------------------------------------
create or replace function fn_place_bid(
  p_lot_id  uuid,
  p_team_id uuid,
  p_amount  int,
  p_budget  int,
  p_is_auto boolean default false
)
returns table (ok boolean, reason text, price int, leader uuid, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_lot     lots%rowtype;
  v_base       int;
  v_inc        int;
  v_timer      int;
  v_grace      int;
  v_min        int;
  v_new_price  int;
  v_new_leader uuid;
  v_new_ends   timestamptz;
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    return query select false, 'Lotto inesistente', null::int, null::uuid, null::timestamptz;
    return;
  end if;

  select l.base_price, l.min_increment, l.timer_seconds, l.grace_seconds
    into v_base, v_inc, v_timer, v_grace
  from leagues l
  join auction_sessions s on s.league_id = l.id
  where s.id = v_lot.session_id;

  if v_lot.status <> 'live' then
    return query select false, 'Il lotto non è aperto', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  if v_lot.timer_ends_at is null then
    return query select false, 'Il lotto non è ancora partito: si aspettano le presenze',
                        v_lot.current_price, v_lot.current_leader, null::timestamptz;
    return;
  end if;

  if now() > v_lot.timer_ends_at + make_interval(secs => coalesce(v_grace, 0)) then
    return query select false, 'Tempo scaduto', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  if v_lot.current_leader = p_team_id then
    return query select false, 'Sei già il migliore offerente', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  v_min := coalesce(v_lot.current_price + v_inc, v_base);
  if p_amount < v_min then
    return query select false, format('L''offerta minima adesso è %s crediti', v_min),
                        v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  if p_amount > p_budget then
    return query select false, format('Il tuo budget su questo lotto è %s crediti', p_budget),
                        v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  -- deve essere una partecipazione viva
  if not exists (
    select 1 from lot_participants
    where lot_id = p_lot_id and team_id = p_team_id
      and status = 'confirmed' and withdrawn = false
  ) then
    return query select false, 'Non partecipi a questo lotto', v_lot.current_price, v_lot.current_leader, v_lot.timer_ends_at;
    return;
  end if;

  insert into bids (lot_id, team_id, amount, is_auto)
  values (p_lot_id, p_team_id, p_amount, p_is_auto);

  update lots
     set current_price  = p_amount,
         current_leader = p_team_id,
         timer_ends_at  = now() + make_interval(secs => coalesce(v_timer, 15))
   where id = p_lot_id
  returning current_price, current_leader, timer_ends_at
  into v_new_price, v_new_leader, v_new_ends;

  return query select true, null::text, v_new_price, v_new_leader, v_new_ends;
end;
$$;

-- Le due funzioni le chiama solo il server col service role.
do $$
begin
  execute 'revoke all on function fn_place_bid(uuid, uuid, int, int, boolean) from public';
  execute 'revoke all on function fn_confirm_presence(uuid, uuid, uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fn_place_bid(uuid, uuid, int, int, boolean) from anon';
    execute 'revoke all on function fn_confirm_presence(uuid, uuid, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function fn_place_bid(uuid, uuid, int, int, boolean) from authenticated';
    execute 'revoke all on function fn_confirm_presence(uuid, uuid, uuid) from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Realtime: la sala segue anche le presenze, così l'attesa si aggiorna da
-- sé mentre gli allenatori confermano.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table lot_presences';
  end if;
exception when duplicate_object then null;
end $$;
