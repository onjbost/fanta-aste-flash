'use client';

import { useActionState, useEffect, useRef } from 'react';
import { requestFreeRelease, withdrawFreeRelease, type ActionState } from './actions';

export function FreeReleaseButton(props: {
  playerId: string;
  playerName: string;
  price: number;
  refund: number;
  canRequest: boolean;
  pending: boolean;
  hint: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, sending] = useActionState<ActionState, FormData>(requestFreeRelease, null);
  const [wState, withdraw, withdrawing] = useActionState<ActionState, FormData>(withdrawFreeRelease, null);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => ref.current?.close(), 1600);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (props.pending) {
    return (
      <form action={withdraw} style={{ display: 'inline' }}>
        <input type="hidden" name="playerId" value={props.playerId} />
        <button type="submit" className="link" disabled={withdrawing} title={wState?.message}>
          {withdrawing ? 'Ritiro…' : 'Ritira richiesta'}
        </button>
      </form>
    );
  }

  if (!props.canRequest) {
    return <span className="tag muted" title={props.hint}>{props.hint}</span>;
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}>
        Richiedi svincolo gratuito
      </button>

      <dialog ref={ref}>
        <div className="head">Svincolo gratuito · {props.playerName}</div>
        <form action={action}>
          <div className="body">
            <p style={{ marginTop: 0, fontSize: '.92rem' }}>
              Chiedi all'admin di considerare questo svincolo come cambio gratuito.
              Le prove e le spiegazioni portale nel gruppo: qui basta il pulsante.
            </p>

            <table style={{ minWidth: 0, marginBottom: 4 }}>
              <tbody>
                <tr>
                  <td style={{ paddingLeft: 0 }}>Se approva</td>
                  <td className="num"><b>{props.price} cr</b></td>
                  <td style={{ color: 'var(--muted)' }}>cambio non consumato</td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 0 }}>Se rifiuta</td>
                  <td className="num">{props.refund} cr</td>
                  <td style={{ color: 'var(--muted)' }}>cambio consumato</td>
                </tr>
              </tbody>
            </table>

            <p style={{ fontSize: '.88rem', color: 'var(--muted)' }}>
              Se hai già chiamato o aderito con questo giocatore, l'operazione resta
              congelata finché l'admin non decide. Può anche annullarla, così ne fai
              un'altra con un giocatore diverso.
            </p>

            <input type="hidden" name="playerId" value={props.playerId} />
            {state && <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>}
          </div>
          <div className="foot">
            <button type="button" onClick={() => ref.current?.close()}>Annulla</button>
            <button type="submit" className="primary" disabled={sending}>
              {sending ? 'Invio…' : 'Invia richiesta'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
