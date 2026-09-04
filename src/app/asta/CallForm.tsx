'use client';

import { useActionState, useMemo, useState } from 'react';
import { callPlayer, type ActionState } from './actions';
import { ROLE_LABEL, type Role } from '@/lib/rules';

interface FreeAgent { id: string; name: string; role: Role; club: string; quotation: number }
interface RosterOption { id: string; name: string; role: Role; price: number; refund: number; free: boolean; committed: boolean }

export function CallForm({ sessionId, freeAgents, roster, credits, changes }: {
  sessionId: string;
  freeAgents: FreeAgent[];
  roster: RosterOption[];
  credits: number;
  changes: { role: Role; left: number }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(callPlayer, null);
  const [targetId, setTargetId] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [q, setQ] = useState('');

  const target = freeAgents.find((p) => p.id === targetId);
  const eligible = useMemo(
    () => roster.filter((r) => !target || r.role === target.role).filter((r) => !r.committed),
    [roster, target],
  );
  const release = eligible.find((r) => r.id === releaseId);
  const budget = release ? credits + release.refund : null;
  const changesLeft = target ? changes.find((c) => c.role === target.role)?.left ?? 0 : null;

  const filtered = useMemo(() => {
    const t = q.trim().toUpperCase();
    return freeAgents.filter((p) => !t || p.name.includes(t) || p.club.toUpperCase().includes(t)).slice(0, 60);
  }, [freeAgents, q]);

  return (
    <div className="panel" style={{ padding: 18 }}>
      <form action={action}>
        <input type="hidden" name="sessionId" value={sessionId} />

        <div className="field">
          <label htmlFor="q">Cerca tra gli svincolati</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cognome o squadra" />
        </div>

        <div className="field">
          <label htmlFor="targetId">Giocatore da chiamare</label>
          <select id="targetId" name="targetId" value={targetId}
                  onChange={(e) => { setTargetId(e.target.value); setReleaseId(''); }} required>
            <option value="">— scegli —</option>
            {filtered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.role} · {p.name} ({p.club}) · qt {p.quotation}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="releaseId">
            Giocatore da svincolare {target && `· deve essere un ${ROLE_LABEL[target.role].toLowerCase()}`}
          </label>
          <select id="releaseId" name="releaseId" value={releaseId}
                  onChange={(e) => setReleaseId(e.target.value)} required disabled={!target}>
            <option value="">— scegli —</option>
            {eligible.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · pagato {r.price} → rende {r.refund}{r.free ? ' (gratuito)' : ''}
              </option>
            ))}
          </select>
          {target && eligible.length === 0 && (
            <p style={{ fontSize: '.86rem', color: 'var(--crit)', marginTop: 6 }}>
              Non hai {ROLE_LABEL[target.role].toLowerCase()}i disponibili da mettere sul piatto:
              gli altri sono già impegnati in un altro lotto di questa asta.
            </p>
          )}
        </div>

        {budget != null && (
          <div className="callout">
            Budget su questo lotto: <b>{budget} crediti</b> ({credits} residui + {release!.refund} di rimborso).
            {changesLeft != null && ` Cambi ${target!.role} rimasti: ${changesLeft}.`}
          </div>
        )}

        <button type="submit" className="primary" disabled={pending || !targetId || !releaseId}>
          {pending ? 'Registro…' : 'Chiama all\'asta'}
        </button>

        {state && (
          <div className={state.ok ? 'callout' : 'callout crit'} role="status">
            {state.message}
            {state.warnings?.map((w) => <div key={w} style={{ marginTop: 6, fontSize: '.86rem' }}>⚠ {w}</div>)}
          </div>
        )}
      </form>
    </div>
  );
}
