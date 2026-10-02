'use client';

import { useActionState, useState } from 'react';
import { joinLot, type ActionState } from './actions';
import { ROLE_LABEL, type Role } from '@/lib/rules';
import { Foglio } from '../Foglio';
import { SceltaSvincolo, type Svincolabile } from './SceltaSvincolo';

/** Il contenuto del foglio: si monta all'apertura, quindi riparte pulito ogni volta. */
function ModuloAdesione({ lotId, role, roster, credits }: {
  lotId: string; role: Role; roster: Svincolabile[]; credits: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(joinLot, null);
  const [releaseId, setReleaseId] = useState('');

  const release = roster.find((r) => r.id === releaseId);
  const budget = release ? credits + release.refund : null;

  return (
    <form action={action}>
      <input type="hidden" name="lotId" value={lotId} />

      <p className="foglio-k">Il tuo {ROLE_LABEL[role].toLowerCase()} da svincolare</p>
      <SceltaSvincolo opzioni={roster} valore={releaseId} onScegli={setReleaseId} ruolo={role} />

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor={`max-${lotId}`}>Offerta massima · facoltativa</label>
        <input id={`max-${lotId}`} name="maxBid" type="number" min={1} step={1} inputMode="numeric"
               placeholder="Il sistema rilancia per te fino a qui" />
        <p className="foglio-nota">
          Lasciala se il giorno dell&apos;asta potresti non esserci. Nessuno la vede, mai:
          serve solo al server per rilanciare al posto tuo, un credito alla volta.
        </p>
      </div>

      {budget != null && (
        <div className="budget-riga">
          <span>Budget su questo lotto</span>
          <b className="num">{budget} cr</b>
          <small className="num">{credits} + {release!.refund}</small>
        </div>
      )}

      {state && <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>}

      <button type="submit" className="primary largo" disabled={pending || !releaseId}>
        {pending ? 'Registro…' : 'Aderisci'}
      </button>
    </form>
  );
}

/** «Aderisci»: apre il foglio con lo svincolo a pillole e l'offerta massima. */
export function JoinForm({ lotId, role, roster, credits, giocatore }: {
  lotId: string; role: Role; roster: Svincolabile[]; credits: number; giocatore: string;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <button type="button" className="primary piccolo" onClick={() => setAperto(true)}>Aderisci</button>
      <Foglio aperto={aperto} onChiudi={() => setAperto(false)} titolo={`Aderisci · ${giocatore}`}>
        <ModuloAdesione lotId={lotId} role={role} roster={roster} credits={credits} />
      </Foglio>
    </>
  );
}
