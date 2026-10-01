import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { requireTeamContext } from '@/lib/queries';
import { refundValue, salaApribile, type Role, type PlayerStatus } from '@/lib/rules';
import { sessionInfo } from '@/lib/market';
import { codaOperativa, contendentiDellaSessione } from '@/lib/settlement';
import { leggiLaCoda, VUOTA } from '@/lib/codaLettura';
import { CodaOperativa } from './CodaOperativa';
import { Coda } from '../../admin/Coda';
import { TopBar } from '../../TopBar';
import { Sala } from './Sala';

export const dynamic = 'force-dynamic';

export default async function SalaPage() {
  const ctx = await requireTeamContext();

  const db = await supabaseServer();
  /*
   * La sessione si cerca per numero e non per stato salvato.
   *
   * Lo stato nel database lo muove il cron, una volta al giorno: cercare
   * «live o joins_closed» voleva dire che il giorno dell'asta, finché il
   * cron non era passato, la sala rispondeva «nessuna asta pronta» e non si
   * poteva aprire. La fase vera si ricalcola dall'orologio, come in tutto
   * il resto dell'app.
   */
  const { data: sessionRow } = await db.from('auction_sessions')
    .select('*').eq('league_id', ctx.team.leagueId)
    .neq('status', 'closed').order('number').limit(1).maybeSingle();

  const apribile = sessionRow
    ? salaApribile(sessionInfo(sessionRow), new Date(), ctx.cfg)
    : false;

  if (!sessionRow || !apribile) {
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

  /*
   * Le presenze dei lotti di questa sessione.
   *
   * Si leggono per id di lotto e non per sessione perché `lot_presences` non
   * ha la colonna della sessione: il legame passa dal lotto, e i lotti li
   * abbiamo già qui sopra.
   */
  const { data: presRows } = lots.length
    ? await db.from('lot_presences').select('lot_id, team_id, confirmed_at')
      .in('lot_id', lots.map((l) => l.id))
    : { data: [] };
  const presenze = (presRows ?? []) as { lot_id: string; team_id: string; confirmed_at: string }[];

  const { data: teams } = await db.from('teams').select('id, name').eq('league_id', ctx.team.leagueId);
  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const { data: credits } = await db.from('v_team_credits').select('team_id, credits');
  const creditsMap = new Map((credits ?? []).map((c) => [c.team_id, c.credits]));

  const myBudgets = new Map<string, number>();
  for (const p of parts.filter((x) => x.team_id === ctx.team.id)) {
    const rel = ctx.roster.find((r) => r.playerId === p.release_player_id);
    myBudgets.set(p.lot_id, (ctx.credits) + (rel ? refundValue(rel, ctx.cfg).value : 0));
  }

  /*
   * Il budget vero di ogni contendente, lotto per lotto.
   *
   * Nella colonna c'era `lot_participants.budget`: lo snapshot scritto al
   * momento dell'adesione, che non si muove più. Dopo la prima
   * aggiudicazione quel numero era già falso — e l'admin ci assegnava i
   * lotti sopra. Adesso la sala mostra quello che il server accetterà
   * davvero, perché lo chiede alla stessa funzione.
   */
  const contendenti = await contendentiDellaSessione(sessionRow.id);
  const budgetVivi = new Map(contendenti.map((c) => [`${c.lottoId}:${c.teamId}`, c.budget]));

  // solo all'admin, e solo quando serve davvero: sono due letture in più
  const coda = ctx.team.isAdmin ? await codaOperativa(sessionRow.id) : [];
  /*
   * La coda vera della serata, quella che sta nel database. Sta qui e non
   * solo su /admin perché è qui che si lavora: finita l'asta si riportano i
   * movimenti su Leghe Fantacalcio senza cambiare pagina.
   */
  const daRiportare = ctx.team.isAdmin
    ? await leggiLaCoda(ctx.team.leagueId, sessionRow.id)
    : VUOTA;

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
      budget: budgetVivi.get(`${l.id}:${p.team_id}`) ?? p.budget,
      liveCredits: creditsMap.get(p.team_id) ?? 0,
    })),
    myBudget: myBudgets.get(l.id) ?? null,
    iParticipate: parts.some((p) => p.lot_id === l.id && p.team_id === ctx.team.id),
    presenze: presenze.filter((p) => p.lot_id === l.id)
      // un allenatore per squadra basta, e due conferme della stessa squadra
      // non devono comparire due volte nell'attesa
      .filter((p, i, tutte) => tutte.findIndex((x) => x.team_id === p.team_id) === i)
      .map((p) => ({ teamId: p.team_id, quando: p.confirmed_at })),
  }));

  // i secondi che contano, dalla lega: il countdown e la grazia
  const tempi = { timerSeconds: ctx.cfg.timerSeconds, graceSeconds: ctx.cfg.graceSeconds };

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

      {/*
        * Regia e sala stanno dentro un componente solo perché devono vedere
        * lo stesso lotto: il canale realtime è lì, e i lotti arrivano a
        * entrambe da quello. Prima la regia leggeva una fotografia del
        * server, e l'admin non vedeva mai partire il countdown — cioè non
        * vedeva mai comparire il bottone per aggiudicare.
        */}
      <Sala
        myTeamId={ctx.team.id} isAdmin={ctx.team.isAdmin}
        sessionId={sessionRow.id} isLive={isLive}
        lots={view} tempi={tempi} adesso={new Date().toISOString()}
      >
        {/*
          * La coda operativa sta sopra la sala perché è l'unica cosa in
          * questa pagina che si fa fuori dall'app: i lotti non contesi li
          * assegna il codice, ma su Leghe Fantacalcio li deve riportare una
          * persona, e le serve sapere chi esce.
          */}
        <CodaOperativa voci={coda} aperta={isLive} />
        {ctx.team.isAdmin && (daRiportare.voci.length > 0 || daRiportare.avviso) && (
          <div className="coda-in-sala">
            <Coda voci={daRiportare.voci} avviso={daRiportare.avviso} />
          </div>
        )}
      </Sala>
    </div>
  );
}
