'use client';

import { useActionState, useState } from 'react';
import {
  updateParticipation, withdrawParticipation, adminCancelParticipation,
  type ActionState,
} from './actions';
import { ROLE_LABEL } from '@/lib/rules';
import { Foglio } from '../Foglio';
import { SceltaSvincolo, type Svincolabile } from './SceltaSvincolo';

/** Il foglio «Cambia»: si monta all'apertura, quindi parte dallo svincolando attuale. */
function ModuloCambio({ lotId, isCaller, budget, roster, credits, currentReleaseId }: {
  lotId: string; isCaller: boolean; budget: number; roster: Svincolabile[];
  credits: number; currentReleaseId: string;
}) {
  const [editState, doEdit, editing] = useActionState<ActionState, FormData>(updateParticipation, null);
  const [releaseId, setReleaseId] = useState(currentReleaseId);
  const scelto = roster.find((r) => r.id === releaseId);
  const nuovoBudget = scelto ? credits + scelto.refund : null;

  return (
    <form action={doEdit}>
      <input type="hidden" name="lotId" value={lotId} />
      <p className="foglio-nota" style={{ marginTop: 4 }}>
        La {isCaller ? 'chiamata' : 'adesione'} resta dov&apos;è: cambia solo chi
        metti sul piatto, e con lui il tuo budget.
      </p>

      <p className="foglio-k">Il tuo {ROLE_LABEL[roster[0]?.role ?? 'D'].toLowerCase()} da svincolare</p>
      <SceltaSvincolo
        opzioni={roster} valore={releaseId} onScegli={setReleaseId}
        ruolo={roster[0]?.role ?? 'D'} attuale={currentReleaseId}
      />

      {nuovoBudget != null && (
        <div className="budget-riga">
          <span>Nuovo budget</span>
          <b className="num">{nuovoBudget} cr</b>
          {nuovoBudget !== budget && <small className="num">prima {budget}</small>}
        </div>
      )}

      {editState && (
        <div className={editState.ok ? 'callout' : 'callout crit'} role="status">{editState.message}</div>
      )}

      <button type="submit" className="primary largo" disabled={editing || releaseId === currentReleaseId}>
        {editing ? 'Salvo…' : 'Salva'}
      </button>
    </form>
  );
}

/**
 * La mia chiamata o adesione su un lotto: si può cambiare il giocatore messo
 * sul piatto o ritirarsi, finché la finestra è aperta.
 */
export function MyParticipation({ lotId, isCaller, status, budget, roster, credits, currentReleaseId, editable, deadlineLabel }: {
  lotId: string;
  isCaller: boolean;
  status: string;
  budget: number;
  roster: Svincolabile[];
  credits: number;
  currentReleaseId: string;
  editable: boolean;
  deadlineLabel: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [outState, doWithdraw, withdrawing] = useActionState<ActionState, FormData>(withdrawParticipation, null);
  const attuale = roster.find((r) => r.id === currentReleaseId);

  return (
    <div className="mia-partecipazione">
      <div className="mia-riga">
        <span className={`tag ${status === 'pending_approval' ? 'warn' : 'ok'}`}>
          {status === 'pending_approval' ? 'Congelata' : isCaller ? 'Tua chiamata' : 'Aderito'}
        </span>
        <span className="mia-dati">
          {attuale ? <>esce <b>{attuale.name}</b> · </> : ''}budget <b className="num">{budget}</b>
        </span>
      </div>

      {editable ? (
        <div className="mia-azioni">
          <button type="button" className="piccolo" onClick={() => setAperto(true)}>Cambia</button>
          <form action={doWithdraw}>
            <input type="hidden" name="lotId" value={lotId} />
            <button type="submit" className="piccolo pericolo" disabled={withdrawing}>
              {withdrawing ? 'Ritiro…' : 'Ritira'}
            </button>
          </form>
        </div>
      ) : (
        <span className="mia-scadenza">{deadlineLabel}</span>
      )}

      {outState && (
        <div className={outState.ok ? 'callout' : 'callout crit'} role="status">
          {outState.message}
          {outState.warnings?.map((w) => (
            <div key={w} style={{ marginTop: 6, fontSize: '.86rem' }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <Foglio aperto={aperto} onChiudi={() => setAperto(false)} titolo="Cambia lo svincolando">
        <ModuloCambio
          lotId={lotId} isCaller={isCaller} budget={budget} roster={roster}
          credits={credits} currentReleaseId={currentReleaseId}
        />
      </Foglio>
    </div>
  );
}

/** Il pulsante con cui l'admin annulla la chiamata o l'adesione di una squadra. */
function ModuloAnnullo({ participantId, isCaller }: { participantId: string; isCaller: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(adminCancelParticipation, null);
  return (
    <form action={action}>
      <input type="hidden" name="participantId" value={participantId} />
      <p className="foglio-nota" style={{ marginTop: 4 }}>
        {isCaller
          ? 'Se nessun altro partecipa, sparisce anche il lotto.'
          : 'La squadra resta fuori da questo lotto.'}
      </p>
      <div className="field">
        <label htmlFor={`why-${participantId}`}>Motivo</label>
        <input id={`why-${participantId}`} name="reason" required
               placeholder="Lo legge l'allenatore dentro l'app" />
      </div>
      {state && <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>}
      <button type="submit" className="largo pericolo-pieno" disabled={pending}>
        {pending ? 'Annullo…' : 'Annulla'}
      </button>
    </form>
  );
}

export function AdminCancel({ participantId, teamName, isCaller }: {
  participantId: string; teamName: string; isCaller: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <button type="button" className="chip-admin" onClick={() => setAperto(true)}>
        {teamName} <span aria-hidden="true">×</span>
        <span className="sr-only"> · annulla la {isCaller ? 'chiamata' : 'adesione'}</span>
      </button>
      <Foglio
        aperto={aperto} onChiudi={() => setAperto(false)}
        titolo={`Annulla la ${isCaller ? 'chiamata' : 'adesione'} di ${teamName}`}
      >
        <ModuloAnnullo participantId={participantId} isCaller={isCaller} />
      </Foglio>
    </>
  );
}
