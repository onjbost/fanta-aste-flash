'use client';

import { useActionState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendMagicLink, type ActionState } from '../actions';

function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendMagicLink, null);
  const error = useSearchParams().get('error');

  return (
    <div className="login">
      <p className="eyebrow">Lega Fanta Mansarda</p>
      <h1>Aste Flash</h1>
      <p className="sub">
        Entra con la mail che hai dato all'admin. Niente password: ti arriva un link,
        lo apri, sei dentro.
      </p>

      <form action={action}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required
                 placeholder="nome@esempio.it" />
        </div>
        <button type="submit" className="primary" disabled={pending} style={{ width: '100%', padding: 10 }}>
          {pending ? 'Invio…' : 'Mandami il link'}
        </button>
      </form>

      {error && !state && (
        <div className="callout crit" role="status">{error}</div>
      )}
      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
