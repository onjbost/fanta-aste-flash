'use client';

import { useActionState } from 'react';
import { decideFreeRelease, type ActionState } from '../actions';

export function DecideForm({ requestId, hasOperation }: { requestId: string; hasOperation: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideFreeRelease, null);

  return (
    <form action={action} style={{ marginTop: 14 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="field">
        <label htmlFor={`note-${requestId}`}>Nota interna (facoltativa)</label>
        <input id={`note-${requestId}`} name="decisionNote" placeholder="Prognosi 75 giorni, ok." />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" name="decision" value="approved" className="primary" disabled={pending}>
          Accetta · 100%
        </button>
        <button type="submit" name="decision" value="rejected" disabled={pending}>
          Declina · 75%
        </button>
        {hasOperation && (
          <button type="submit" name="decision" value="cancelled" disabled={pending}
                  style={{ marginLeft: 'auto', color: 'var(--crit)', borderColor: 'var(--crit)' }}>
            Annulla l'operazione
          </button>
        )}
      </div>
      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>
      )}
    </form>
  );
}
