import 'server-only';
import { supabaseAdmin } from './supabase';
import {
  DEFAULT_CONFIG, refundValue, changesLeft, creditsAfter, resolveProxyBid,
  callsCloseAt, joinsCloseAt, expectedStatus,
  type LeagueConfig, type ReleaseRecord, type Role, type RosterPlayer,
  type PlayerStatus, type SessionInfo, type SettledLot,
} from './rules';

/**
 * Stato di mercato di una squadra in una sessione: tutto quello che serve al
 * motore delle regole per dire sì o no. Una sola lettura, poi si ragiona in
 * memoria — così la validazione della chiamata e quella del rilancio usano
 * esattamente gli stessi numeri.
 */
export interface MarketState {
  cfg: LeagueConfig;
  credits: number;
  roster: RosterPlayer[];
  releases: ReleaseRecord[];
  /** svincolandi già impegnati in questa sessione, per lotto */
  commitments: { lotId: string; releasePlayerId: string; role: Role; status: string }[];
  settled: SettledLot[];
}

export function cfgFromLeague(l: Record<string, unknown>): LeagueConfig {
  return {
    refundPct: Number(l.refund_pct ?? 0.75),
    refundRounding: (l.refund_rounding as LeagueConfig['refundRounding']) ?? 'floor',
    changes: {
      P: Number(l.changes_p ?? 1), D: Number(l.changes_d ?? 3),
      C: Number(l.changes_c ?? 3), A: Number(l.changes_a ?? 2),
    },
    returnBonus: Number(l.return_bonus ?? 1),
    returnStartsOn: String(l.return_starts_on ?? '2027-02-01'),
    roster: {
      P: Number(l.roster_p ?? 3), D: Number(l.roster_d ?? 8),
      C: Number(l.roster_c ?? 8), A: Number(l.roster_a ?? 6),
    },
    basePrice: Number(l.base_price ?? 1),
    minIncrement: Number(l.min_increment ?? 1),
    callDeadlineDays: Number(l.call_deadline_days ?? 5),
    joinDeadlineDays: Number(l.join_deadline_days ?? 1),
  };
}

export function sessionInfo(row: Record<string, unknown>): SessionInfo {
  return {
    id: String(row.id),
    number: Number(row.number),
    auctionAt: String(row.auction_at),
    status: row.status as SessionInfo['status'],
    excludesNewSignings: Boolean(row.excludes_new_signings),
  };
}

/** Legge tutto lo stato di mercato di una squadra con il service role. */
export async function loadMarketState(teamId: string, sessionId: string): Promise<MarketState> {
  const db = supabaseAdmin();

  const { data: team } = await db.from('teams').select('league_id').eq('id', teamId).single();
  const [{ data: league }, { data: contracts }, { data: requests }, { data: parts }, { data: credits }] =
    await Promise.all([
      db.from('leagues').select('*').eq('id', team!.league_id).single(),
      db.from('contracts')
        .select('price, released_at, release_type, players(id, name, role, club, status)')
        .eq('team_id', teamId),
      db.from('free_release_requests').select('player_id, status').eq('team_id', teamId),
      db.from('lot_participants')
        .select('lot_id, release_player_id, status, lots(status, winner_team_id, final_price, players(role))')
        .eq('team_id', teamId).eq('session_id', sessionId),
      db.from('v_team_credits').select('credits').eq('team_id', teamId).single(),
    ]);

  const cfg = cfgFromLeague(league ?? {});
  const reqByPlayer = new Map((requests ?? []).map((r) => [r.player_id, r.status]));

  type Row = {
    price: number; released_at: string | null; release_type: string | null;
    players: { id: string; name: string; role: Role; club: string; status: PlayerStatus } | null;
  };
  const rows = (contracts ?? []) as unknown as Row[];

  const roster: RosterPlayer[] = rows
    .filter((c) => !c.released_at && c.players)
    .map((c) => ({
      playerId: c.players!.id, name: c.players!.name, role: c.players!.role,
      club: c.players!.club, status: c.players!.status, price: c.price,
      freeReleaseApproved: reqByPlayer.get(c.players!.id) === 'approved',
      freeReleasePending: reqByPlayer.get(c.players!.id) === 'pending',
      freeReleaseRejected: reqByPlayer.get(c.players!.id) === 'rejected',
    }));

  const releases: ReleaseRecord[] = rows
    .filter((c) => c.released_at && c.players && c.release_type)
    .map((c) => ({ role: c.players!.role, type: c.release_type as ReleaseRecord['type'], at: c.released_at! }));

  type PartRow = {
    lot_id: string; release_player_id: string; status: string;
    lots: { status: string; winner_team_id: string | null; final_price: number | null; players: { role: Role } | null } | null;
  };
  const participations = (parts ?? []) as unknown as PartRow[];

  const commitments = participations
    .filter((p) => p.status !== 'cancelled')
    .map((p) => ({
      lotId: p.lot_id, releasePlayerId: p.release_player_id,
      role: p.lots?.players?.role ?? 'D', status: p.status,
    }));

  // lotti già chiusi stasera: servono a ricalcolare i crediti lotto dopo lotto
  const byPlayer = new Map(roster.map((r) => [r.playerId, r]));
  const settled: SettledLot[] = participations
    .filter((p) => p.lots?.status === 'assigned')
    .map((p) => {
      const won = p.lots!.winner_team_id === teamId;
      const rel = byPlayer.get(p.release_player_id);
      return {
        lotId: p.lot_id, won,
        price: won ? p.lots!.final_price ?? 0 : undefined,
        refund: won && rel ? refundValue(rel, cfg).value : undefined,
      };
    });

  return { cfg, credits: credits?.credits ?? 0, roster, releases, commitments, settled };
}

/** Quanti lotti sto già giocando in un ruolo (le annullate non contano). */
export function participationsByRole(state: MarketState): Record<Role, number> {
  const out: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  state.commitments.forEach((c) => { out[c.role] += 1; });
  return out;
}

export function committedReleaseIds(state: MarketState, exceptLotId?: string): string[] {
  return state.commitments
    .filter((c) => c.lotId !== exceptLotId)
    .map((c) => c.releasePlayerId);
}

/**
 * Il budget vero su un lotto, al momento in cui serve: crediti aggiornati
 * dai lotti già chiusi stasera più il rimborso dello svincolando dichiarato.
 * È questo che fa da tetto ai rilanci — mai un numero salvato ieri.
 */
export function budgetForLot(state: MarketState, releasePlayerId: string): number {
  const rel = state.roster.find((r) => r.playerId === releasePlayerId);
  if (!rel) return 0;
  return creditsAfter(state.credits, state.settled) + refundValue(rel, state.cfg).value;
}

export function changesLeftFor(state: MarketState, role: Role, at = new Date()): number {
  return changesLeft(state.releases, role, at, state.cfg);
}

// ------------------------------------------------------- offerte massime

/**
 * Dopo ogni rilancio umano, chi ha lasciato un'offerta massima risponde.
 * Il tetto effettivo di ciascuno è il minimo tra quello che ha dichiarato e
 * il budget che ha davvero in quel momento.
 */
export async function runProxyBids(lotId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots')
    .select('id, session_id, status, current_price, current_leader').eq('id', lotId).single();
  if (!lot || lot.status !== 'live') return;

  const { data: proxies } = await db.from('proxy_bids')
    .select('team_id, max_amount').eq('lot_id', lotId);
  if (!proxies || proxies.length === 0) return;

  const { data: parts } = await db.from('lot_participants')
    .select('team_id, release_player_id').eq('lot_id', lotId)
    .eq('status', 'confirmed').eq('withdrawn', false);

  const candidates: { teamId: string; max: number; budget: number }[] = [];
  for (const p of proxies) {
    const part = (parts ?? []).find((x) => x.team_id === p.team_id);
    if (!part) continue;
    const state = await loadMarketState(p.team_id, lot.session_id);
    candidates.push({
      teamId: p.team_id,
      max: p.max_amount,
      budget: budgetForLot(state, part.release_player_id),
    });
  }
  if (candidates.length === 0) return;

  const { data: league } = await db.from('leagues').select('*').limit(1).single();
  const cfg = cfgFromLeague(league ?? {});

  const next = resolveProxyBid(lot.current_price, lot.current_leader, candidates, cfg);
  if (!next) return;

  const winner = candidates.find((c) => c.teamId === next.teamId)!;
  await db.rpc('fn_place_bid', {
    p_lot_id: lotId, p_team_id: next.teamId, p_amount: next.amount,
    p_budget: winner.budget, p_is_auto: true,
  });
}

// --------------------------------------------------- stato del calendario

/** Lo stato che ogni sessione dovrebbe avere adesso, secondo il calendario. */
export async function advanceSessions(now = new Date()): Promise<{ id: string; from: string; to: string }[]> {
  const db = supabaseAdmin();
  const { data: league } = await db.from('leagues').select('*').limit(1).single();
  const cfg = cfgFromLeague(league ?? {});
  const { data: sessions } = await db.from('auction_sessions')
    .select('*').eq('league_id', league!.id).order('number');

  const changed: { id: string; from: string; to: string }[] = [];
  for (const row of sessions ?? []) {
    const s = sessionInfo(row);
    // live e closed li muove l'admin dalla sala: il calendario non li tocca
    if (s.status === 'live' || s.status === 'closed') continue;
    const target = expectedStatus(s, now, cfg);
    // il passaggio a 'live' è manuale: il cron si ferma un gradino prima
    const next = target === 'live' ? 'joins_closed' : target;
    if (next !== s.status) {
      await db.from('auction_sessions').update({ status: next }).eq('id', s.id);
      changed.push({ id: s.id, from: s.status, to: next });
    }
  }
  return changed;
}

export { callsCloseAt, joinsCloseAt, expectedStatus, DEFAULT_CONFIG };
