import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';
import {
  DEFAULT_CONFIG, changesSummary, refundValue,
  type LeagueConfig, type ReleaseRecord, type Role, type RosterPlayer,
  type PlayerStatus, type SessionInfo,
} from './rules';

export interface TeamContext {
  team: { id: string; name: string; managerName: string; isAdmin: boolean; leagueId: string };
  cfg: LeagueConfig;
  credits: number;
  roster: (RosterPlayer & { refund: number; refundFree: boolean; refundReason: string })[];
  releases: ReleaseRecord[];
  changes: ReturnType<typeof changesSummary>;
  nextSession: SessionInfo | null;
}

function cfgFromRow(l: Record<string, unknown>): LeagueConfig {
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

/** Tutto quello che serve alla dashboard, in una sola andata al database. */
export async function loadTeamContext(): Promise<TeamContext | null> {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data: team } = await db
    .from('teams')
    .select('id, name, manager_name, is_admin, league_id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!team) return null;

  const [{ data: league }, { data: credits }, { data: contracts }, { data: requests }, { data: sessions }] =
    await Promise.all([
      db.from('leagues').select('*').eq('id', team.league_id).single(),
      db.from('v_team_credits').select('credits').eq('team_id', team.id).single(),
      db.from('contracts')
        .select('id, price, released_at, release_type, players(id, name, role, club, status, out_of_list)')
        .eq('team_id', team.id),
      db.from('free_release_requests').select('player_id, status').eq('team_id', team.id),
      db.from('auction_sessions').select('id, number, auction_at, status, excludes_new_signings')
        .eq('league_id', team.league_id).order('number'),
    ]);

  const cfg = league ? cfgFromRow(league) : DEFAULT_CONFIG;
  const reqByPlayer = new Map((requests ?? []).map((r) => [r.player_id, r.status]));

  type ContractRow = {
    id: string; price: number; released_at: string | null; release_type: string | null;
    players: {
      id: string; name: string; role: Role; club: string;
      status: PlayerStatus; out_of_list: boolean;
    } | null;
  };
  const rows = (contracts ?? []) as unknown as ContractRow[];

  const roster = rows
    .filter((c) => c.released_at === null && c.players)
    .map((c) => {
      const p = c.players!;
      const st = reqByPlayer.get(p.id);
      const base: RosterPlayer = {
        playerId: p.id, name: p.name, role: p.role, club: p.club,
        status: p.status, price: c.price, outOfList: !!p.out_of_list,
        freeReleaseApproved: st === 'approved',
        freeReleasePending: st === 'pending',
        freeReleaseRejected: st === 'rejected',
      };
      const r = refundValue(base, cfg);
      return { ...base, refund: r.value, refundFree: r.free, refundReason: r.reason };
    })
    .sort((a, b) => 'PDCA'.indexOf(a.role) - 'PDCA'.indexOf(b.role) || b.price - a.price);

  const releases: ReleaseRecord[] = rows
    .filter((c) => c.released_at && c.players && c.release_type)
    .map((c) => ({
      role: c.players!.role,
      type: c.release_type as ReleaseRecord['type'],
      at: c.released_at!,
    }));

  const now = new Date();
  const next = (sessions ?? [])
    .map((s) => ({
      id: s.id, number: s.number, auctionAt: s.auction_at,
      status: s.status as SessionInfo['status'],
      excludesNewSignings: s.excludes_new_signings,
    }))
    .find((s) => new Date(s.auctionAt) >= now || s.status === 'live') ?? null;

  return {
    team: {
      id: team.id, name: team.name, managerName: team.manager_name,
      isAdmin: team.is_admin, leagueId: team.league_id,
    },
    cfg,
    credits: credits?.credits ?? 0,
    roster,
    releases,
    changes: changesSummary(releases, now, cfg),
    nextSession: next,
  };
}

export interface FreeAgent {
  id: string; name: string; role: Role; club: string;
  quotation: number; status: PlayerStatus; signingWindow: 'summer' | 'winter';
  outOfList: boolean;
  /** prima sessione in cui torna chiamabile, se è appena uscito da una rosa */
  lockedUntilNumber: number | null;
}

/** Il listone degli svincolati, con il filtro applicato lato database. */
export async function loadFreeAgents(filter: { role?: Role; q?: string } = {}): Promise<FreeAgent[]> {
  const db = await supabaseServer();
  let query = db.from('v_free_agents')
    .select('id, name, role, club, quotation, status, signing_window, out_of_list, locked_until_number')
    .order('quotation', { ascending: false })
    .limit(400);
  if (filter.role) query = query.eq('role', filter.role);
  if (filter.q) query = query.ilike('name', `%${filter.q}%`);
  const { data } = await query;
  return (data ?? []).map((p) => ({
    id: p.id, name: p.name, role: p.role as Role, club: p.club,
    quotation: p.quotation, status: p.status as PlayerStatus,
    signingWindow: p.signing_window as 'summer' | 'winter',
    outOfList: !!p.out_of_list,
    lockedUntilNumber: p.locked_until_number ?? null,
  }));
}

/**
 * Il contesto della squadra, o la pagina giusta dove mandare chi non ce l'ha.
 *
 * Distinguere i due casi e' essenziale: chi non ha una sessione va al login,
 * ma chi ha appena fatto il primo accesso e non e' ancora collegato a una
 * squadra va spiegato, non rimbalzato. Mandarlo al login creerebbe un giro
 * infinito, perche' il middleware rimanda subito dentro chi e' autenticato.
 */
export async function requireTeamContext(): Promise<TeamContext> {
  const ctx = await loadTeamContext();
  if (ctx) return ctx;

  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  redirect(data.user ? '/benvenuto' : '/login');
}
