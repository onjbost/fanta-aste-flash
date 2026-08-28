'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import {
  loadMarketState, participationsByRole, committedReleaseIds, budgetForLot,
  sessionInfo, runProxyBids, advanceSessions,
} from '@/lib/market';
import { openRoom, openLot, closeLot, closeSession } from '@/lib/settlement';
import { notifyAdmin, tgNewCall, tgSessionClosed } from '@/lib/telegram';
import { validateCall, validateJoin, expectedStatus, type SessionInfo, type Role, type PlayerStatus } from '@/lib/rules';

export type ActionState = { ok: boolean; message: string; warnings?: string[] } | null;

/** Squadra dell'utente collegato, o niente. */
async function me() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, teams(id, name, league_id)').eq('user_id', auth.user.id).maybeSingle();
  const j = m as unknown as { is_admin: boolean; teams: { id: string; name: string; league_id: string } | null } | null;
  return j?.teams ? { ...j.teams, is_admin: j.is_admin } : null;
}

/**
 * Lo stato reale della sessione: quello salvato, corretto con il calendario.
 * Il cron gira una volta al giorno, le scadenze sono alle 21:30 — la fase
 * giusta si calcola sempre dall'orologio, non da quando è passato il cron.
 */
function effectiveSession(row: Record<string, unknown>, cfg: Parameters<typeof expectedStatus>[2]): SessionInfo {
  const s = sessionInfo(row);
  if (s.status === 'live' || s.status === 'closed') return s;
  const derived = expectedStatus(s, new Date(), cfg);
  return { ...s, status: derived === 'live' ? 'joins_closed' : derived };
}

// -------------------------------------------------------------- chiamata

export async function callPlayer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = String(form.get('sessionId') ?? '');
  const targetId = String(form.get('targetId') ?? '');
  const releaseId = String(form.get('releaseId') ?? '');
  if (!sessionId || !targetId || !releaseId) return { ok: false, message: 'Scegli il giocatore da chiamare e quello da svincolare.' };

  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const db = supabaseAdmin();
  const state = await loadMarketState(team.id, sessionId);
  const { data: sessionRow } = await db.from('auction_sessions').select('*').eq('id', sessionId).single();
  if (!sessionRow) return { ok: false, message: 'Asta inesistente.' };
  const session = effectiveSession(sessionRow, state.cfg);

  const { data: target } = await db.from('players')
    .select('id, name, role, status, signing_window, locked_until_number').eq('id', targetId).single();
  if (!target) return { ok: false, message: 'Giocatore inesistente.' };

  const { data: openContract } = await db.from('contracts')
    .select('id').eq('player_id', targetId).is('released_at', null).maybeSingle();

  const { data: existingLots } = await db.from('lots')
    .select('id, player_id, caller_team_id').eq('session_id', sessionId).neq('status', 'cancelled');

  const release = state.roster.find((r) => r.playerId === releaseId) ?? null;

  const result = validateCall({
    now: new Date(),
    session,
    cfg: state.cfg,
    target: {
      playerId: target.id, role: target.role as Role, status: target.status as PlayerStatus,
      signingWindow: target.signing_window as 'summer' | 'winter',
      isFreeAgent: !openContract,
      lockedUntilSession: target.locked_until_number,
    },
    release,
    credits: state.credits,
    releases: state.releases,
    committedReleaseIds: committedReleaseIds(state),
    participationsByRole: participationsByRole(state),
    calledPlayerIds: (existingLots ?? []).map((l) => l.player_id),
  });
  if (!result.ok) return { ok: false, message: result.errors.join(' ') };

  // se qualcuno l'ha già chiamato, la richiesta diventa un'adesione al lotto
  const existing = (existingLots ?? []).find((l) => l.player_id === targetId);
  if (existing) {
    return joinLotInternal(team.id, existing.id, releaseId, null, sessionId);
  }

  const order = (existingLots ?? []).length + 1;
  const { data: lot, error } = await db.from('lots').insert({
    session_id: sessionId, player_id: targetId, caller_team_id: team.id, order_index: order,
  }).select('id').single();
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  const { error: pErr } = await db.from('lot_participants').insert({
    session_id: sessionId, lot_id: lot.id, team_id: team.id, is_caller: true,
    release_player_id: releaseId, budget: result.budget ?? 0,
    status: result.pendingApproval ? 'pending_approval' : 'confirmed',
  });
  if (pErr) {
    await db.from('lots').delete().eq('id', lot.id);
    return { ok: false, message: `Non è andata: ${pErr.message}` };
  }

  // messaggio 1: pronto da copiare, subito
  await queueMessage(team.league_id, sessionId, 'call', {
    callerTeam: team.name, playerId: targetId,
  });
  await notifyAdmin(tgNewCall(team.name, target.name, session.number));

  revalidatePath('/asta');
  return {
    ok: true,
    message: `Chiamata registrata: ${target.name}. Budget su questo lotto: ${result.budget} crediti.`,
    warnings: result.warnings,
  };
}

// -------------------------------------------------------------- adesione

export async function joinLot(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const releaseId = String(form.get('releaseId') ?? '');
  const maxBidRaw = String(form.get('maxBid') ?? '').trim();
  const maxBid = maxBidRaw ? Number(maxBidRaw) : null;

  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots').select('id, session_id').eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };

  return joinLotInternal(team.id, lotId, releaseId, maxBid, lot.session_id);
}

async function joinLotInternal(
  teamId: string, lotId: string, releaseId: string, maxBid: number | null, sessionId: string,
): Promise<ActionState> {
  const db = supabaseAdmin();
  const state = await loadMarketState(teamId, sessionId);
  const { data: sessionRow } = await db.from('auction_sessions').select('*').eq('id', sessionId).single();
  const session = effectiveSession(sessionRow!, state.cfg);

  const { data: lot } = await db.from('lots')
    .select('id, caller_team_id, players(role)').eq('id', lotId).single();
  const role = (lot as unknown as { players: { role: Role } | null }).players?.role ?? 'D';

  const { data: already } = await db.from('lot_participants')
    .select('id').eq('lot_id', lotId).eq('team_id', teamId).neq('status', 'cancelled').maybeSingle();

  const release = state.roster.find((r) => r.playerId === releaseId) ?? null;

  const result = validateJoin({
    now: new Date(), session, cfg: state.cfg,
    lot: { playerId: lotId, role, callerTeamId: lot!.caller_team_id },
    myTeamId: teamId,
    alreadyJoined: !!already,
    release,
    credits: state.credits,
    releases: state.releases,
    committedReleaseIds: committedReleaseIds(state),
    participationsByRole: participationsByRole(state),
  });
  if (!result.ok) return { ok: false, message: result.errors.join(' ') };

  if (maxBid != null && (!Number.isInteger(maxBid) || maxBid < 1)) {
    return { ok: false, message: 'L\'offerta massima deve essere un numero intero di crediti.' };
  }
  if (maxBid != null && result.budget != null && maxBid > result.budget) {
    return { ok: false, message: `L'offerta massima non può superare il tuo budget di ${result.budget} crediti.` };
  }

  const { error } = await db.from('lot_participants').insert({
    session_id: sessionId, lot_id: lotId, team_id: teamId, is_caller: false,
    release_player_id: releaseId, budget: result.budget ?? 0,
    status: result.pendingApproval ? 'pending_approval' : 'confirmed',
  });
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  if (maxBid != null) {
    await db.from('proxy_bids').upsert({ lot_id: lotId, team_id: teamId, max_amount: maxBid });
  }

  revalidatePath('/asta');
  return {
    ok: true,
    message: `Adesione registrata. Budget su questo lotto: ${result.budget} crediti.`
      + (maxBid != null ? ` Offerta massima ${maxBid} lasciata al sistema.` : ''),
    warnings: result.warnings,
  };
}

/** Ritiro di una chiamata o di un'adesione, possibile fino a T−5. */
export async function withdrawParticipation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const db = supabaseAdmin();
  const { data: part } = await db.from('lot_participants')
    .select('id, session_id, is_caller').eq('lot_id', lotId).eq('team_id', team.id)
    .neq('status', 'cancelled').maybeSingle();
  if (!part) return { ok: false, message: 'Non partecipi a questo lotto.' };

  const state = await loadMarketState(team.id, part.session_id);
  const { data: sessionRow } = await db.from('auction_sessions').select('*').eq('id', part.session_id).single();
  const session = effectiveSession(sessionRow!, state.cfg);
  if (session.status !== 'calls_open') {
    return { ok: false, message: 'Le chiamate sono chiuse: da adesso il lotto è vincolante.' };
  }

  await db.from('lot_participants').update({ status: 'cancelled' }).eq('id', part.id);
  await db.from('proxy_bids').delete().eq('lot_id', lotId).eq('team_id', team.id);

  const { count } = await db.from('lot_participants')
    .select('id', { count: 'exact', head: true }).eq('lot_id', lotId).neq('status', 'cancelled');
  if ((count ?? 0) === 0) await db.from('lots').update({ status: 'cancelled' }).eq('id', lotId);

  revalidatePath('/asta');
  return { ok: true, message: 'Ritirato. Puoi rifare la chiamata con un altro giocatore.' };
}

/** Offerta massima: si può lasciare o cambiare fino alla chiusura delle adesioni. */
export async function setMaxBid(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const raw = String(form.get('maxBid') ?? '').trim();
  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const db = supabaseAdmin();
  const { data: part } = await db.from('lot_participants')
    .select('session_id, release_player_id').eq('lot_id', lotId).eq('team_id', team.id)
    .eq('status', 'confirmed').maybeSingle();
  if (!part) return { ok: false, message: 'Non partecipi a questo lotto.' };

  if (!raw) {
    await db.from('proxy_bids').delete().eq('lot_id', lotId).eq('team_id', team.id);
    revalidatePath('/asta');
    return { ok: true, message: 'Offerta massima rimossa.' };
  }

  const max = Number(raw);
  const state = await loadMarketState(team.id, part.session_id);
  const budget = budgetForLot(state, part.release_player_id);
  if (!Number.isInteger(max) || max < 1) return { ok: false, message: 'Serve un numero intero di crediti.' };
  if (max > budget) return { ok: false, message: `Il tuo budget su questo lotto è ${budget} crediti.` };

  await db.from('proxy_bids').upsert({ lot_id: lotId, team_id: team.id, max_amount: max });
  revalidatePath('/asta');
  return { ok: true, message: `Offerta massima ${max} registrata. Il sistema rilancerà per te fino a lì.` };
}

// ------------------------------------------------------------- rilancio

export async function placeBid(lotId: string, amount: number): Promise<ActionState> {
  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const db = supabaseAdmin();
  const { data: part } = await db.from('lot_participants')
    .select('session_id, release_player_id').eq('lot_id', lotId).eq('team_id', team.id)
    .eq('status', 'confirmed').eq('withdrawn', false).maybeSingle();
  if (!part) return { ok: false, message: 'Non partecipi a questo lotto.' };

  const state = await loadMarketState(team.id, part.session_id);
  const budget = budgetForLot(state, part.release_player_id);

  const { data, error } = await db.rpc('fn_place_bid', {
    p_lot_id: lotId, p_team_id: team.id, p_amount: amount, p_budget: budget, p_is_auto: false,
  });
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, message: row?.reason ?? 'Rilancio rifiutato.' };

  await runProxyBids(lotId);
  return { ok: true, message: `Offerta di ${amount} accettata.` };
}

/** Chiusura del lotto a timer scaduto: la può chiamare chiunque stia guardando. */
export async function settleExpiredLot(lotId: string): Promise<ActionState> {
  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta.' };
  const r = await closeLot(lotId);
  revalidatePath('/asta/sala');
  return { ok: r.ok, message: r.message };
}

// ------------------------------------------------------------ regia admin

async function requireAdmin() {
  const team = await me();
  if (!team?.is_admin) return null;
  return team;
}

export async function adminOpenRoom(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await requireAdmin())) return { ok: false, message: 'Serve essere admin.' };
  const r = await openRoom(String(form.get('sessionId') ?? ''));
  revalidatePath('/asta/sala');
  revalidatePath('/admin');
  return r;
}

export async function adminOpenLot(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await requireAdmin())) return { ok: false, message: 'Serve essere admin.' };
  const r = await openLot(String(form.get('lotId') ?? ''));
  revalidatePath('/asta/sala');
  return r;
}

export async function adminCloseLot(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await requireAdmin())) return { ok: false, message: 'Serve essere admin.' };
  const r = await closeLot(String(form.get('lotId') ?? ''), true);
  revalidatePath('/asta/sala');
  return r;
}

export async function adminCloseSession(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await requireAdmin())) return { ok: false, message: 'Serve essere admin.' };
  const sessionId = String(form.get('sessionId') ?? '');
  const r = await closeSession(sessionId);

  const db = supabaseAdmin();
  const { data: s } = await db.from('auction_sessions').select('number').eq('id', sessionId).single();
  const { count } = await db.from('lots')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId).eq('status', 'assigned');
  await notifyAdmin(tgSessionClosed(s?.number ?? 0, count ?? 0));

  revalidatePath('/asta/sala');
  revalidatePath('/admin');
  return r;
}

export async function adminAdvanceSessions(): Promise<ActionState> {
  if (!(await requireAdmin())) return { ok: false, message: 'Serve essere admin.' };
  const changed = await advanceSessions();
  revalidatePath('/asta');
  return { ok: true, message: changed.length ? `${changed.length} sessioni aggiornate.` : 'Nessun cambio di stato.' };
}

// ------------------------------------------------------------- messaggi

async function queueMessage(
  leagueId: string, sessionId: string, kind: 'call', ctx: { callerTeam: string; playerId: string },
) {
  const db = supabaseAdmin();
  const { data: session } = await db.from('auction_sessions').select('*').eq('id', sessionId).single();
  const { data: player } = await db.from('players').select('name, role, club').eq('id', ctx.playerId).single();
  const { data: league } = await db.from('leagues').select('*').eq('id', leagueId).single();
  if (!session || !player || !league) return;

  const { msgNewCall } = await import('@/lib/messages');
  const { cfgFromLeague } = await import('@/lib/market');
  const { callsCloseAt, joinsCloseAt } = await import('@/lib/rules');
  const cfg = cfgFromLeague(league);
  const s = sessionInfo(session);

  const body = msgNewCall(
    {
      number: s.number, auctionAt: s.auctionAt,
      callsCloseAt: callsCloseAt(s, cfg).toISOString(),
      joinsCloseAt: joinsCloseAt(s, cfg).toISOString(),
      excludesNewSignings: s.excludesNewSignings,
    },
    ctx.callerTeam,
    { name: player.name, role: player.role as Role, club: player.club },
  );

  await db.from('messages').insert({ league_id: leagueId, session_id: sessionId, kind, body });
}
