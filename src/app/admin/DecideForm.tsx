'use client';

import { useActionState } from 'react';
import { decideFreeRelease, type ActionState } from '../actions';

export function DecideForm({ requestId, hasOperation }: { requestId: string; hasOperation: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideFreeRelease, null);

  return (
    <form action={action} className="decidi">
      <input type="hidden" name="requestId" value={requestId} />
      <input id={`note-${requestId}`} name="decisionNote" aria-label="Nota interna, facoltativa"
             placeholder="Nota interna, facoltativa" />
      <div className="decidi-bottoni">
        <button type="submit" name="decision" value="approved" className="primary" disabled={pending}>
          Approva · 100%
        </button>
        <button type="submit" name="decision" value="rejected" disabled={pending}>
          Rifiuta · 75%
        </button>
        {hasOperation && (
          <button type="submit" name="decision" value="cancelled" disabled={pending} className="pericolo">
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
