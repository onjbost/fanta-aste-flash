import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import { loadTeamContext } from '@/lib/queries';
import {
  callsCloseAt, joinsCloseAt, expectedStatus, refundValue,
  type Role, type SessionInfo,
} from '@/lib/rules';
import { TopBar } from '../TopBar';
import { CallForm } from './CallForm';
import { JoinForm } from './JoinForm';
import { Countdown } from './Countdown';

export const dynamic = 'force-dynamic';

const PHASE_LABEL: Record<string, string> = {
  scheduled: 'In programma',
  calls_open: 'Chiamate aperte',
  calls_closed: 'Adesioni aperte',
  joins_closed: 'Tutto chiuso, si aspetta l\'asta',
  live: 'Asta in corso',
  closed: 'Chiusa',
};

export default async function AstaPage() {
  const ctx = await loadTeamContext();
  if (!ctx) redirect('/login');
  if (!ctx.nextSession) {
    return (
      <div className="shell">
        <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="asta" />
        <h1>Aste flash</h1>
        <p className="sub">Nessuna asta in calendario. La stagione è finita.</p>
      </div>
    );
  }

  const s: SessionInfo = ctx.nextSession;
  const phase = s.status === 'live' || s.status === 'closed'
    ? s.status
    : expectedStatus(s, new Date(), ctx.cfg);
  const effective = phase === 'live' && s.status !== 'live' ? 'joins_closed' : phase;

  const db = await supabaseServer();
  const { data: lotRows } = await db.from('lots')
    .select('id, order_index, status, player_id, caller_team_id, players(name, role, club), teams:caller_team_id(name)')
    .eq('session_id', s.id).neq('status', 'cancelled').order('order_index');

  type LotRow = {
    id: string; order_index: number; status: string; player_id: string; caller_team_id: string;
    players: { name: string; role: Role; club: string } | null;
    teams: { name: string } | null;
  };
  const lots = (lotRows ?? []) as unknown as LotRow[];

  // le mie partecipazioni le vedo sempre; quelle altrui solo da 'live' in poi
  const { data: myParts } = await db.from('lot_participants')
    .select('lot_id, is_caller, release_player_id, status, budget')
    .eq('team_id', ctx.team.id).eq('session_id', s.id).neq('status', 'cancelled');
  const mine = new Map((myParts ?? []).map((p) => [p.lot_id, p]));

  const { data: counts } = await db.from('lot_participants')
    .select('lot_id, team_id, teams(name)').eq('session_id', s.id).eq('status', 'confirmed');
  const byLot = new Map<string, string[]>();
  ((counts ?? []) as unknown as { lot_id: string; teams: { name: string } | null }[])
    .forEach((c) => {
      const list = byLot.get(c.lot_id) ?? [];
      list.push(c.teams?.name ?? '?');
      byLot.set(c.lot_id, list);
    });

  const { data: freeAgents } = await db.from('v_free_agents')
    .select('id, name, role, club, quotation, signing_window, locked_until_number')
    .order('quotation', { ascending: false }).limit(600);

  const callable = (freeAgents ?? []).filter((p) =>
    (p.locked_until_number == null || p.locked_until_number <= s.number)
    && !(s.excludesNewSignings && p.signing_window === 'winter'));

  const rosterOptions = ctx.roster.map((p) => ({
    id: p.playerId, name: p.name, role: p.role, price: p.price,
    refund: refundValue(p, ctx.cfg).value,
    free: refundValue(p, ctx.cfg).free,
    committed: mine.has(''), // sostituito sotto
  }));
  const committedIds = new Set((myParts ?? []).map((p) => p.release_player_id));
  rosterOptions.forEach((r) => { r.committed = committedIds.has(r.id); });

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="asta" />

      <p className="eyebrow">Asta flash #{s.number}</p>
      <h1>{PHASE_LABEL[effective]}</h1>
      <p className="sub">
        {new Date(s.auctionAt).toLocaleString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        })}
        {s.excludesNewSignings && ' · finestra di gennaio: nuovi acquisti esclusi'}
      </p>

      <div className="stats">
        <div className="stat">
          <div className="k">Chiamate chiuse tra</div>
          <div className="v"><Countdown to={callsCloseAt(s, ctx.cfg).toISOString()} /></div>
          <div className="note">5 giorni prima dell'asta</div>
        </div>
        <div className="stat">
          <div className="k">Adesioni chiuse tra</div>
          <div className="v"><Countdown to={joinsCloseAt(s, ctx.cfg).toISOString()} /></div>
          <div className="note">1 giorno prima dell'asta</div>
        </div>
        <div className="stat">
          <div className="k">Crediti · lotti</div>
          <div className="v">{ctx.credits}<small> / {mine.size}</small></div>
          <div className="note">tuoi crediti e tue partecipazioni</div>
        </div>
      </div>

      {s.status === 'live' && (
        <div className="callout">
          L'asta è in corso. <Link href="/asta/sala"><b>Entra in sala →</b></Link>
        </div>
      )}

      <h2>Lotti chiamati</h2>
      {lots.length === 0 && (
        <div className="panel"><div className="empty">Nessuno ha ancora chiamato. Puoi essere il primo.</div></div>
      )}

      {lots.map((l) => {
        const my = mine.get(l.id);
        const others = byLot.get(l.id) ?? [];
        return (
          <div className="panel" key={l.id} style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span className="role-badge">{l.players?.role}</span>{' '}
                <b style={{ fontSize: '1.05rem' }}>{l.players?.name}</b>{' '}
                <span style={{ color: 'var(--muted)' }}>{l.players?.club}</span>
                <div style={{ color: 'var(--muted)', fontSize: '.88rem', marginTop: 2 }}>
                  Chiamato da {l.teams?.name} · {others.length} {others.length === 1 ? 'partecipante' : 'partecipanti'}
                  {effective !== 'calls_open' && others.length > 0 && `: ${others.join(', ')}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {my ? (
                  <>
                    <span className={`tag ${my.status === 'pending_approval' ? 'warn' : 'ok'}`}>
                      {my.status === 'pending_approval' ? 'Congelata' : my.is_caller ? 'Tua chiamata' : 'Aderito'}
                    </span>
                    <div className="mono" style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 4 }}>
                      budget {my.budget} cr
                    </div>
                  </>
                ) : (
                  ['calls_open', 'calls_closed'].includes(effective) && (
                    <JoinForm
                      lotId={l.id}
                      role={l.players?.role ?? 'D'}
                      roster={rosterOptions.filter((r) => r.role === l.players?.role && !r.committed)}
                      credits={ctx.credits}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}

      {effective === 'calls_open' ? (
        <>
          <h2>Chiama uno svincolato</h2>
          <CallForm
            sessionId={s.id}
            freeAgents={callable.map((p) => ({
              id: p.id, name: p.name, role: p.role as Role, club: p.club, quotation: p.quotation,
            }))}
            roster={rosterOptions}
            credits={ctx.credits}
            changes={ctx.changes}
          />
        </>
      ) : (
        <div className="callout">
          Le chiamate per questa asta sono chiuse.
          {effective === 'calls_closed' && ' Puoi ancora aderire ai lotti qui sopra.'}
        </div>
      )}

      <div className="callout" style={{ marginTop: 24 }}>
        Ricorda: chi entra e chi esce devono essere dello stesso ruolo, ogni chiamata vuole uno
        svincolando diverso, e non puoi partecipare a più lotti di quanti cambi ti restano in quel
        ruolo ({ctx.changes.map((c) => `${c.role} ${c.left}`).join(' · ')}).
      </div>
    </div>
  );
}
