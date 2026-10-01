-- =====================================================================
-- Il passato, travasato nel registro
-- =====================================================================
-- Il registro non nasce vuoto: la storia della lega è già nel database — nei
-- lotti, nelle partecipazioni, negli scambi, nelle schedine, nelle richieste
-- di svincolo e nell'audit log — e qui la si riscrive come righe di registro,
-- con le date vere.
--
-- Ogni blocco è idempotente: l'`impronta` identifica il fatto, e un secondo
-- passaggio non raddoppia niente. Non si usa `on conflict` ma un
-- `where not exists`, perché l'indice unico sull'impronta è parziale — e
-- perché una migrazione di dati gira una volta, non in concorrenza con sé
-- stessa.
--
-- Un limite dichiarato: per le azioni di prima il database sa **quale
-- squadra** ha agito, non quale dei due allenatori. Quelle righe portano il
-- nome della squadra, o «L'admin» per le azioni di regia. Da adesso in poi
-- c'è il nome della persona, perché lo scrive il codice nel momento in cui
-- l'azione avviene.
-- =====================================================================

-- ------------------------------------------------- 1 · chiamate e adesioni
insert into registro
  (league_id, avvenuto_il, azione, attore_team, attore_nome, da_admin,
   player_id, session_id, lot_id, dati, impronta)
select s.league_id, lp.created_at,
       case when lp.is_caller then 'chiamata' else 'adesione' end,
       lp.team_id, t.name, false,
       l.player_id, lp.session_id, lp.lot_id, '{}'::jsonb,
       (case when lp.is_caller then 'chiamata:' else 'adesione:' end) || lp.id
from lot_participants lp
join lots l on l.id = lp.lot_id
join auction_sessions s on s.id = lp.session_id
join teams t on t.id = lp.team_id
where lp.status <> 'cancelled'
  and not exists (
    select 1 from registro r
    where r.impronta = (case when lp.is_caller then 'chiamata:' else 'adesione:' end) || lp.id
  )
  -- e nemmeno se quella riga l'ha già scritta l'app nel momento dell'azione
  and not exists (
    select 1 from registro r
    where r.lot_id = lp.lot_id and r.attore_team = lp.team_id
      and r.azione = case when lp.is_caller then 'chiamata' else 'adesione' end
  );

-- ------------------------------------------------------------ 2 · acquisti
-- Lo svincolando qui si scrive: dall'aggiudicazione in poi è pubblico.
insert into registro
  (league_id, avvenuto_il, azione, attore_team, attore_nome, da_admin,
   player_id, session_id, lot_id, dati, impronta)
select s.league_id, coalesce(l.closed_at, s.auction_at), 'acquisto_asta',
       l.winner_team_id, t.name, false,
       l.player_id, l.session_id, l.id,
       jsonb_strip_nulls(jsonb_build_object(
         'prezzo', l.final_price,
         'uscito', usc.name,
         'rimborso', c.release_value,
         'senzaContendenti', case when (
           select count(*) from lot_participants x
           where x.lot_id = l.id and x.status = 'confirmed' and x.withdrawn = false
         ) = 1 then true else null end
       )),
       'acquisto:' || l.id
from lots l
join auction_sessions s on s.id = l.session_id
join teams t on t.id = l.winner_team_id
left join lot_participants vinc
  on vinc.lot_id = l.id and vinc.team_id = l.winner_team_id
left join players usc on usc.id = vinc.release_player_id
left join contracts c
  on c.team_id = l.winner_team_id and c.player_id = vinc.release_player_id
 and c.session_id = l.session_id
where l.status = 'assigned' and l.winner_team_id is not null
  and not exists (select 1 from registro r where r.impronta = 'acquisto:' || l.id)
  and not exists (
    select 1 from registro r where r.lot_id = l.id and r.azione = 'acquisto_asta'
  );

-- ------------------------------------------------- 3 · aperture della sala
insert into registro
  (league_id, avvenuto_il, azione, attore_nome, da_admin, session_id, dati, impronta)
select s.league_id, s.room_opened_at, 'sala_aperta', 'L''admin', true, s.id,
       jsonb_build_object(
         'asta', s.number,
         'assegnatiSenzaAsta', (
           select count(*) from lots l2
           where l2.session_id = s.id and l2.status = 'assigned'
             and (
               select count(*) from lot_participants x
               where x.lot_id = l2.id and x.status = 'confirmed' and x.withdrawn = false
             ) = 1
         )
       ),
       'sala:' || s.id
from auction_sessions s
where s.room_opened_at is not null
  and not exists (select 1 from registro r where r.impronta = 'sala:' || s.id);

-- --------------------------------------------------------------- 4 · scambi
insert into registro
  (league_id, avvenuto_il, azione, attore_nome, da_admin, dati, impronta)
select tr.league_id, tr.applied_at, 'scambio', 'L''admin', true,
       jsonb_strip_nulls(jsonb_build_object(
         'squadraA', ca.name,
         'squadraB', os.name,
         'da', (
           select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
           from trade_items ti join players p on p.id = ti.player_id
           where ti.trade_id = tr.id and ti.from_team_id = tr.from_team_id
         ),
         'a', (
           select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
           from trade_items ti join players p on p.id = ti.player_id
           where ti.trade_id = tr.id and ti.from_team_id = tr.to_team_id
         ),
         'conguaglio', nullif(tr.settlement, 0),
         'paga', case tr.settlement_payer
                   when 'from' then ca.name when 'to' then os.name else null end,
         'nota', nullif(tr.note, '')
       )),
       'scambio:' || tr.id
from trades tr
join teams ca on ca.id = tr.from_team_id
join teams os on os.id = tr.to_team_id
where tr.applied_at is not null
  and not exists (select 1 from registro r where r.impronta = 'scambio:' || tr.id);

-- ------------------------------------------------------ 5 · scambi disfatti
insert into registro
  (league_id, avvenuto_il, azione, attore_nome, da_admin, dati, impronta)
select tr.league_id, tr.reverted_at, 'scambio_disfatto', 'L''admin', true,
       jsonb_strip_nulls(jsonb_build_object('squadraA', ca.name, 'squadraB', os.name)),
       'scambio_disfatto:' || tr.id
from trades tr
join teams ca on ca.id = tr.from_team_id
join teams os on os.id = tr.to_team_id
where tr.reverted_at is not null
  and not exists (
    select 1 from registro r where r.impronta = 'scambio_disfatto:' || tr.id
  );

-- ------------------------------------------------------------- 6 · schedine
-- Una riga per schedina, con i pronostici di adesso: la stessa impronta che
-- usa l'app, così una schedina cambiata più tardi aggiorna questa riga invece
-- di aggiungerne un'altra.
insert into registro
  (league_id, avvenuto_il, azione, attore_team, attore_nome, da_admin, dati, impronta)
select sl.league_id, sl.submitted_at, 'schedina', sl.team_id, t.name, false,
       jsonb_build_object(
         'giornata', coalesce(md.fanta, md.serie_a),
         'giocate', (select count(*) from picks pk where pk.slip_id = sl.id)
       ),
       'schedina:' || sl.id
from slips sl
join teams t on t.id = sl.team_id
join matchdays md on md.id = sl.matchday_id
where (select count(*) from picks pk where pk.slip_id = sl.id) > 0
  and not exists (select 1 from registro r where r.impronta = 'schedina:' || sl.id);

-- --------------------------------------------- 7 · svincoli gratuiti chiesti
-- Le richieste ritirate restano fuori: non sono una richiesta fatta, e in un
-- elenco pubblico sembrerebbero una cosa che l'allenatore non ha mai chiesto.
-- `session_id` segue la partecipazione congelata, quando c'è: è quello che
-- dice al registro che il nome del giocatore è ancora segreto, perché su
-- un'asta aperta quel giocatore è lo svincolando dichiarato da qualcuno.
insert into registro
  (league_id, avvenuto_il, azione, attore_team, attore_nome, da_admin,
   player_id, session_id, dati, impronta)
select f.league_id, f.created_at, 'svincolo_richiesto', f.team_id, t.name, false,
       f.player_id, lp.session_id, '{}'::jsonb, 'svincolo_chiesto:' || f.id
from free_release_requests f
join teams t on t.id = f.team_id
left join lot_participants lp on lp.id = f.lot_participant_id
where f.status <> 'cancelled'
  and not exists (
    select 1 from registro r where r.impronta = 'svincolo_chiesto:' || f.id
  );

-- ---------------------------------------------- 8 · svincoli gratuiti decisi
-- L'annullamento della richiesta non entra: non decide niente sullo svincolo
-- e in un elenco pubblico sembrerebbe un «no» che non è stato dato.
insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin,
   player_id, session_id, dati, impronta)
select f.league_id, f.decided_at,
       case f.status when 'approved' then 'svincolo_approvato' else 'svincolo_respinto' end,
       f.decided_by, 'L''admin', true,
       f.player_id, lp.session_id,
       jsonb_strip_nulls(jsonb_build_object('squadra', t.name, 'nota', nullif(f.decision_note, ''))),
       'svincolo_deciso:' || f.id
from free_release_requests f
join teams t on t.id = f.team_id
left join lot_participants lp on lp.id = f.lot_participant_id
where f.status in ('approved', 'rejected') and f.decided_at is not null
  and not exists (
    select 1 from registro r where r.impronta = 'svincolo_deciso:' || f.id
  );

-- ------------------------------- 9 · crediti, rose e import, dall'audit log
-- Queste azioni non lasciano una traccia propria leggibile: `credit_movements`
-- ha le note scritte a mano, e indovinare un fatto da una nota è il modo
-- migliore per raccontare una cosa sbagliata. L'audit log invece ha il
-- payload strutturato, che è esattamente quello che serve.
insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin, dati, impronta)
select a.league_id, a.created_at, 'crediti_impostati', a.actor, 'L''admin', true,
       jsonb_strip_nulls(jsonb_build_object(
         'squadra', a.payload->>'team',
         'prima', (a.payload->>'from')::int,
         'dopo', (a.payload->>'to')::int,
         'nota', nullif(a.payload->>'note', '')
       )),
       'audit:' || a.id
from audit_log a
where a.action = 'credits_adjusted' and a.league_id is not null
  and not exists (select 1 from registro r where r.impronta = 'audit:' || a.id);

insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin, dati, impronta)
select a.league_id, a.created_at, 'rose_importate', a.actor, 'L''admin', true,
       jsonb_build_object('nota', format(
         '%s prezzi corretti, %s entrati, %s usciti, %s passati di mano',
         coalesce(a.payload->>'repriced', '0'), coalesce(a.payload->>'added', '0'),
         coalesce(a.payload->>'removed', '0'), coalesce(a.payload->>'moved', '0')
       )),
       'audit:' || a.id
from audit_log a
where a.action = 'roster_sync' and a.league_id is not null
  and not exists (select 1 from registro r where r.impronta = 'audit:' || a.id);

insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin,
   player_id, dati, impronta)
select a.league_id, a.created_at, 'rosa_prezzo', a.actor, 'L''admin', true,
       c.player_id,
       jsonb_strip_nulls(jsonb_build_object(
         'squadra', t.name,
         'giocatore', a.payload->>'player',
         'prima', (a.payload->>'from')::int,
         'dopo', (a.payload->>'to')::int,
         'nota', nullif(a.payload->>'note', '')
       )),
       'audit:' || a.id
from audit_log a
left join contracts c on c.id = (a.payload->>'contract_id')::uuid
left join teams t on t.id = c.team_id
where a.action = 'contract_price_changed' and a.league_id is not null
  and not exists (select 1 from registro r where r.impronta = 'audit:' || a.id);

insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin, dati, impronta)
select a.league_id, a.created_at, 'rosa_aggiunto', a.actor, 'L''admin', true,
       jsonb_strip_nulls(jsonb_build_object(
         'squadra', a.payload->>'team',
         'giocatore', a.payload->>'player',
         'prezzo', (a.payload->>'price')::int,
         'nota', nullif(a.payload->>'note', '')
       )),
       'audit:' || a.id
from audit_log a
where a.action = 'roster_player_added' and a.league_id is not null
  and not exists (select 1 from registro r where r.impronta = 'audit:' || a.id);

insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin,
   player_id, dati, impronta)
select a.league_id, a.created_at, 'rosa_tolto', a.actor, 'L''admin', true,
       c.player_id,
       jsonb_strip_nulls(jsonb_build_object(
         'squadra', t.name,
         'giocatore', a.payload->>'player',
         'rimborso', case when (a.payload->>'refunded')::boolean
                          then (a.payload->>'price')::int else null end,
         'nota', nullif(a.payload->>'note', '')
       )),
       'audit:' || a.id
from audit_log a
left join contracts c on c.id = (a.payload->>'contract_id')::uuid
left join teams t on t.id = c.team_id
where a.action = 'roster_player_removed' and a.league_id is not null
  and not exists (select 1 from registro r where r.impronta = 'audit:' || a.id);

-- Le aggiudicazioni annullate prima che il registro esistesse: il lotto è
-- tornato in programma, quindi il blocco 2 non le vede più.
insert into registro
  (league_id, avvenuto_il, azione, attore_user, attore_nome, da_admin,
   player_id, lot_id, dati, impronta)
select a.league_id, a.created_at, 'lotto_annullato', a.actor, 'L''admin', true,
       l.player_id, l.id,
       jsonb_strip_nulls(jsonb_build_object(
         'squadra', a.payload->>'team',
         'giocatore', a.payload->>'in',
         'prezzo', (a.payload->>'price')::int
       )),
       'audit:' || a.id
from audit_log a
left join lots l on l.id = (a.payload->>'lot_id')::uuid
where a.action = 'lot_unassigned' and a.league_id is not null
  and not exists (select 1 from registro r where r.impronta = 'audit:' || a.id);
