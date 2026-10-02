'use client';

import { useActionState } from 'react';
import { provaCronAction, type StatoProva } from './actions';

const SEGNO = { ok: '✅', ko: '❌', info: 'ℹ️' } as const;

export function Prova() {
  const [stato, azione, inCorso] = useActionState<StatoProva, FormData>(provaCronAction, null);
  return (
    <>
      <form action={azione} className="panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="tipo">Competizione</label>
            <select id="tipo" name="tipo" defaultValue="campionato">
              <option value="campionato">Campionato</option>
              <option value="coppa">Coppa</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="giornata">Giornata della lega</label>
            <input id="giornata" name="giornata" inputMode="numeric" defaultValue="4" style={{ width: 90 }} />
          </div>
          <button type="submit" className="primary" disabled={inCorso}>
            {inCorso ? 'Il cron sta girando…' : 'Simula il cron'}
          </button>
        </div>
      </form>

      {stato && 'errore' in stato && <div className="callout crit">{stato.errore}</div>}
      {stato && 'passi' in stato && (
        <ol className="panel" style={{ padding: '12px 16px 12px 36px', marginTop: 14 }}>
          {stato.passi.map((p, i) => (
            <li key={i} style={{ margin: '6px 0' }}>
              <b>{SEGNO[p.esito]} {p.nome}</b>
              <div className="sub" style={{ margin: '2px 0 0' }}>{p.dettaglio}</div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
