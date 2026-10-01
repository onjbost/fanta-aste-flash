'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  adminOpenRoom, adminOpenLot, adminCloseLot, adminCloseSession, adminAssignLot,
  adminStartTimer, adminReopenTimer, adminUnopenLot, adminCancelAssignment, adminSettleLot,
  type ActionState,
} from '../actions';
import { faseDelLotto, presenzeMancanti, type FaseLotto } from '@/lib/rules';
import type { LotView } from './AuctionRoom';
import type { TempiSala } from './PezziSala';

/**
 * Assegnare un lotto a mano, senza battere l'asta in sala.
 *
 * Non tutte le aste si fanno davanti all'app: a volte il gruppo si accorda
 * a voce o si chiude in tre minuti su WhatsApp, e ribattere il risultato
 * col timer è tempo perso. Qui si sceglie fra le squadre in corsa e si
 * scrive a quanto è andato; il resto — svincolo, rimborso, acquisto, riga
 * da riportare su Leghe Fantacalcio — succede come se l'asta ci fosse
 * stata.
 *
 * La squadra si sceglie da un elenco e non si scrive: assegnare a chi non
 * era in corsa vorrebbe dire regalare un giocatore a chi non ha messo
 * niente sul piatto, e il suo svincolando non esiste.
 */
function AssegnaAMano({ lot }: { lot: LotView }) {
  const [stato, assegna, inCorso] = useActionState<ActionState, FormData>(adminAssignLot, null);
  const [teamId, setTeamId] = useState(lot.participants[0]?.teamId ?? '');
  const scelta = lot.participants.find((p) => p.teamId === teamId);

  return (
    <form action={assegna} className="assegna">
      <div className="assegna-riga">
        <span className="assegna-nome">
          <b>{lot.player.name}</b> <small>{lot.player.club}</small>
        </span>
        <input type="hidden" name="lotId" value={lot.id} />
        <select name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {lot.participants.map((p) => (
            <option key={p.teamId} value={p.teamId}>
              {p.teamName}{p.isCaller ? ' (ha chiamato)' : ''}
            </option>
          ))}
        </select>
        <input
          type="number" name="prezzo" min={1} step={1} max={scelta?.budget}
          placeholder="crediti" className="assegna-prezzo" aria-label="Prezzo"
        />
        <button disabled={inCorso || !teamId}>{inCorso ? 'Assegno…' : 'Assegna'}</button>
      </div>
      {scelta && (
        <p className="assegna-nota">
          {scelta.teamName} mette sul piatto {scelta.releaseName} e su questo lotto arriva a{' '}
          {scelta.budget} crediti — rimborso compreso, aggiudicazioni di stasera già contate.
        </p>
      )}
      {stato && (
        <p className={stato.ok ? 'assegna-esito' : 'assegna-esito ko'}>{stato.message}</p>
      )}
    </form>
  );
}

/**
 * Il lotto aperto, dal punto di vista della regia.
 *
 * Tre momenti, tre pannelli diversi: l'attesa delle presenze, l'asta che
 * corre, il lotto congelato che aspetta il martello. La fase si ricalcola
 * dall'orologio quattro volte al secondo — nessuno scrive «congelato» da
 * nessuna parte, e se lo scrivesse sarebbe un attore che non esiste.
 */
function Regia({ lot, tempi, scarto }: { lot: LotView; tempi: TempiSala; scarto: number }) {
  // l'orologio del server, non quello di questo computer: la fase si decide
  // su `timer_ends_at`, che lo scrive Postgres
  const [ora, setOra] = useState(() => Date.now() + scarto);
  useEffect(() => {
    const id = setInterval(() => setOra(Date.now() + scarto), 250);
    return () => clearInterval(id);
  }, [scarto]);

  const [startState, doStart, starting] = useActionState<ActionState, FormData>(adminStartTimer, null);
  const [reopenState, doReopen, reopening] = useActionState<ActionState, FormData>(adminReopenTimer, null);
  const [unopenState, doUnopen, unopening] = useActionState<ActionState, FormData>(adminUnopenLot, null);
  const [closeState, doClose, closing] = useActionState<ActionState, FormData>(adminCloseLot, null);
  // il martello non forza: se un rilancio è arrivato all'ultimo istante, il
  // server rifiuta invece di aggiudicare al prezzo che si legge qui
  const [settleState, doSettle, settling] = useActionState<ActionState, FormData>(adminSettleLot, null);

  const fase: FaseLotto = faseDelLotto(
    { status: lot.status, timerEndsAt: lot.timerEndsAt }, new Date(ora), tempi,
  );
  const mancano = presenzeMancanti(
    lot.participants.map((p) => ({ teamId: p.teamId, squadra: p.teamName })),
    lot.presenze,
  );
  const state = startState ?? reopenState ?? unopenState ?? closeState ?? settleState;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      {fase === 'attesa_presenze' && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: '.9rem' }}>
            <b>{lot.player.name}</b> è aperto. Il countdown parte quando hanno confermato tutti.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {lot.participants.map((p) => {
              const dentro = lot.presenze.find((x) => x.teamId === p.teamId);
              return (
                <span key={p.teamId} className={dentro ? 'tag' : 'tag muted'}>
                  {dentro ? '✓ ' : '· '}{p.teamName}
                  {dentro && (
                    <small style={{ marginLeft: 4, opacity: .75 }}>
                      {new Date(dentro.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  )}
                </span>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <form action={doStart}>
              <input type="hidden" name="lotId" value={lot.id} />
              <button disabled={starting}>
                {starting ? 'Parto…' : mancano.length
                  ? `Parti comunque, senza ${mancano.join(' e ')}`
                  : 'Parti comunque'}
              </button>
            </form>
            <form action={doUnopen}>
              <input type="hidden" name="lotId" value={lot.id} />
              <button disabled={unopening}>
                {unopening ? 'Rimetto…' : 'Rimetti in programma'}
              </button>
            </form>
          </div>
        </>
      )}

      {(fase === 'rilanci' || fase === 'grazia') && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '.9rem' }}>
            {lot.currentLeader
              ? <>Al momento <b>{lot.currentLeader}</b> a {lot.currentPrice} cr.</>
              : <>Nessuna offerta su <b>{lot.player.name}</b>.</>}
          </span>
          <form action={doClose} style={{ marginLeft: 'auto' }}>
            <input type="hidden" name="lotId" value={lot.id} />
            <button disabled={closing} style={{ color: 'var(--crit)', borderColor: 'var(--crit)' }}>
              {closing ? 'Chiudo…' : 'Chiudi subito'}
            </button>
          </form>
        </div>
      )}

      {fase === 'congelato' && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: '.9rem' }}>
            Tempo finito. {lot.currentLeader
              ? 'Batti il martello quando siete d\'accordo.'
              : 'Nessuno ha rilanciato: chiudendo, il lotto va al chiamante al 75% del suo svincolando.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/*
              * Il bottone dice nome e cifra, non «chiudi»: è l'atto che muove
              * contratti e crediti, e un bottone generico si preme per sbaglio.
              */}
            <form action={doSettle}>
              <input type="hidden" name="lotId" value={lot.id} />
              <button className="primary" disabled={settling}>
                {settling ? 'Aggiudico…' : lot.currentLeader
                  ? `Aggiudica ${lot.player.name} a ${lot.currentLeader} per ${lot.currentPrice}`
                  : `Aggiudica ${lot.player.name} al chiamante`}
              </button>
            </form>
            <form action={doReopen}>
              <input type="hidden" name="lotId" value={lot.id} />
              <button disabled={reopening}>
                {reopening ? 'Riapro…' : `Riapri i ${tempi.timerSeconds} secondi`}
              </button>
            </form>
          </div>
        </>
      )}

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>
      )}
    </div>
  );
}

/**
 * Annulla un'aggiudicazione. Chiede di scrivere ANNULLA a mano: è l'unico
 * comando della sala che disfa contratti e crediti, e un click solo non
 * basta a distinguerlo da un click per sbaglio.
 */
function AnnullaAggiudicazione({ lot }: { lot: LotView }) {
  const [stato, annulla, inCorso] = useActionState<ActionState, FormData>(adminCancelAssignment, null);
  const [conferma, setConferma] = useState('');
  const pronto = conferma.trim().toUpperCase() === 'ANNULLA';

  return (
    <form action={annulla} className="assegna">
      <div className="assegna-riga">
        <span className="assegna-nome">
          <b>{lot.player.name}</b> <small>a {lot.winnerTeam} per {lot.finalPrice} cr</small>
        </span>
        <input type="hidden" name="lotId" value={lot.id} />
        <input
          value={conferma} onChange={(e) => setConferma(e.target.value)}
          placeholder="scrivi ANNULLA" className="assegna-prezzo" aria-label="Conferma"
          style={{ width: 140 }}
        />
        <button disabled={inCorso || !pronto} style={{ color: 'var(--crit)', borderColor: 'var(--crit)' }}>
          {inCorso ? 'Annullo…' : 'Annulla'}
        </button>
      </div>
      <p className="assegna-nota">
        Torna indietro tutto: {lot.winnerTeam} riprende in rosa chi aveva svincolato,
        perde {lot.player.name}, i crediti tornano come prima e il cambio di ruolo si
        libera. Il lotto torna in programma e lo puoi ribattere.
      </p>
      {stato && (
        <p className={stato.ok ? 'assegna-esito' : 'assegna-esito ko'}>{stato.message}</p>
      )}
    </form>
  );
}

export function RoomControls({ sessionId, isLive, lots, tempi, scarto }: {
  sessionId: string; isLive: boolean; lots: LotView[]; tempi: TempiSala; scarto: number;
}) {
  const [openState, doOpenRoom, openingRoom] = useActionState<ActionState, FormData>(adminOpenRoom, null);
  const [lotState, doOpenLot, openingLot] = useActionState<ActionState, FormData>(adminOpenLot, null);
  const [endState, doCloseSession, ending] = useActionState<ActionState, FormData>(adminCloseSession, null);

  const next = lots.find((l) => l.status === 'called');
  const live = lots.find((l) => l.status === 'live');
  // quelli ancora da decidere, compreso quello col timer acceso: assegnarlo
  // a mano è anche il modo di sbrogliare un lotto rimasto aperto per sbaglio
  const daAssegnare = lots.filter(
    (l) => (l.status === 'called' || l.status === 'live') && l.participants.length > 1,
  );
  const assegnati = lots.filter((l) => l.status === 'assigned');
  const state = openState ?? lotState ?? endState;

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 20, background: 'var(--surface-2)' }}>
      <p className="eyebrow" style={{ margin: '0 0 10px' }}>Regia · solo admin</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLive && (
          <form action={doOpenRoom}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button className="primary" disabled={openingRoom}>
              {openingRoom ? 'Apro…' : 'Apri la sala'}
            </button>
          </form>
        )}

        {isLive && next && !live && (
          <form action={doOpenLot}>
            <input type="hidden" name="lotId" value={next.id} />
            <button className="primary" disabled={openingLot}>
              {openingLot ? 'Apro…' : `Apri lotto ${next.index} · ${next.player.name}`}
            </button>
          </form>
        )}

        {isLive && !next && !live && (
          <form action={doCloseSession}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button className="primary" disabled={ending}>
              {ending ? 'Chiudo…' : 'Chiudi la serata'}
            </button>
          </form>
        )}
      </div>

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">
          {state.message}
        </div>
      )}

      {isLive && live && <Regia lot={live} tempi={tempi} scarto={scarto} />}

      {/*
        * L'assegnazione a mano sta sotto i comandi della serata e non in
        * mezzo: è la strada alternativa, non quella normale. Compare solo a
        * sala aperta, perché prima i budget non sono ancora pubblici e i
        * lotti senza contendenti non si sono ancora sistemati da soli.
        */}
      {isLive && daAssegnare.length > 0 && (
        <details className="assegna-blocco">
          <summary>
            Assegna a mano, senza fare l&apos;asta
            <small> · {daAssegnare.length} {daAssegnare.length === 1 ? 'lotto' : 'lotti'}</small>
          </summary>
          <p className="sub" style={{ margin: '8px 0 10px' }}>
            Per i lotti decisi fuori dall&apos;app. Scegli chi se l&apos;è preso fra le squadre in
            corsa e a quanto: svincolo, rimborso e acquisto vengono registrati come dopo un&apos;asta.
          </p>
          {daAssegnare.map((l) => <AssegnaAMano key={l.id} lot={l} />)}
        </details>
      )}

      {/*
        * L'annullo sta più in basso di tutto il resto, chiuso: è l'unica cosa
        * qui che disfa quello che è già successo, e non deve stare a portata
        * di click distratto.
        */}
      {assegnati.length > 0 && (
        <details className="assegna-blocco">
          <summary>
            Annulla un&apos;aggiudicazione
            <small> · {assegnati.length} {assegnati.length === 1 ? 'lotto chiuso' : 'lotti chiusi'}</small>
          </summary>
          <p className="sub" style={{ margin: '8px 0 10px' }}>
            Per quando il lotto è andato a chi non doveva, o non doveva andare a nessuno.
            Si ferma da sé se nel frattempo il giocatore è stato svincolato o scambiato:
            in quel caso l&apos;annullo lascerebbe le rose a metà strada, e non si fa.
          </p>
          {assegnati.map((l) => <AnnullaAggiudicazione key={l.id} lot={l} />)}
        </details>
      )}
    </div>
  );
}
