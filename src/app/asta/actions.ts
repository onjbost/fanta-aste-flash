'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import {
  loadMarketState, participationsByRole, committedReleaseIds, budgetForLot,
  sessionInfo, runProxyBids, advanceSessions,
} from '@/lib/market';
import { openRoom, openLot, closeLot, closeSession } from '@/lib/settlement';
import { notifyAdmin, tgSessionClosed, archiveMessage, tgParticipationCancelled } from '@/lib/telegram';
import {
  validateCall, validateJoin, expectedStatus, callsCloseAt, joinsCloseAt,
  type SessionInfo, type Role, type PlayerStatus,
} from '@/lib/rules';

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


/**
 * Crea la partecipazione, oppure fa rivivere quella annullata in precedenza.
 *
 * Il vincolo (lotto, squadra) è unico: una squadra che si era ritirata e ci
 * ripensa non può inserire una riga nuova. Riusiamo la sua, ripulendo le
 * tracce dell'annullamento — altrimenti "ritirati e rifallo" sarebbe un
 * vicolo cieco.
 */
async function upsertParticipation(
  db: ReturnType<typeof supabaseAdmin>,
  p: {
    sessionId: string; lotId: string; teamId: string; isCaller: boolean;
    releaseId: string; budget: number; pending: boolean;
  },
) {
  const { data: existing } = await db.from('lot_participants')
    .select('id').eq('lot_id', p.lotId).eq('team_id', p.teamId).maybeSingle();

  const valori = {
    is_caller: p.isCaller,
    release_player_id: p.releaseId,
    budget: p.budget,
    status: p.pending ? 'pending_approval' : 'confirmed',
    withdrawn: false,
    cancelled_reason: null,
    cancelled_at: null,
    cancelled_by: null,
  };

  if (existing) return db.from('lot_participants').update(valori).eq('id', existing.id);
  return db.from('lot_participants').insert({
    session_id: p.sessionId, lot_id: p.lotId, team_id: p.teamId, ...valori,
  });
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

  // tutti i lotti, annullati compresi: quelli vivi bloccano una seconda
  // chiamata sullo stesso giocatore, quelli annullati invece si riaprono
  const { data: allLots } = await db.from('lots')
    .select('id, player_id, caller_team_id, status, order_index').eq('session_id', sessionId);
  const existingLots = (allLots ?? []).filter((l) => l.status !== 'cancelled');

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
    calledPlayerIds: existingLots.map((l) => l.player_id),
  });
  if (!result.ok) return { ok: false, message: result.errors.join(' ') };

  // se qualcuno l'ha già chiamato, la richiesta diventa un'adesione al lotto
  const existing = existingLots.find((l) => l.player_id === targetId);
  if (existing) {
    return joinLotInternal(team.id, existing.id, releaseId, null, sessionId);
  }

  // un lotto annullato sullo stesso giocatore si riapre invece di crearne uno
  // nuovo: la coppia (sessione, giocatore) è unica nel database, e comunque
  // riaprirlo è esattamente quello che l'allenatore si aspetta
  const annullato = (allLots ?? []).find(
    (l) => l.player_id === targetId && l.status === 'cancelled',
  );

  let lotId: string;
  if (annullato) {
    await db.from('lots').update({
      status: 'called', caller_team_id: team.id,
      winner_team_id: null, final_price: null,
      current_price: null, current_leader: null, timer_ends_at: null,
      opened_at: null, closed_at: null,
    }).eq('id', annullato.id);
    lotId = annullato.id;
  } else {
    const order = existingLots.length + 1;
    const { data: lot, error } = await db.from('lots').insert({
      session_id: sessionId, player_id: targetId, caller_team_id: team.id, order_index: order,
    }).select('id').single();
    if (error) return { ok: false, message: `Non è andata: ${error.message}` };
    lotId = lot.id;
  }

  const { error: pErr } = await upsertParticipation(db, {
    sessionId, lotId, teamId: team.id, isCaller: true,
    releaseId, budget: result.budget ?? 0, pending: !!result.pendingApproval,
  });
  if (pErr) {
    if (!annullato) await db.from('lots').delete().eq('id', lotId);
    return { ok: false, message: `Non è andata: ${pErr.message}` };
  }

  // messaggio 1: generato, salvato e mandato su Telegram pronto da incollare
  await queueMessage(team.league_id, sessionId, 'call', {
    callerTeam: team.name, playerId: targetId,
  });

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

  const { error } = await upsertParticipation(db, {
    sessionId, lotId, teamId, isCaller: false,
    releaseId, budget: result.budget ?? 0, pending: !!result.pendingApproval,
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


/**
 * Se chi esce era il chiamante e qualcun altro resta, il lotto passa a lui.
 *
 * Il regolamento dice che il lotto va comunque all'asta tra gli aderenti:
 * lasciare "chiamato da" con il nome di chi si è ritirato sarebbe solo
 * confusione, e chi resta diventa a tutti gli effetti il chiamante.
 */
async function promuoviChiamante(db: ReturnType<typeof supabaseAdmin>, lotId: string) {
  const { data: rimasti } = await db.from('lot_participants')
    .select('id, team_id, is_caller').eq('lot_id', lotId)
    .neq('status', 'cancelled').order('created_at');
  if (!rimasti || rimasti.length === 0) return 0;
  if (rimasti.some((r) => r.is_caller)) return rimasti.length;

  await db.from('lot_participants').update({ is_caller: true }).eq('id', rimasti[0].id);
  await db.from('lots').update({ caller_team_id: rimasti[0].team_id }).eq('id', lotId);
  return rimasti.length;
}

/**
 * Fino a quando si può ancora mettere mano a una partecipazione.
 *
 * Chi ha chiamato ha tempo fino alla chiusura delle chiamate: dopo, il lotto
 * esiste per tutti e ritirarlo cambierebbe le carte a chi ha aderito fidandosi.
 * Chi ha aderito ha tempo fino alla chiusura delle adesioni, cioè finché
 * avrebbe potuto aderire.
 */
function modificabileFino(isCaller: boolean, session: SessionInfo, cfg: Parameters<typeof expectedStatus>[2]) {
  return isCaller ? callsCloseAt(session, cfg) : joinsCloseAt(session, cfg);
}

/**
 * Cambia il giocatore messo sul piatto, lasciando la partecipazione al suo
 * posto. Ricalcola budget e vincoli come se fosse una nuova adesione: il
 * ruolo deve combaciare, lo svincolando non può essere già impegnato altrove
 * e i cambi devono bastare.
 */
export async function updateParticipation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const releaseId = String(form.get('releaseId') ?? '');
  const team = await me();
  if (!team) return { ok: false, message: 'Sessione scaduta, rientra.' };
  if (!releaseId) return { ok: false, message: 'Scegli il giocatore da svincolare.' };

  const db = supabaseAdmin();
  const { data: part } = await db.from('lot_participants')
    .select('id, session_id, is_caller, release_player_id, status')
    .eq('lot_id', lotId).eq('team_id', team.id).neq('status', 'cancelled').maybeSingle();
  if (!part) return { ok: false, message: 'Non partecipi a questo lotto.' };
  if (part.status === 'pending_approval') {
    return { ok: false, message: 'C\'è una richiesta di svincolo gratuito in corso: aspetta la decisione o ritirala.' };
  }
  if (part.release_player_id === releaseId) return { ok: true, message: 'Era già quello.' };

  const state = await loadMarketState(team.id, part.session_id);
  const { data: sessionRow } = await db.from('auction_sessions').select('*').eq('id', part.session_id).single();
  const session = effectiveSession(sessionRow!, state.cfg);

  if (new Date() > modificabileFino(part.is_caller, session, state.cfg)) {
    return {
      ok: false,
      message: part.is_caller
        ? 'Le chiamate sono chiuse: da adesso il lotto è vincolante.'
        : 'Le adesioni sono chiuse: non puoi più cambiare il giocatore da svincolare.',
    };
  }

  const { data: lot } = await db.from('lots')
    .select('caller_team_id, players(name, role)').eq('id', lotId).single();
  const role = (lot as unknown as { players: { name: string; role: Role } | null }).players?.role ?? 'D';

  const release = state.roster.find((r) => r.playerId === releaseId) ?? null;
  const result = validateJoin({
    now: new Date(), session, cfg: state.cfg,
    lot: { playerId: lotId, role, callerTeamId: lot!.caller_team_id },
    myTeamId: team.id,
    // sto cambiando una partecipazione che esiste già: non è un doppione
    alreadyJoined: false,
    release,
    credits: state.credits,
    releases: state.releases,
    // il mio svincolando attuale su QUESTO lotto non deve bloccarmi
    committedReleaseIds: committedReleaseIds(state, lotId),
    participationsByRole: { ...participationsByRole(state), [role]: participationsByRole(state)[role] - 1 },
  });
  if (!result.ok) return { ok: false, message: result.errors.join(' ') };

  const { error } = await db.from('lot_participants').update({
    release_player_id: releaseId,
    budget: result.budget ?? 0,
    status: result.pendingApproval ? 'pending_approval' : 'confirmed',
  }).eq('id', part.id);
  if (error) {
    if (error.code === '23505') {
      return { ok: false, message: 'Hai già messo questo giocatore sul piatto in un altro lotto di questa asta.' };
    }
    return { ok: false, message: `Non è andata: ${error.message}` };
  }

  // l'offerta massima era tarata sul budget vecchio: se ora sfora, la tolgo
  const { data: proxy } = await db.from('proxy_bids')
    .select('max_amount').eq('lot_id', lotId).eq('team_id', team.id).maybeSingle();
  let nota = '';
  if (proxy && result.budget != null && proxy.max_amount > result.budget) {
    await db.from('proxy_bids').delete().eq('lot_id', lotId).eq('team_id', team.id);
    nota = ' La tua offerta massima superava il nuovo budget: l\'ho tolta, rimettila se vuoi.';
  }

  revalidatePath('/asta');
  return {
    ok: true,
    message: `Ora metti sul piatto ${release?.name}. Budget su questo lotto: ${result.budget} crediti.${nota}`,
    warnings: result.warnings,
  };
}

/**
 * Ritiro della propria chiamata o adesione. Se il lotto resta senza nessuno,
 * sparisce anche il lotto.
 */
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

  if (new Date() > modificabileFino(part.is_caller, session, state.cfg)) {
    return {
      ok: false,
      message: part.is_caller
        ? 'Le chiamate sono chiuse: da adesso il lotto è vincolante.'
        : 'Le adesioni sono chiuse: non puoi più ritirarti.',
    };
  }

  await db.from('lot_participants').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(),
    cancelled_reason: 'Ritirata dalla squadra',
  }).eq('id', part.id);
  await db.from('proxy_bids').delete().eq('lot_id', lotId).eq('team_id', team.id);

  const rimasti = await promuoviChiamante(db, lotId);
  if (rimasti === 0) await db.from('lots').update({ status: 'cancelled' }).eq('id', lotId);

  const { data: lot } = await db.from('lots').select('players(name)').eq('id', lotId).single();
  const nome = (lot as unknown as { players: { name: string } | null }).players?.name ?? '';
  await notifyAdmin(tgParticipationCancelled(team.name, nome, part.is_caller, false));

  revalidatePath('/asta');
  return {
    ok: true,
    message: rimasti === 0
      ? 'Ritirata: nessun altro partecipava, il lotto è stato annullato. Puoi rifare la stessa chiamata quando vuoi.'
      : 'Ritirata. Il lotto resta agli altri partecipanti, e tu puoi rientrarci.',
  };
}

/**
 * L'admin annulla la chiamata o l'adesione di una squadra, con un motivo che
 * l'allenatore legge dentro l'app. Serve quando qualcosa non torna e non c'è
 * tempo per discuterne nel gruppo.
 */
export async function adminCancelParticipation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const participantId = String(form.get('participantId') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) return { ok: false, message: 'Scrivi il motivo: chi la subisce deve poterlo leggere.' };

  const db = supabaseAdmin();
  const { data: part } = await db.from('lot_participants')
    .select('id, lot_id, team_id, is_caller, status, teams(name), lots(players(name))')
    .eq('id', participantId).maybeSingle();
  if (!part) return { ok: false, message: 'Partecipazione non trovata.' };
  if (part.status === 'cancelled') return { ok: true, message: 'Era già annullata.' };

  const j = part as unknown as {
    teams: { name: string } | null;
    lots: { players: { name: string } | null } | null;
  };

  await db.from('lot_participants').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_by: admin.userId,
    cancelled_reason: reason,
  }).eq('id', participantId);
  await db.from('proxy_bids').delete().eq('lot_id', part.lot_id).eq('team_id', part.team_id);

  const rimasti = await promuoviChiamante(db, part.lot_id);
  if (rimasti === 0) await db.from('lots').update({ status: 'cancelled' }).eq('id', part.lot_id);

  await db.from('audit_log').insert({
    league_id: admin.league_id, actor: admin.userId, action: 'participation_cancelled',
    payload: {
      team: j.teams?.name, player: j.lots?.players?.name,
      is_caller: part.is_caller, reason,
    },
  });

  revalidatePath('/asta');
  return {
    ok: true,
    message: `${j.teams?.name}: ${part.is_caller ? 'chiamata' : 'adesione'} annullata.`
      + (rimasti === 0 ? ' Il lotto è rimasto vuoto ed è stato annullato.' : ''),
  };
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
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin
    ? { id: m.team_id, league_id: m.league_id, userId: auth.user.id }
    : null;
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
  await archiveMessage(kind, s.number, body);
}
