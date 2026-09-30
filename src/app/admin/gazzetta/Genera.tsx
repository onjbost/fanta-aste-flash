'use client';

import { useActionState, useState } from 'react';
import { TONI } from '@/lib/redazione/toni';
import { aggiornaFoto, generaChiusura, generaPrima, generaRumors, type GazState } from './actions';

/**
 * Il bottone che scrive una prima pagina nuova.
 *
 * Ogni clic è una versione in più, mai una di meno: «più cattiva» non
 * distrugge la bozza di prima. La levetta del tono è la stessa della
 * Redazione, perché è lo stesso pezzo con un'altra impaginazione.
 */
export function Genera({ matchdayId, esiste, tipo }: {
  matchdayId: string; esiste: boolean; tipo: 'settimanale' | 'coppa';
}) {
  const [stato, azione, inCorso] = useActionState<GazState, FormData>(generaPrima, null);

  return (
    <form action={azione} className="gaz-genera">
      <input type="hidden" name="matchdayId" value={matchdayId} />
      <input type="hidden" name="tipo" value={tipo} />
      <label>
        Tono
        <select name="tono" defaultValue="4">
          {Object.entries(TONI).map(([n, testo]) => (
            <option key={n} value={n}>{n} — {testo}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={inCorso}>
        {inCorso
          ? 'Scrivo…'
          : `${esiste ? 'Riscrivi' : 'Scrivi'} la prima pagina ${tipo === 'coppa' ? 'di coppa' : 'di campionato'}`}
      </button>
      {stato && <p className={stato.ok ? 'ok' : 'ko'}>{stato.message}</p>}
    </form>
  );
}

/** Rilegge le news adesso: il cron lo fa il mercoledì, e non sempre si aspetta. */
export function AggiornaFoto() {
  const [stato, azione, inCorso] = useActionState<GazState, FormData>(aggiornaFoto, null);
  return (
    <form action={azione} className="gaz-genera">
      <button type="submit" className="ghost" disabled={inCorso}>
        {inCorso ? 'Leggo le news…' : 'Aggiorna le foto dalle news'}
      </button>
      {stato && <p className={stato.ok ? 'ok' : 'ko'}>{stato.message}</p>}
    </form>
  );
}

/** Le indiscrezioni: si sceglie la sessione d'asta, non la giornata. */
export function GeneraRumors({ sessionId, esiste }: { sessionId: string; esiste: boolean }) {
  const [stato, azione, inCorso] = useActionState<GazState, FormData>(generaRumors, null);

  return (
    <form action={azione} className="gaz-genera">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label>
        Tono
        <select name="tono" defaultValue="4">
          {Object.entries(TONI).map(([n, testo]) => (
            <option key={n} value={n}>{n} — {testo}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Scrivo…' : `${esiste ? 'Riscrivi' : 'Scrivi'} le indiscrezioni`}
      </button>
      {stato && <p className={stato.ok ? 'ok' : 'ko'}>{stato.message}</p>}
    </form>
  );
}

/** Uno scambio nell'elenco da spuntare, già ridotto a quello che si vede. */
export interface ScambioDaSpuntare {
  id: string;
  quando: string;
  squadraA: string;
  squadraB: string;
  versoA: string[];
  versoB: string[];
  dallUltimaAsta: boolean;
}

/**
 * Il mercato chiuso, con gli scambi da mandare in generazione.
 *
 * Gli scambi di questa finestra — dall'asta precedente in poi — arrivano già
 * spuntati: è la proposta, e nove volte su dieci è giusta. Quelli più
 * vecchi restano nascosti dietro un bottone, perché un elenco lungo di roba
 * già raccontata farebbe solo perdere di vista i tre che contano; si aprono
 * quando serve, e da lì se ne aggiunge o se ne toglie.
 */
export function GeneraChiusura({ sessionId, esiste, scambi }: {
  sessionId: string; esiste: boolean; scambi: ScambioDaSpuntare[];
}) {
  const [stato, azione, inCorso] = useActionState<GazState, FormData>(generaChiusura, null);
  const [scelti, setScelti] = useState<string[]>(
    () => scambi.filter((s) => s.dallUltimaAsta).map((s) => s.id),
  );
  const [mostraVecchi, setMostraVecchi] = useState(false);

  const recenti = scambi.filter((s) => s.dallUltimaAsta);
  const vecchi = scambi.filter((s) => !s.dallUltimaAsta);

  const spunta = (id: string) => setScelti((v) =>
    (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const riga = (s: ScambioDaSpuntare) => (
    <label key={s.id} className="gaz-scambio">
      <input type="checkbox" checked={scelti.includes(s.id)} onChange={() => spunta(s.id)} />
      <span>
        <b>{s.squadraA} - {s.squadraB}</b>
        <small>
          {' '}{new Date(s.quando).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
          {' · '}{[...s.versoB, ...s.versoA].join(', ')}
        </small>
      </span>
    </label>
  );

  return (
    <form action={azione} className="gaz-genera gaz-genera-largo">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="scambiPresenti" value="1" />
      {scelti.map((id) => <input key={id} type="hidden" name="scambi" value={id} />)}

      <div className="gaz-scambi">
        <h4>Gli scambi che vanno in pagina</h4>
        {recenti.length === 0 && (
          <p className="gaz-nota">Dall&apos;ultima asta non è stato registrato nessuno scambio.</p>
        )}
        {recenti.map(riga)}

        {vecchi.length > 0 && (
          <>
            <button type="button" className="ghost" onClick={() => setMostraVecchi((v) => !v)}>
              {mostraVecchi ? 'Nascondi gli scambi passati' : `Visualizza scambi passati (${vecchi.length})`}
            </button>
            {mostraVecchi && vecchi.map(riga)}
          </>
        )}

        <p className="gaz-nota">
          {scelti.length === 0
            ? 'Nessuno scambio: la pagina uscirà con le sole aste.'
            : `${scelti.length} ${scelti.length === 1 ? 'scambio' : 'scambi'} nel riquadro di destra.`}
        </p>
      </div>

      <label>
        Tono
        <select name="tono" defaultValue="4">
          {Object.entries(TONI).map(([n, testo]) => (
            <option key={n} value={n}>{n} — {testo}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Scrivo…' : `${esiste ? 'Riscrivi' : 'Scrivi'} il mercato chiuso`}
      </button>
      {stato && <p className={stato.ok ? 'ok' : 'ko'}>{stato.message}</p>}
    </form>
  );
}
