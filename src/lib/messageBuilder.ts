import 'server-only';
import { supabaseAdmin } from './supabase';
import { archiveMessage } from './telegram';
import { cfgFromLeague, sessionInfo } from './market';
import { callsCloseAt, joinsCloseAt, refundValue, type Role, type PlayerStatus } from './rules';
import {
  msgCallsClosed, msgJoinsClosed, msgRoomOpen, msgResults,
  type MessageKind, type MsgLot, type MsgSession, type MsgParticipant,
} from './messages';

/**
 * Costruisce i messaggi 2-5 leggendo la sessione. La regola di riservatezza
 * vive qui: gli svincolandi e i budget entrano nel testo solo dal messaggio
 * di apertura sala in poi. Prima non vengono nemmeno letti.
 */
export async function buildMessage(sessionId: string, kind: MessageKind): Promise<string> {
  const db = supabaseAdmin();
  const { data: sessionRow } = await db.from('auction_sessions').select('*').eq('id', sessionId).single();
  if (!sessionRow) return '';
  const { data: league } = await db.from('leagues').select('*').eq('id', sessionRow.league_id).single();
  const cfg = cfgFromLeague(league ?? {});
  const s = sessionInfo(sessionRow);

  const session: MsgSession = {
    number: s.number,
    auctionAt: s.auctionAt,
    callsCloseAt: callsCloseAt(s, cfg).toISOString(),
    joinsCloseAt: joinsCloseAt(s, cfg).toISOString(),
    excludesNewSignings: s.excludesNewSignings,
  };

  const reveal = kind === 'room_open' || kind === 'results';

  const { data: lotRows } = await db.from('lots')
    .select(`id, order_index, status, winner_team_id, final_price, current_price,
             players(name, role, club), teams:caller_team_id(name)`)
    .eq('session_id', sessionId).neq('status', 'cancelled').order('order_index');

  type LotRow = {
    id: string; order_index: number; status: string;
    winner_team_id: string | null; final_price: number | null; current_price: number | null;
    players: { name: string; role: Role; club: string } | null;
    teams: { name: string } | null;
  };
  const rows = (lotRows ?? []) as unknown as LotRow[];

  const lots: MsgLot[] = [];
  for (const row of rows) {
    const { data: partRows } = await db.from('lot_participants')
      .select('team_id, is_caller, release_player_id, teams(name), players(name, role, status)')
      .eq('lot_id', row.id).eq('status', 'confirmed').eq('withdrawn', false)
      .order('is_caller', { ascending: false });

    type PartRow = {
      team_id: string; is_caller: boolean; release_player_id: string;
      teams: { name: string } | null;
      players: { name: string; role: Role; status: PlayerStatus } | null;
    };
    const parts = (partRows ?? []) as unknown as PartRow[];

    const participants: MsgParticipant[] = [];
    for (const p of parts) {
      const base: MsgParticipant = { teamName: p.teams?.name ?? '?', isCaller: p.is_caller };
      if (reveal) {
        const { data: contract } = await db.from('contracts')
          .select('price').eq('team_id', p.team_id).eq('player_id', p.release_player_id)
          .order('acquired_at', { ascending: false }).limit(1).maybeSingle();
        const { data: req } = await db.from('free_release_requests')
          .select('status').eq('team_id', p.team_id).eq('player_id', p.release_player_id)
          .eq('status', 'approved').maybeSingle();
        const price = contract?.price ?? 0;
        const refund = refundValue({
          playerId: p.release_player_id, name: p.players?.name ?? '', role: p.players?.role ?? 'D',
          club: '', status: p.players?.status ?? 'active', price,
          freeReleaseApproved: !!req,
        }, cfg);
        const { data: credits } = await db.from('v_team_credits')
          .select('credits').eq('team_id', p.team_id).single();
        base.releaseName = p.players?.name;
        base.releasePrice = price;
        base.refund = refund.value;
        base.budget = (credits?.credits ?? 0) + refund.value;
      }
      participants.push(base);
    }

    const lot: MsgLot = {
      index: row.order_index,
      player: row.players ?? { name: '?', role: 'D', club: '' },
      callerTeam: row.teams?.name ?? '?',
      participants,
    };

    if (kind === 'results' && row.status === 'assigned') {
      const winner = participants.find((p) =>
        parts.find((x) => x.team_id === row.winner_team_id)?.teams?.name === p.teamName);
      const { data: bids } = await db.from('bids')
        .select('amount, team_id').eq('lot_id', row.id).order('amount', { ascending: false }).limit(2);
      const { data: team } = await db.from('teams').select('name').eq('id', row.winner_team_id!).single();
      const { data: movs } = await db.from('credit_movements')
        .select('amount').eq('lot_id', row.id).eq('team_id', row.winner_team_id!);

      const refunded = (movs ?? []).find((m) => m.amount > 0)?.amount ?? 0;
      const { data: credits } = await db.from('v_team_credits')
        .select('credits').eq('team_id', row.winner_team_id!).single();
      const after = credits?.credits ?? 0;

      lot.winnerTeam = team?.name;
      lot.finalPrice = row.final_price ?? 0;
      lot.uncontested = (bids ?? []).length === 0;
      lot.runnerUpPrice = (bids ?? []).length > 1 ? bids![1].amount : undefined;
      lot.releasedName = winner?.releaseName ?? parts.find((x) => x.team_id === row.winner_team_id)?.players?.name;
      lot.refund = refunded;
      lot.creditsAfter = after;
      lot.creditsBefore = after - refunded + (row.final_price ?? 0);
    }

    lots.push(lot);
  }

  if (kind === 'calls_closed') return msgCallsClosed(session, lots);
  if (kind === 'joins_closed') return msgJoinsClosed(session, lots);
  if (kind === 'room_open') {
    const url = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/asta/sala` : undefined;
    return msgRoomOpen(session, lots.filter((l) => l.participants.length > 1), url);
  }
  if (kind === 'results') {
    const { data: next } = await db.from('auction_sessions')
      .select('auction_at').eq('league_id', sessionRow.league_id).gt('number', s.number)
      .order('number').limit(1).maybeSingle();
    return msgResults(session, lots.filter((l) => l.winnerTeam), next?.auction_at);
  }
  return '';
}

/** Genera e salva un messaggio come bozza, se non c'è già. */
export async function queueSessionMessage(sessionId: string, kind: MessageKind): Promise<void> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('messages')
    .select('id').eq('session_id', sessionId).eq('kind', kind).maybeSingle();
  if (existing) return;

  const { data: session } = await db.from('auction_sessions')
    .select('league_id, number').eq('id', sessionId).single();
  const body = await buildMessage(sessionId, kind);
  if (!body) return;
  await db.from('messages').insert({ league_id: session!.league_id, session_id: sessionId, kind, body });

  // copia su Telegram: il centro messaggi diventa anche l'archivio
  await archiveMessage(kind, session!.number, body);
}
