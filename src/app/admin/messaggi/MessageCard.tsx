'use client';

import { useActionState, useState } from 'react';
import { generateMessage, markSent, type MsgState } from './actions';
import type { MessageKind } from '@/lib/messages';

interface Saved { id: string; body: string; status: string; createdAt: string }

export function MessageCard({ sessionId, kind, label, saved }: {
  sessionId: string; kind: MessageKind; label: string; saved: Saved[];
}) {
  const [genState, generate, generating] = useActionState<MsgState, FormData>(generateMessage, null);
  const [sentState, send, sending] = useActionState<MsgState, FormData>(markSent, null);
  const [copied, setCopied] = useState(false);

  const latest = saved[0];
  const body = genState?.body ?? latest?.body ?? '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="msgcard">
      <div className="msgcard-head">
        <span>{label}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {latest?.status === 'sent' && <span className="tag ok">Inviato</span>}
          {saved.length > 1 && <span className="tag muted">{saved.length} versioni</span>}
          <form action={generate}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="kind" value={kind} />
            <button type="submit" disabled={generating}>
              {generating ? 'Genero…' : body ? 'Rigenera' : 'Genera'}
            </button>
          </form>
        </span>
      </div>

      {body ? (
        <>
          <pre className="msgcard-body">{body}</pre>
          <div className="msgcard-foot">
            <button type="button" className="primary" onClick={copy}>
              {copied ? 'Copiato ✓' : 'Copia per WhatsApp'}
            </button>
            {latest && latest.status !== 'sent' && (
              <form action={send}>
                <input type="hidden" name="messageId" value={latest.id} />
                <button type="submit" disabled={sending}>Segna come inviato</button>
              </form>
            )}
          </div>
        </>
      ) : (
        <div className="empty" style={{ padding: 20 }}>
          Non ancora generato.
          {genState && !genState.ok && <div style={{ color: 'var(--crit)', marginTop: 8 }}>{genState.message}</div>}
        </div>
      )}

      {sentState && !sentState.ok && <div className="callout crit">{sentState.message}</div>}
    </div>
  );
}
