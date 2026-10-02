'use client';

import { useActionState } from 'react';
import { aggiornaFonti, aggiornaIndisponibili, proponiSvincolo, type InfState } from './actions';

export function BottoneAggiorna() {
  const [stato, azione, inCorso] = useActionState<InfState, FormData>(
    async () => aggiornaIndisponibili(), null,
  );
  return (
    <form action={azione} style={{ margin: '0 0 16px' }}>
      <button type="submit" className="primary" disabled={inCorso}>
        {inCorso ? 'Leggo la pagina…' : 'Aggiorna adesso'}
      </button>
      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>
          {stato.message}
        </div>
      )}
    </form>
  );
}

export function BottoneFonti() {
  const [stato, azione, inCorso] = useActionState<InfState, FormData>(
    async () => aggiornaFonti(), null,
  );
  return (
    <form action={azione} style={{ margin: '0 0 16px' }}>
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Leggo quotazioni e voti…' : 'Aggiorna quotazioni e voti'}
      </button>
      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>
          {stato.message}
        </div>
      )}
    </form>
  );
}

export function BottoneProponi({ playerId, nome }: { playerId: string; nome: string }) {
  const [stato, azione, inCorso] = useActionState<InfState, FormData>(proponiSvincolo, null);
  return (
    <form action={azione}>
      <input type="hidden" name="playerId" value={playerId} />
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Apro…' : `Apri lo svincolo gratuito per ${nome}`}
      </button>
      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} style={{ marginTop: 8 }}>
          {stato.message}
        </div>
      )}
    </form>
  );
}
