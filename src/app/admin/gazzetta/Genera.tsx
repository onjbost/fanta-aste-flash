'use client';

import { useActionState } from 'react';
import { TONI } from '@/lib/redazione/toni';
import { generaPrima, type GazState } from './actions';

/**
 * Il bottone che scrive una prima pagina nuova.
 *
 * Ogni clic è una versione in più, mai una di meno: «più cattiva» non
 * distrugge la bozza di prima. La levetta del tono è la stessa della
 * Redazione, perché è lo stesso pezzo con un'altra impaginazione.
 */
export function Genera({ matchdayId, esiste }: { matchdayId: string; esiste: boolean }) {
  const [stato, azione, inCorso] = useActionState<GazState, FormData>(generaPrima, null);

  return (
    <form action={azione} className="gaz-genera">
      <input type="hidden" name="matchdayId" value={matchdayId} />
      <label>
        Tono
        <select name="tono" defaultValue="4">
          {Object.entries(TONI).map(([n, testo]) => (
            <option key={n} value={n}>{n} — {testo}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Scrivo…' : esiste ? 'Riscrivi' : 'Scrivi la prima pagina'}
      </button>
      {stato && <p className={stato.ok ? 'ok' : 'ko'}>{stato.message}</p>}
    </form>
  );
}
