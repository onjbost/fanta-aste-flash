'use client';

import { useActionState } from 'react';
import { testTelegram, type ActionState } from '../actions';

export function TelegramCheck({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(testTelegram, null);

  return (
    <div className="panel" style={{ padding: 14, marginBottom: 16, background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`tag ${configured ? 'ok' : 'muted'}`}>
          Telegram {configured ? 'attivo' : 'non configurato'}
        </span>
        <span style={{ fontSize: '.85rem', color: 'var(--muted)', flex: 1, minWidth: 200 }}>
          {configured
            ? 'Il bot scrive solo a te: chiamate, richieste da decidere, scadenze ed esiti.'
            : 'Aggiungi TELEGRAM_BOT_TOKEN e TELEGRAM_ADMIN_CHAT_ID su Vercel per riceverle.'}
        </span>
        {configured && (
          <form action={action}>
            <button type="submit" disabled={pending}>
              {pending ? 'Mando…' : 'Mandami una prova'}
            </button>
          </form>
        )}
      </div>
      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status" style={{ marginBottom: 0 }}>
          {state.message}
        </div>
      )}
    </div>
  );
}
