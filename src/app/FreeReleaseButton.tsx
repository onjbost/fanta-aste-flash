'use client';

import { useActionState } from 'react';
import { requestFreeRelease, withdrawFreeRelease, type ActionState } from './actions';

/**
 * Lo svincolo gratuito di un giocatore della rosa, dentro il suo foglio:
 * cosa succede se l'admin approva o rifiuta, e il bottone per chiederlo (o
 * ritirare la richiesta già fatta).
 */
export function FreeReleaseButton(props: {
  playerId: string;
  playerName: string;
  price: number;
  refund: number;
  canRequest: boolean;
  pending: boolean;
  hint: string;
}) {
  const [state, action, sending] = useActionState<ActionState, FormData>(requestFreeRelease, null);
  const [wState, withdraw, withdrawing] = useActionState<ActionState, FormData>(withdrawFreeRelease, null);

  if (props.pending) {
    return (
      <form action={withdraw}>
        <p className="foglio-nota">La richiesta di svincolo gratuito aspetta la decisione dell&apos;admin.</p>
        <input type="hidden" name="playerId" value={props.playerId} />
        {wState && <div className={wState.ok ? 'callout' : 'callout crit'} role="status">{wState.message}</div>}
        <button type="submit" className="largo pericolo" disabled={withdrawing}>
          {withdrawing ? 'Ritiro…' : 'Ritira la richiesta'}
        </button>
      </form>
    );
  }

  if (!props.canRequest) {
    return <p className="foglio-nota">Svincolo gratuito: {props.hint.toLowerCase()}.</p>;
  }

  return (
    <form action={action}>
      <p className="foglio-k">Svincolo gratuito</p>
      <div className="esiti-due">
        <div><span>Se approva</span><b className="num">{props.price} cr</b><small>cambio non consumato</small></div>
        <div><span>Se rifiuta</span><b className="num">{props.refund} cr</b><small>cambio consumato</small></div>
      </div>
      <p className="foglio-nota">
        Le prove portale nel gruppo: qui basta il bottone. Se hai già chiamato o aderito con
        questo giocatore, l&apos;operazione resta congelata finché l&apos;admin non decide.
      </p>
      <input type="hidden" name="playerId" value={props.playerId} />
      {state && <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>}
      <button type="submit" className="largo" disabled={sending || state?.ok}>
        {sending ? 'Invio…' : 'Richiedi svincolo gratuito'}
      </button>
    </form>
  );
}
