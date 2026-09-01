'use client';

import { useActionState } from 'react';
import { condividiSchedina, type ActionState } from './actions';

/**
 * L'interruttore della condivisione, una schedina alla volta.
 * Sta dentro un `<summary>`, quindi il click non deve aprire la tendina:
 * per questo ferma la propagazione.
 */
export function Condividi({ slipId, condivisa }: { slipId: string; condivisa: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(condividiSchedina, null);

  return (
    <form action={action} onClick={(e) => e.stopPropagation()} className="condividi">
      <input type="hidden" name="slipId" value={slipId} />
      <input type="hidden" name="condividi" value={condivisa ? 'no' : 'si'} />
      <button type="submit" className={condivisa ? 'on' : ''} disabled={pending}
              title={condivisa
                ? 'Gli altri la vedono nella loro tab. Tocca per nasconderla.'
                : 'Solo tu la vedi. Tocca per mostrarla agli altri.'}>
        {pending ? '…' : condivisa ? 'Condivisa' : 'Condividi'}
      </button>
      {state && !state.ok && <span className="condividi-err">{state.message}</span>}
    </form>
  );
}
