'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendMagicLink, type ActionState } from '../actions';

/**
 * Il form d'accesso, nella card in fondo come un bet slip.
 *
 * Niente password: si scrive la mail data all'admin e arriva un link. Dopo
 * l'invio la card diventa la conferma, così chi la guarda sa cosa fare ora
 * (aprire la posta) invece di restare davanti a un campo vuoto.
 */
export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendMagicLink, null);
  const error = useSearchParams().get('error');

  if (state?.ok) {
    return (
      <div className="login-card" role="status">
        <div className="login-card-titolo">Controlla la posta</div>
        <p className="sub" style={{ margin: '4px 0 0' }}>{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="login-card">
      <div className="login-card-titolo">Entra</div>
      <p className="sub" style={{ margin: '2px 0 14px' }}>Usa la mail che hai dato all&apos;admin.</p>
      <label htmlFor="email" className="sr-only">Email</label>
      <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required
             placeholder="nome@esempio.it" />
      <button type="submit" className="primary" disabled={pending} style={{ width: '100%', marginTop: 10, minHeight: 48 }}>
        {pending ? 'Invio…' : 'Mandami il link'}
      </button>
      <p className="login-nota">Niente password: ti arriva un link, lo apri e sei dentro.</p>

      {error && !state && <div className="callout crit" role="status">{error}</div>}
      {state && !state.ok && <div className="callout crit" role="status">{state.message}</div>}
    </form>
  );
}
