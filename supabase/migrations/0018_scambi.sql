-- =====================================================================
-- Fantacalciomercato — il registro degli scambi
-- =====================================================================
-- Finora l'app raccontava gli scambi senza registrarli. Non regge più: le
-- quote del Torneo dei Tipster leggono `v_roster` dal vivo, quindi dopo uno
-- scambio non registrato si pubblicano quote calcolate su rose che non
-- esistono più — e l'errore non dà nessun sintomo.
--
-- Lo schema 0001 aveva già previsto tutto: `acquisition_type` e
-- `release_type` accettano 'trade', `credit_movements.reason` pure, e
-- `usedChanges` conta solo i 'flash_75', quindi uno scambio non consuma un
-- cambio di ruolo. Qui serve solo ricordarsi *cosa* è stato fatto, per
-- poterlo disfare.

create table trades (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references leagues(id) on delete cascade,
  from_team_id      uuid not null references teams(id),
  to_team_id        uuid not null references teams(id),
  settlement        int  not null default 0 check (settlement >= 0),
  settlement_payer  text check (settlement_payer in ('from','to')),
  note              text,
  -- i fatti congelati su cui il pezzo è stato scritto: rigenerare la prosa
  -- non ricalcola i fatti, come in news_articles
  spunti            jsonb not null,
  body              text,
  tono              int,
  applied_at        timestamptz,
  reverted_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint trades_squadre_diverse check (from_team_id <> to_team_id),
  constraint trades_annullato_dopo_applicato check (
    reverted_at is null or applied_at is not null
  )
);
create index trades_lega_idx on trades (league_id, created_at desc);

-- Gli id dei contratti, e non solo i giocatori: l'annullamento riapre
-- esattamente la riga che aveva chiuso, invece di ricostruirla per
-- somiglianza. Uno scambio disfatto a partire da una ricostruzione è il bug
-- che si scopre tre settimane dopo, guardando una rosa che non torna.
create table trade_items (
  trade_id            uuid not null references trades(id) on delete cascade,
  player_id           uuid not null references players(id),
  from_team_id        uuid not null references teams(id),
  contract_closed_id  uuid references contracts(id),
  contract_opened_id  uuid references contracts(id),
  primary key (trade_id, player_id)
);

alter table trades enable row level security;
alter table trade_items enable row level security;

create policy "la lega legge gli scambi" on trades
  for select using (league_id = my_league_id());

create policy "l'admin gestisce gli scambi" on trades
  for all using (is_admin() and league_id = my_league_id())
  with check (is_admin() and league_id = my_league_id());

create policy "la lega legge i giocatori scambiati" on trade_items
  for select using (
    exists (select 1 from trades t where t.id = trade_id and t.league_id = my_league_id())
  );

create policy "l'admin gestisce i giocatori scambiati" on trade_items
  for all using (
    exists (select 1 from trades t
            where t.id = trade_id and t.league_id = my_league_id() and is_admin())
  )
  with check (
    exists (select 1 from trades t
            where t.id = trade_id and t.league_id = my_league_id() and is_admin())
  );
