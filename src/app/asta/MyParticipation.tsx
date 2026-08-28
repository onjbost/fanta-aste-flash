'use client';

import { useActionState, useRef, useState } from 'react';
import {
  updateParticipation, withdrawParticipation, adminCancelParticipation,
  type ActionState,
} from './actions';
import { ROLE_LABEL, type Role } from '@/lib/rules';

interface RosterOption {
  id: string; name: string; role: Role; price: number; refund: number; free: boolean;
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
  roster: RosterOption[];
  credits: number;
  currentReleaseId: string;
  editable: boolean;
  deadlineLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editState, doEdit, editing] = useActionState<ActionState, FormData>(updateParticipation, null);
  const [outState, doWithdraw, withdrawing] = useActionState<ActionState, FormData>(withdrawParticipation, null);
  const [releaseId, setReleaseId] = useState(currentReleaseId);

  const scelto = roster.find((r) => r.id === releaseId);
  const nuovoBudget = scelto ? credits + scelto.refund : null;
  const attuale = roster.find((r) => r.id === currentReleaseId);
  const state = editState ?? outState;

  return (
    <div style={{ textAlign: 'right' }}>
      <span className={`tag ${status === 'pending_approval' ? 'warn' : 'ok'}`}>
        {status === 'pending_approval' ? 'Congelata' : isCaller ? 'Tua chiamata' : 'Aderito'}
      </span>

      <div className="mono" style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '4px 0 6px' }}>
        {attuale ? `svincoli ${attuale.name} · ` : ''}budget {budget} cr
      </div>

      {editable ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => ref.current?.showModal()}>Cambia</button>
          <form action={doWithdraw}>
            <input type="hidden" name="lotId" value={lotId} />
            <button type="submit" disabled={withdrawing}
                    style={{ color: 'var(--crit)', borderColor: 'var(--border)' }}>
              {withdrawing ? 'Ritiro…' : 'Ritira'}
            </button>
          </form>
        </div>
      ) : (
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{deadlineLabel}</span>
      )}

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status"
             style={{ textAlign: 'left', marginBottom: 0 }}>
          {state.message}
          {state.warnings?.map((w) => (
            <div key={w} style={{ marginTop: 6, fontSize: '.85rem' }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <dialog ref={ref}>
        <div className="head">Cambia il giocatore da svincolare</div>
        <form action={doEdit}>
          <div className="body">
            <input type="hidden" name="lotId" value={lotId} />
            <p style={{ marginTop: 0, fontSize: '.9rem', color: 'var(--muted)' }}>
              La {isCaller ? 'chiamata' : 'adesione'} resta dov&apos;è: cambia solo chi
              metti sul piatto, e con lui il tuo budget.
            </p>

            <div className="field">
              <label htmlFor={`rel-${lotId}`}>
                Il tuo {ROLE_LABEL[roster[0]?.role ?? 'D'].toLowerCase()} da svincolare
              </label>
              <select id={`rel-${lotId}`} name="releaseId" value={releaseId}
                      onChange={(e) => setReleaseId(e.target.value)} required>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · pagato {r.price} → rende {r.refund}{r.free ? ' (gratuito)' : ''}
                    {r.id === currentReleaseId ? ' — attuale' : ''}
                  </option>
                ))}
              </select>
            </div>

            {nuovoBudget != null && (
              <div className="callout">
                Nuovo budget su questo lotto: <b>{nuovoBudget} crediti</b>
                {nuovoBudget !== budget && (
                  <span style={{ color: 'var(--muted)' }}> (prima erano {budget})</span>
                )}
              </div>
            )}

            {editState && (
              <div className={editState.ok ? 'callout' : 'callout crit'} role="status">
                {editState.message}
              </div>
            )}
          </div>
          <div className="foot">
            <button type="button" onClick={() => ref.current?.close()}>Chiudi</button>
            <button type="submit" className="primary"
                    disabled={editing || releaseId === currentReleaseId}>
              {editing ? 'Salvo…' : 'Salva'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** Il pulsante con cui l'admin annulla la chiamata o l'adesione di una squadra. */
export function AdminCancel({ participantId, teamName, isCaller }: {
  participantId: string; teamName: string; isCaller: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(adminCancelParticipation, null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}
              style={{ fontSize: '.72rem', padding: '2px 8px' }}>
        annulla
      </button>
      <dialog ref={ref}>
        <div className="head">Annulla la {isCaller ? 'chiamata' : 'adesione'} di {teamName}</div>
        <form action={action}>
          <div className="body">
            <input type="hidden" name="participantId" value={participantId} />
            <p style={{ marginTop: 0, fontSize: '.9rem', color: 'var(--muted)' }}>
              {isCaller
                ? 'Se nessun altro partecipa, sparisce anche il lotto.'
                : 'La squadra resta fuori da questo lotto.'}
            </p>
            <div className="field">
              <label htmlFor={`why-${participantId}`}>Motivo</label>
              <input id={`why-${participantId}`} name="reason" required
                     placeholder="Lo legge l'allenatore dentro l'app" />
            </div>
            {state && (
              <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>
            )}
          </div>
          <div className="foot">
            <button type="button" onClick={() => ref.current?.close()}>Chiudi</button>
            <button type="submit" className="primary" disabled={pending}
                    style={{ background: 'var(--crit)', borderColor: 'var(--crit)' }}>
              {pending ? 'Annullo…' : 'Annulla'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
