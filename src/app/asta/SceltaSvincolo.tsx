'use client';

import { ROLE_PLURAL, type Role } from '@/lib/rules';

export interface Svincolabile {
  id: string; name: string; role: Role; price: number; refund: number; free: boolean;
}

/**
 * Chi metti sul piatto, a pillole.
 *
 * Un `<select>` nascondeva proprio il numero che decide: quanto rende ognuno.
 * Qui ogni pillola dice nome e rimborso, e se ne tocca una. Sotto sono
 * radio veri, quindi il valore arriva al form come prima (`releaseId`).
 */
export function SceltaSvincolo({ opzioni, valore, onScegli, ruolo, attuale, nome = 'releaseId' }: {
  opzioni: Svincolabile[];
  valore: string;
  onScegli: (id: string) => void;
  ruolo: Role;
  /** lo svincolando già dichiarato, quando si sta cambiando */
  attuale?: string;
  nome?: string;
}) {
  if (opzioni.length === 0) {
    return (
      <p className="nota-crit">
        Non hai {ROLE_PLURAL[ruolo]} liberi da mettere sul piatto: gli altri sono già impegnati
        in un altro lotto di questa asta.
      </p>
    );
  }

  return (
    <div className="pillole" role="radiogroup" aria-label="Giocatore da svincolare">
      {opzioni.map((r) => (
        <label key={r.id} className={`pillola${valore === r.id ? ' on' : ''}`}>
          <input
            type="radio" name={nome} value={r.id} checked={valore === r.id}
            onChange={() => onScegli(r.id)} required
          />
          <span className="pillola-nome">{r.name}</span>
          <span className="pillola-cifra num">
            +{r.refund}{r.free ? ' · gratuito' : ''}{r.id === attuale ? ' · attuale' : ''}
          </span>
        </label>
      ))}
    </div>
  );
}
