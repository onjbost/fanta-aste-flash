import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { loadTeamContext } from '@/lib/queries';
import { refundValue, type Role, type PlayerStatus } from '@/lib/rules';
import { TopBar } from '../../TopBar';
import { AuctionRoom } from './AuctionRoom';
import { RoomControls } from './RoomControls';

export const dynamic = 'force-dynamic';

export default async function SalaPage() {
  const ctx = await loadTeamContext();
  if (!ctx) redirect('/login');

  const db = await supabaseServer();
  const { data: sessionRow } = await db.from('auction_sessions')
    .select('*').eq('league_id', ctx.team.leagueId)
    .in('status', ['live', 'joins_closed']).order('number').limit(1).maybeSingle();

  if (!sessionRow) {
    return (
      <div className="shell">
        <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="asta" />
        <h1>Sala d'asta</h1>
        <p className="sub">Nessuna asta pronta. La sala apre il giorno dell'asta flash.</p>
      </div>
    );
  }

  const isLive = sessionRow.status === 'live';

  const { data: lotRows } = await db.from('lots')
    .select(`id, order_index, status, current_price, current_leader, timer_ends_at,
             winner_team_id, final_price, player_id,
             players(name, role, club), teams:caller_team_id(name)`)
    .eq('session_id', sessionRow.id).neq('status', 'cancelled').order('order_index');

  type LotRow = {
    id: string; order_index: number; status: string;
    current_price: number | null; current_leader: string | null; timer_ends_at: string | null;
    winner_team_id: string | null; final_price: number | null;
    players: { name: string; role: Role; club: string } | null;
    teams: { name: string } | null;
  };
  const lots = (lotRows ?? []) as unknown as LotRow[];

  // le partecipazioni diventano leggibili solo da 'live': è la RLS a deciderlo
  const { data: partRows } = await db.from('lot_participants')
    .select('lot_id, team_id, is_caller, release_player_id, budget, status, teams(name), players(name, role, status)')
    .eq('session_id', sessionRow.id).eq('status', 'confirmed');

  type PartRow = {
    lot_id: string; team_id: string; is_caller: boolean; release_player_id: string; budget: number;
    teams: { name: string } | null;
    players: { name: string; role: Role; status: PlayerStatus } | null;
  };
  const parts = (partRows ?? []) as unknown as PartRow[];

  const { data: teams } = await db.from('teams').select('id, name').eq('league_id', ctx.team.leagueId);
  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const { data: credits } = await db.from('v_team_credits').select('team_id, credits');
  const creditsMap = new Map((credits ?? []).map((c) => [c.team_id, c.credits]));

  const myBudgets = new Map<string, number>();
  for (const p of parts.filter((x) => x.team_id === ctx.team.id)) {
    const rel = ctx.roster.find((r) => r.playerId === p.release_player_id);
    myBudgets.set(p.lot_id, (ctx.credits) + (rel ? refundValue(rel, ctx.cfg).value : 0));
  }

  const view = lots.map((l) => ({
    id: l.id,
    index: l.order_index,
    status: l.status,
    player: l.players ?? { name: '?', role: 'D' as Role, club: '' },
    callerTeam: l.teams?.name ?? '?',
    currentPrice: l.current_price,
    currentLeader: l.current_leader ? teamNames.get(l.current_leader) ?? '?' : null,
    currentLeaderId: l.current_leader,
    timerEndsAt: l.timer_ends_at,
    winnerTeam: l.winner_team_id ? teamNames.get(l.winner_team_id) ?? '?' : null,
    finalPrice: l.final_price,
    participants: parts.filter((p) => p.lot_id === l.id).map((p) => ({
      teamId: p.team_id,
      teamName: p.teams?.name ?? '?',
      isCaller: p.is_caller,
      releaseName: p.players?.name ?? '?',
      budget: p.budget,
      liveCredits: creditsMap.get(p.team_id) ?? 0,
    })),
    myBudget: myBudgets.get(l.id) ?? null,
    iParticipate: parts.some((p) => p.lot_id === l.id && p.team_id === ctx.team.id),
  }));

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="asta" />

      <p className="eyebrow">Asta flash #{sessionRow.number}</p>
      <h1>{isLive ? 'Sala d\'asta' : 'La sala non è ancora aperta'}</h1>
      <p className="sub">
        {isLive
          ? 'I lotti vanno uno alla volta, in ordine di chiamata. Ogni rilancio riporta il timer a zero.'
          : 'Svincolandi e budget compaiono nel momento in cui l\'admin apre la sala.'}
      </p>

      {ctx.team.isAdmin && (
        <RoomControls sessionId={sessionRow.id} isLive={isLive} lots={view} />
      )}

      {isLive
        ? <AuctionRoom myTeamId={ctx.team.id} lots={view} />
        : (
          <div className="panel">
            <div className="empty">
              {view.length} lotti pronti. Si comincia quando l'admin apre la sala.
            </div>
          </div>
        )}
    </div>
  );
}
