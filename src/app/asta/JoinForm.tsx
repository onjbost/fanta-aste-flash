'use client';

import { useActionState, useRef, useState } from 'react';
import { joinLot, type ActionState } from './actions';
import { ROLE_LABEL, type Role } from '@/lib/rules';

interface RosterOption { id: string; name: string; role: Role; price: number; refund: number; free: boolean }

export function JoinForm({ lotId, role, roster, credits }: {
  lotId: string; role: Role; roster: RosterOption[]; credits: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(joinLot, null);
  const [releaseId, setReleaseId] = useState('');

  const release = roster.find((r) => r.id === releaseId);
  const budget = release ? credits + release.refund : null;

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}>Aderisci</button>

      <dialog ref={ref}>
        <div className="head">Aderisci all'asta</div>
        <form action={action}>
          <div className="body">
            <input type="hidden" name="lotId" value={lotId} />

            <div className="field">
              <label htmlFor={`rel-${lotId}`}>
                Il tuo {ROLE_LABEL[role].toLowerCase()} da svincolare
              </label>
              <select id={`rel-${lotId}`} name="releaseId" value={releaseId}
                      onChange={(e) => setReleaseId(e.target.value)} required>
                <option value="">— scegli —</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · pagato {r.price} → rende {r.refund}{r.free ? ' (gratuito)' : ''}
                  </option>
                ))}
              </select>
              {roster.length === 0 && (
                <p style={{ fontSize: '.85rem', color: 'var(--crit)', marginTop: 6 }}>
                  Non hai {ROLE_LABEL[role].toLowerCase()}i liberi da mettere sul piatto.
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor={`max-${lotId}`}>Offerta massima (facoltativa)</label>
              <input id={`max-${lotId}`} name="maxBid" type="number" min={1} step={1}
                     placeholder="Il sistema rilancia per te fino a questa cifra" />
              <p style={{ fontSize: '.83rem', color: 'var(--muted)', marginTop: 6 }}>
                Lasciala se il giorno dell'asta potresti non esserci. Nessuno la vede, mai:
                serve solo al server per rilanciare al posto tuo, un credito alla volta.
              </p>
            </div>

            {budget != null && (
              <div className="callout">
                Budget su questo lotto: <b>{budget} crediti</b> ({credits} + {release!.refund}).
              </div>
            )}

            {state && <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>}
          </div>
          <div className="foot">
            <button type="button" onClick={() => ref.current?.close()}>Annulla</button>
            <button type="submit" className="primary" disabled={pending || !releaseId}>
              {pending ? 'Registro…' : 'Aderisci'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
