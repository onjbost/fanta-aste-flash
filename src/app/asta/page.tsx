import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import { requireTeamContext } from '@/lib/queries';
import {
  callsCloseAt, joinsCloseAt, expectedStatus, refundValue, salaApribile,
  type Role, type SessionInfo,
} from '@/lib/rules';
import { TopBar } from '../TopBar';
import { CallForm } from './CallForm';
import { JoinForm } from './JoinForm';
import { Countdown } from './Countdown';
import { MyParticipation, AdminCancel } from './MyParticipation';
import { chiamateDaiLotti } from '@/lib/chiamate';
import { lineaDelleFasi, scadenzaDellaFase } from '@/lib/asta';

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
  const ctx = await requireTeamContext();
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

  // Cinque letture indipendenti: partono insieme. In fila erano cinque attese
  // sommate, e su questa pagina si vedeva.
  const [
    { data: lotRows },
    { data: myParts },
    { data: counts },
    { data: allTeams },
    { data: freeAgents, error: freeAgentsError },
  ] = await Promise.all([
    db.from('lots')
      .select('id, order_index, status, player_id, caller_team_id, players(name, role, club), teams:caller_team_id(name)')
      .eq('session_id', s.id).neq('status', 'cancelled').order('order_index'),
    // le mie partecipazioni le vedo sempre; quelle altrui solo da 'live' in poi
    db.from('lot_participants')
      .select('lot_id, is_caller, release_player_id, status, budget, cancelled_reason')
      .eq('team_id', ctx.team.id).eq('session_id', s.id),
    db.from('v_lot_participants')
      .select('id, lot_id, team_id, is_caller, status').eq('session_id', s.id)
      .neq('status', 'cancelled'),
    db.from('teams').select('id, name').eq('league_id', ctx.team.leagueId),
    // fuori lista = la societa' non l'ha iscritto: non prende voto, e
    // chiamarlo all'asta sarebbe buttare via un cambio di ruolo
    db.from('v_free_agents')
      .select('id, name, role, club, quotation, signing_window, locked_until_number')
      .eq('out_of_list', false)
      .order('quotation', { ascending: false }).limit(600),
  ]);

  type LotRow = {
    id: string; order_index: number; status: string; player_id: string; caller_team_id: string;
    players: { name: string; role: Role; club: string } | null;
    teams: { name: string } | null;
  };
  const lots = (lotRows ?? []) as unknown as LotRow[];

  const mine = new Map(
    (myParts ?? []).filter((p) => p.status !== 'cancelled').map((p) => [p.lot_id, p]),
  );
  const annullate = (myParts ?? []).filter((p) => p.status === 'cancelled');

  const teamName = new Map((allTeams ?? []).map((t) => [t.id, t.name]));

  const byLot = new Map<string, { id: string; teamId: string; name: string; isCaller: boolean }[]>();
  (counts ?? []).forEach((c) => {
    const list = byLot.get(c.lot_id) ?? [];
    list.push({
      id: c.id, teamId: c.team_id,
      name: teamName.get(c.team_id) ?? '?', isCaller: c.is_caller,
    });
    byLot.set(c.lot_id, list);
  });

  const callable = (freeAgents ?? []).filter((p) =>
    (p.locked_until_number == null || p.locked_until_number <= s.number)
    && !(s.excludesNewSignings && p.signing_window === 'winter'));

  // i lotti già aperti, visti dalla mia squadra: servono al form di chiamata
  // per avvisare che quel giocatore l'ha già chiamato un altro
  const chiamate = chiamateDaiLotti(lots, [...mine.keys()]);

  const rosterOptions = ctx.roster.map((p) => ({
    id: p.playerId, name: p.name, role: p.role, price: p.price,
    refund: refundValue(p, ctx.cfg).value,
    free: refundValue(p, ctx.cfg).free,
    committed: mine.has(''), // sostituito sotto
  }));
  // solo le partecipazioni vive impegnano un giocatore: una annullata lo
  // rimette a disposizione, così la stessa chiamata si può rifare
  const committedIds = new Set(
    (myParts ?? []).filter((p) => p.status !== 'cancelled').map((p) => p.release_player_id),
  );
  rosterOptions.forEach((r) => { r.committed = committedIds.has(r.id); });

  /*
   * Il budget vivo su una mia partecipazione: crediti di adesso più il
   * rimborso dello svincolando che ho dichiarato.
   *
   * La colonna `budget` di `lot_participants` è lo snapshot del momento in
   * cui ho aderito e non si muove più: dopo un'aggiudicazione mostrava una
   * cifra che non esisteva. Lo svincolando di un lotto già vinto non è più
   * in rosa, e lì il rimborso è zero — giusto, perché quel rimborso è già
   * dentro i crediti.
   */
  const budgetVivo = (releaseId: string) =>
    ctx.credits + (rosterOptions.find((r) => r.id === releaseId)?.refund ?? 0);

  const linea = lineaDelleFasi(effective);
  const scadenza = scadenzaDellaFase(effective, {
    chiamate: callsCloseAt(s, ctx.cfg), adesioni: joinsCloseAt(s, ctx.cfg), asta: new Date(s.auctionAt),
  });

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="asta" />

      <p className="eyebrow">Asta flash #{s.number}</p>
      <h1>{PHASE_LABEL[effective]}</h1>
      <p className="sub">
        {new Date(s.auctionAt).toLocaleString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          timeZone: 'Europe/Rome',
        })}
        {s.excludesNewSignings && ' · finestra di gennaio: nuovi acquisti esclusi'}
      </p>

      <ol className="fasi" aria-label="Fasi dell'asta">
        {linea.map((f) => (
          <li key={f.chiave} className={f.stato} aria-current={f.stato === 'adesso' ? 'step' : undefined}>
            <span className="fasi-punto" aria-hidden="true" />
            {f.etichetta}
          </li>
        ))}
      </ol>

      <section className="conto-grande">
        {scadenza ? (
          <>
            <div className="k">{scadenza.etichetta}</div>
            <div className="v"><Countdown to={scadenza.quando.toISOString()} /></div>
          </>
        ) : (
          <>
            <div className="k">{s.status === 'live' ? 'La sala è aperta' : 'Oggi si fa l\'asta'}</div>
            <div className="v">{s.status === 'live' ? 'Live' : 'Oggi'}</div>
          </>
        )}
        <div className="conto-dati">
          <span><b className="num">{ctx.credits}</b> crediti</span>
          <span><b className="num">{mine.size}</b> {mine.size === 1 ? 'lotto' : 'lotti'} tuoi</span>
          <span>cambi {ctx.changes.map((c) => `${c.role} ${c.left}`).join(' · ')}</span>
        </div>
        {salaApribile(s, new Date(), ctx.cfg) && (
          <Link href="/asta/sala" className="btn primary largo">Entra in sala</Link>
        )}
      </section>

      {annullate.length > 0 && (
        <div className="callout crit">
          <b>Annullate:</b>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {annullate.map((a) => (
              <li key={a.lot_id}>
                La tua {a.is_caller ? 'chiamata' : 'adesione'} è stata annullata
                {a.cancelled_reason ? ` — ${a.cancelled_reason}` : ''}.
                {effective === 'calls_open' && ' Puoi rifarla con un altro giocatore.'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {effective === 'calls_open' && (
        <div style={{ margin: '16px 0 0' }}>
          <CallForm
            sessionId={s.id}
            freeAgents={callable.map((p) => ({
              id: p.id, name: p.name, role: p.role as Role, club: p.club, quotation: p.quotation,
            }))}
            roster={rosterOptions}
            credits={ctx.credits}
            changes={ctx.changes}
            chiamate={chiamate}
          />
        </div>
      )}

      <h2>Lotti chiamati <span className="h2-conta">{lots.length}</span></h2>
      {lots.length === 0 ? (
        <div className="panel"><div className="empty">Nessuno ha ancora chiamato. Puoi essere il primo.</div></div>
      ) : (
        <ul className="lotti">
          {lots.map((l) => {
            const my = mine.get(l.id);
            const partecipanti = byLot.get(l.id) ?? [];
            const altri = partecipanti.filter((p) => p.teamId !== ctx.team.id);
            const scadenzaMia = my?.is_caller ? callsCloseAt(s, ctx.cfg) : joinsCloseAt(s, ctx.cfg);
            const modificabile = new Date() < scadenzaMia;
            const puoAderire = !my && ['calls_open', 'calls_closed'].includes(effective);

            return (
              <li key={l.id} className={`lotto${my ? ' mio' : ''}`}>
                <div className="lotto-riga">
                  <span className="role-badge">{l.players?.role}</span>
                  <div className="lotto-chi">
                    <b>{l.players?.name}</b>
                    <small>
                      {l.players?.club} · da {l.teams?.name}
                      {altri.length > 0 && ` · con ${altri.map((p) => p.name).join(', ')}`}
                    </small>
                  </div>
                  <span className="lotto-n num" title="partecipanti">
                    {partecipanti.length}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.6" /><path d="M18 14.5a5.5 5.5 0 0 1 3 4.5" /></svg>
                    <span className="sr-only">{partecipanti.length === 1 ? 'partecipante' : 'partecipanti'}</span>
                  </span>
                  {puoAderire && (
                    <JoinForm
                      lotId={l.id}
                      role={l.players?.role ?? 'D'}
                      giocatore={l.players?.name ?? ''}
                      roster={rosterOptions.filter((r) => r.role === l.players?.role && !r.committed)}
                      credits={ctx.credits}
                    />
                  )}
                </div>

                {my && (
                  <MyParticipation
                    lotId={l.id}
                    isCaller={my.is_caller}
                    status={my.status}
                    budget={budgetVivo(my.release_player_id)}
                    credits={ctx.credits}
                    currentReleaseId={my.release_player_id}
                    roster={rosterOptions.filter((r) =>
                      r.role === l.players?.role && (!r.committed || r.id === my.release_player_id))}
                    editable={modificabile && my.status !== 'pending_approval'}
                    deadlineLabel={my.status === 'pending_approval'
                      ? 'in attesa dell\'admin'
                      : my.is_caller ? 'chiamate chiuse' : 'adesioni chiuse'}
                  />
                )}

                {ctx.team.isAdmin && (
                  <div className="lotto-admin">
                    <span className="tag muted">admin</span>
                    {partecipanti.map((p) => (
                      <AdminCancel key={p.id} participantId={p.id} teamName={p.name} isCaller={p.isCaller} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {effective !== 'calls_open' && effective !== 'live' && (
        <p className="nota-piede">
          Le chiamate per questa asta sono chiuse.
          {effective === 'calls_closed' && ' Puoi ancora aderire ai lotti qui sopra.'}
        </p>
      )}

      <p className="nota-piede">
        Chi entra e chi esce devono essere dello stesso ruolo, ogni chiamata vuole uno svincolando
        diverso, e non puoi partecipare a più lotti di quanti cambi ti restano in quel ruolo.
      </p>
    </div>
  );
}
