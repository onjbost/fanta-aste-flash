'use client';

import { useActionState } from 'react';
import { Passi } from './Passi';
import { aggiornaFonti, aggiornaIndisponibili, type InfState } from '../infortuni/actions';
import {
  aggiornaCalendarioAction, importaGiornataAction, type StatoCalendario, type StatoGiro,
} from './actions';

/** «Aggiorna calendario»: orari, anticipi, posticipi e rinvii da fantacalcio.it. */
export function AggiornaCalendario() {
  const [stato, azione, inCorso] = useActionState<StatoCalendario, FormData>(aggiornaCalendarioAction, null);
  return (
    <form action={azione}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="giornata-calendario">Giornata di Serie A</label>
          <input id="giornata-calendario" name="giornata" inputMode="numeric" placeholder="le prossime" style={{ width: 120 }} />
        </div>
        <button type="submit" disabled={inCorso}>
          {inCorso ? 'Leggo il calendario…' : 'Aggiorna calendario da fantacalcio.it'}
        </button>
      </div>
      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} role="status" style={{ marginTop: 10 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{stato.righe.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </form>
  );
}

export function ImportaGiornata({ prossima }: { prossima: number }) {
  const [stato, azione, inCorso] = useActionState<StatoGiro, FormData>(importaGiornataAction, null);
  return (
    <form action={azione}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tipo">Competizione</label>
          <select id="tipo" name="tipo" defaultValue="campionato">
            <option value="campionato">Campionato</option>
            <option value="coppa">Coppa</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="giornata">Giornata</label>
          <input id="giornata" name="giornata" inputMode="numeric" defaultValue={prossima} style={{ width: 90 }} />
        </div>
        <button type="submit" className="primary" disabled={inCorso}>
          {inCorso ? 'Calcolo e importo…' : 'Importa giornata'}
        </button>
      </div>
      {stato && 'errore' in stato && <div className="callout crit" style={{ marginTop: 10 }}>{stato.errore}</div>}
      {stato && 'passi' in stato && (
        <div className={`callout${stato.esito === 'ko' ? ' crit' : ''}`} style={{ marginTop: 10 }}>
          <Passi passi={stato.passi} />
        </div>
      )}
    </form>
  );
}

function Bottone({ testo, inCorsoTesto, azione: fai }: {
  testo: string; inCorsoTesto: string; azione: () => Promise<InfState>;
}) {
  const [stato, azione, inCorso] = useActionState<InfState, FormData>(async () => fai(), null);
  return (
    <form action={azione} style={{ marginBottom: 12 }}>
      <button type="submit" disabled={inCorso}>{inCorso ? inCorsoTesto : testo}</button>
      {stato && <div className={`callout${stato.ok ? '' : ' crit'}`} style={{ marginTop: 8 }}>{stato.message}</div>}
    </form>
  );
}

export function AggiornaFonti() {
  return <Bottone testo="Aggiorna quotazioni, voti e statistiche" inCorsoTesto="Leggo quotazioni, voti e statistiche…" azione={aggiornaFonti} />;
}

export function AggiornaIndisponibili() {
  return <Bottone testo="Aggiorna indisponibili" inCorsoTesto="Leggo la pagina…" azione={aggiornaIndisponibili} />;
}
