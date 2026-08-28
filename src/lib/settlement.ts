import 'server-only';
import { supabaseAdmin } from './supabase';
import { loadMarketState, budgetForLot, cfgFromLeague } from './market';
import { refundValue, changesLeft, ROLE_LABEL, type Role } from './rules';
import { notifyAdmin, tgLotSettled } from './telegram';
import { queueSessionMessage } from './messageBuilder';

/**
 * Esecuzione del mercato: apertura della sala, apertura dei lotti, chiusura
 * e movimenti. Tutto quello che tocca contratti e crediti passa da qui.
 *
 * Regola di fondo: chi vince svincola, incassa e paga; chi perde non subisce
 * nulla — il suo giocatore resta in rosa al prezzo d'acquisto originario.
 */

export interface SettleResult {
  ok: boolean;
  message: string;
  lotId?: string;
}

/** Apre la sala: assegna i lotti senza contendenti e manda la sessione in live. */
export async function openRoom(sessionId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: session } = await db.from('auction_sessions').select('*').eq('id', sessionId).single();
  if (!session) return { ok: false, message: 'Sessione inesistente.' };
  if (session.status === 'live') return { ok: false, message: 'La sala è già aperta.' };
  if (session.status === 'closed') return { ok: false, message: 'Questa asta è chiusa.' };

  const { data: pending } = await db.from('lot_participants')
    .select('team_id, teams(name)').eq('session_id', sessionId).eq('status', 'pending_approval');
  if (pending && pending.length > 0) {
    const names = (pending as unknown as { teams: { name: string } | null }[])
      .map((p) => p.teams?.name).filter(Boolean).join(', ');
    return {
      ok: false,
      message: `Ci sono richieste di svincolo gratuito da decidere (${names}). Decidile prima di aprire la sala.`,
    };
  }

  const { data: lots } = await db.from('lots')
    .select('id, status, caller_team_id, order_index').eq('session_id', sessionId)
    .neq('status', 'cancelled').order('order_index');

  let assigned = 0;
  for (const lot of lots ?? []) {
    const { data: parts } = await db.from('lot_participants')
      .select('team_id, release_player_id, is_caller')
      .eq('lot_id', lot.id).eq('status', 'confirmed').eq('withdrawn', false);

    if (!parts || parts.length === 0) {
      await db.from('lots').update({ status: 'cancelled' }).eq('id', lot.id);
      continue;
    }
    if (parts.length === 1) {
      // nessun contendente: il chiamante paga il 75% del proprio svincolando
      const only = parts[0];
      const state = await loadMarketState(only.team_id, sessionId);
      const rel = state.roster.find((r) => r.playerId === only.release_player_id);
      const price = rel ? refundValue(rel, state.cfg).value : 0;
      await db.from('lots').update({
        status: 'assigned', winner_team_id: only.team_id, final_price: price,
        current_price: price, current_leader: only.team_id, closed_at: new Date().toISOString(),
      }).eq('id', lot.id);
      await applyMovements(lot.id, only.team_id, price, true);
      assigned += 1;
    }
  }

  await db.from('auction_sessions')
    .update({ status: 'live', room_opened_at: new Date().toISOString() }).eq('id', sessionId);

  // il messaggio di svelamento si scrive da solo: adesso svincolandi e budget
  // sono pubblici, quindi il testo per il gruppo è finalmente componibile
  await queueSessionMessage(sessionId, 'room_open');

  return {
    ok: true,
    message: assigned
      ? `Sala aperta. ${assigned} ${assigned === 1 ? 'lotto assegnato' : 'lotti assegnati'} senza contendenti.`
      : 'Sala aperta.',
  };
}

/** Manda un lotto all'asta: parte il timer, si può rilanciare. */
export async function openLot(lotId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots').select('id, status, session_id').eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.status !== 'called') return { ok: false, message: 'Questo lotto non è in attesa.' };

  const { data: session } = await db.from('auction_sessions')
    .select('status, league_id').eq('id', lot.session_id).single();
  if (session?.status !== 'live') return { ok: false, message: 'La sala non è aperta.' };

  const { data: league } = await db.from('leagues').select('timer_seconds').eq('id', session.league_id).single();
  const seconds = league?.timer_seconds ?? 10;

  const { data: open } = await db.from('lots')
    .select('id').eq('session_id', lot.session_id).eq('status', 'live').maybeSingle();
  if (open) return { ok: false, message: 'C\'è già un lotto all\'asta: chiudi quello prima.' };

  await db.from('lots').update({
    status: 'live',
    opened_at: new Date().toISOString(),
    timer_ends_at: new Date(Date.now() + seconds * 1000).toISOString(),
  }).eq('id', lotId);

  return { ok: true, message: 'Lotto aperto.', lotId };
}

/**
 * Chiude un lotto quando il timer è scaduto. È idempotente e sicura da
 * chiamare da qualsiasi client che veda il countdown a zero: se qualcun altro
 * l'ha già chiusa, non succede niente.
 */
export async function closeLot(lotId: string, force = false): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots').select('*').eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.status === 'assigned') return { ok: true, message: 'Lotto già chiuso.' };
  if (lot.status !== 'live') return { ok: false, message: 'Il lotto non è aperto.' };
  if (!force && lot.timer_ends_at && new Date(lot.timer_ends_at) > new Date()) {
    return { ok: false, message: 'Il timer non è ancora scaduto.' };
  }

  let winner = lot.current_leader as string | null;
  let price = lot.current_price as number | null;

  // nessuno ha rilanciato: il lotto va al chiamante alle condizioni che
  // avrebbe avuto senza contendenti, cioè il 75% del suo svincolando
  if (!winner) {
    const { data: caller } = await db.from('lot_participants')
      .select('team_id, release_player_id').eq('lot_id', lotId).eq('is_caller', true)
      .eq('status', 'confirmed').maybeSingle();
    if (!caller) {
      await db.from('lots').update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('id', lotId);
      return { ok: true, message: 'Nessuna offerta e nessun chiamante: lotto annullato.' };
    }
    const state = await loadMarketState(caller.team_id, lot.session_id);
    const rel = state.roster.find((r) => r.playerId === caller.release_player_id);
    winner = caller.team_id;
    price = rel ? refundValue(rel, state.cfg).value : 0;
  }

  // chiusura condizionata: se un'altra richiesta ha già chiuso il lotto,
  // questa update non trova più la riga in stato 'live' e si ferma qui
  const { data: updated } = await db.from('lots').update({
    status: 'assigned', winner_team_id: winner, final_price: price,
    closed_at: new Date().toISOString(),
  }).eq('id', lotId).eq('status', 'live').select('id');
  if (!updated || updated.length === 0) return { ok: true, message: 'Lotto già chiuso.' };

  await applyMovements(lotId, winner!, price ?? 0, false);
  return { ok: true, message: 'Lotto assegnato.', lotId };
}

/**
 * I movimenti veri: svincolo, rimborso, acquisto, blocco del giocatore uscito
 * e la riga da replicare su Leghe Fantacalcio.it.
 */
async function applyMovements(
  lotId: string, winnerTeamId: string, price: number, uncontested: boolean,
): Promise<void> {
  const db = supabaseAdmin();

  const { data: lot } = await db.from('lots')
    .select('id, session_id, player_id, players(name, role), auction_sessions(number, league_id)')
    .eq('id', lotId).single();
  const target = (lot as unknown as { players: { name: string; role: Role } | null }).players;
  const sess = (lot as unknown as { auction_sessions: { number: number; league_id: string } | null }).auction_sessions;
  const leagueId = sess!.league_id;

  const { data: part } = await db.from('lot_participants')
    .select('release_player_id').eq('lot_id', lotId).eq('team_id', winnerTeamId).single();

  const state = await loadMarketState(winnerTeamId, lot!.session_id);
  const released = state.roster.find((r) => r.playerId === part!.release_player_id);
  if (!released) return;
  const refund = refundValue(released, state.cfg);

  const creditsBefore = state.credits;
  const now = new Date().toISOString();

  // 1. chiudo il contratto del giocatore svincolato
  await db.from('contracts').update({
    released_at: now, release_type: refund.type,
    release_value: refund.value, session_id: lot!.session_id,
  }).eq('team_id', winnerTeamId).eq('player_id', released.playerId).is('released_at', null);

  // 2. il giocatore uscito non è richiamabile fino alla sessione successiva
  await db.from('players')
    .update({ locked_until_number: (sess!.number ?? 0) + 1 })
    .eq('id', released.playerId);

  // 3. movimenti di credito: prima incasso, poi pago
  await db.from('credit_movements').insert([
    {
      league_id: leagueId, team_id: winnerTeamId, amount: refund.value, reason: 'refund',
      note: `Svincolo ${released.name} (${refund.reason})`, session_id: lot!.session_id, lot_id: lotId,
    },
    {
      league_id: leagueId, team_id: winnerTeamId, amount: -price, reason: 'purchase',
      note: `Acquisto ${target?.name ?? ''} all'asta flash`, session_id: lot!.session_id, lot_id: lotId,
    },
  ]);

  // 4. il nuovo contratto
  await db.from('contracts').insert({
    league_id: leagueId, team_id: winnerTeamId, player_id: lot!.player_id,
    price, acquisition_type: 'flash_auction', session_id: lot!.session_id,
  });

  // 5. la riga operativa per l'admin
  const { data: team } = await db.from('teams').select('name').eq('id', winnerTeamId).single();
  const after = creditsBefore + refund.value - price;
  const role = target?.role ?? released.role;
  const left = changesLeft(
    [...state.releases, { role: released.role, type: refund.type, at: now }],
    role, new Date(), state.cfg,
  );

  const taskBody = `Nella rosa ${team?.name}: svincolare ${released.name} (+${refund.value} cr`
      + `${refund.free ? ', cambio gratuito' : ''}), acquistare ${target?.name} per ${price} cr.`
      + ` Crediti: ${creditsBefore} → ${after}. Cambi ${ROLE_LABEL[role].slice(0, 3).toUpperCase()}: ${left}`
      + `${uncontested ? ' · lotto senza contendenti' : ''}`;

  await db.from('admin_tasks').insert({
    league_id: leagueId, session_id: lot!.session_id, lot_id: lotId, body: taskBody,
  });
  await notifyAdmin(tgLotSettled(taskBody));

  await db.from('audit_log').insert({
    league_id: leagueId, action: 'lot_settled',
    payload: {
      lot_id: lotId, team: team?.name, in: target?.name, out: released.name,
      price, refund: refund.value, credits_before: creditsBefore, credits_after: after,
      uncontested,
    },
  });
}

/** Chiude la serata: nessun lotto resta appeso, la sessione va in archivio. */
export async function closeSession(sessionId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: openLots } = await db.from('lots')
    .select('id').eq('session_id', sessionId).in('status', ['live', 'called']);
  for (const l of openLots ?? []) await closeLot(l.id, true);
  await db.from('auction_sessions').update({ status: 'closed' }).eq('id', sessionId);

  // e il riepilogo dei risultati, con i conti già chiusi
  await queueSessionMessage(sessionId, 'results');

  return { ok: true, message: 'Asta chiusa.' };
}

export { budgetForLot, cfgFromLeague };
