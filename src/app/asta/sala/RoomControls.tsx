'use client';

import { useActionState, useState } from 'react';
import {
  adminOpenRoom, adminOpenLot, adminCloseLot, adminCloseSession, adminAssignLot,
  type ActionState,
} from '../actions';
import type { LotView } from './AuctionRoom';

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
          type="number" name="prezzo" min={1} step={1} placeholder="crediti"
          className="assegna-prezzo" aria-label="Prezzo"
        />
        <button disabled={inCorso || !teamId}>{inCorso ? 'Assegno…' : 'Assegna'}</button>
      </div>
      {scelta && (
        <p className="assegna-nota">
          {scelta.teamName} metteva sul piatto {scelta.releaseName} e dichiarava {scelta.budget} crediti
          su questo lotto.
        </p>
      )}
      {stato && (
        <p className={stato.ok ? 'assegna-esito' : 'assegna-esito ko'}>{stato.message}</p>
      )}
    </form>
  );
}

export function RoomControls({ sessionId, isLive, lots }: {
  sessionId: string; isLive: boolean; lots: LotView[];
}) {
  const [openState, doOpenRoom, openingRoom] = useActionState<ActionState, FormData>(adminOpenRoom, null);
  const [lotState, doOpenLot, openingLot] = useActionState<ActionState, FormData>(adminOpenLot, null);
  const [closeState, doCloseLot, closingLot] = useActionState<ActionState, FormData>(adminCloseLot, null);
  const [endState, doCloseSession, ending] = useActionState<ActionState, FormData>(adminCloseSession, null);

  const next = lots.find((l) => l.status === 'called');
  const live = lots.find((l) => l.status === 'live');
  // quelli ancora da decidere, compreso quello col timer acceso: assegnarlo
  // a mano è anche il modo di sbrogliare un lotto rimasto aperto per sbaglio
  const daAssegnare = lots.filter(
    (l) => (l.status === 'called' || l.status === 'live') && l.participants.length > 1,
  );
  const state = openState ?? lotState ?? closeState ?? endState;

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

        {isLive && live && (
          <form action={doCloseLot}>
            <input type="hidden" name="lotId" value={live.id} />
            <button disabled={closingLot} style={{ color: 'var(--crit)', borderColor: 'var(--crit)' }}>
              {closingLot ? 'Chiudo…' : 'Chiudi subito il lotto'}
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
    </div>
  );
}
