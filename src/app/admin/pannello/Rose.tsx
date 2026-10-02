'use client';

import { useActionState } from 'react';
import {
  aggiornaListoneAction, aggiornaRoseAction, type StatoListone, type StatoRose,
} from './actions';

/** «Aggiorna listone e svincolati»: l'anagrafica dalla lega, senza toccare le rose. */
export function AggiornaListone() {
  const [stato, azione, inCorso] = useActionState<StatoListone, FormData>(async () => aggiornaListoneAction(), null);
  return (
    <form action={azione} style={{ marginBottom: 12 }}>
      <button type="submit" disabled={inCorso}>{inCorso ? 'Leggo il listone della lega…' : 'Aggiorna listone e svincolati'}</button>
      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} style={{ marginTop: 8 }}>
          {stato.messaggio}
          {stato.dettagli.length > 0 && <ul style={{ margin: '6px 0 0' }}>{stato.dettagli.map((d) => <li key={d}>{d}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}

/**
 * «Aggiorna le rose»: il primo invio mostra le differenze con la lega, il
 * secondo — con la conferma spuntata — le scrive.
 */
export function AggiornaRose() {
  const [stato, azione, inCorso] = useActionState<StatoRose, FormData>(aggiornaRoseAction, null);
  const r = stato?.preview?.rosters;
  const daConfermare = Boolean(stato?.ok && stato.cambi > 0 && !stato.applicate);

  return (
    <form action={azione}>
      {daConfermare && (
        <label style={{
          display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px',
          textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: '.86rem',
        }}>
          <input type="checkbox" name="conferma" style={{ width: 'auto' }} />
          <b>confermo, copia le rose della lega</b>
        </label>
      )}
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Leggo le rose della lega…' : daConfermare ? 'Applica le differenze' : 'Aggiorna le rose da Leghe Fantacalcio'}
      </button>

      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} role="status" style={{ marginTop: 10 }}>
          {stato.messaggio}
          {stato.dettagli && stato.dettagli.length > 0 && (
            <ul style={{ margin: '6px 0 0' }}>{stato.dettagli.map((d) => <li key={d}>{d}</li>)}</ul>
          )}
        </div>
      )}

      {stato?.conflitti && stato.conflitti.length > 0 && !stato.applicate && (
        <div className="callout crit">
          <b>Giocatori mossi di recente nell&apos;app.</b> Se la lega non è ancora stata aggiornata,
          copiarla disferebbe questi movimenti — il giro del mattino per questo non li tocca:
          <ul style={{ margin: '6px 0 0' }}>
            {stato.conflitti.map((c) => <li key={c.extId}>{c.nome}: {c.motivo}</li>)}
          </ul>
        </div>
      )}

      {stato?.checks && stato.checks.some((c) => !c.ok) && (
        <div className="callout crit">
          <b>Rose della lega da controllare:</b>
          <ul style={{ margin: '6px 0 0' }}>
            {stato.checks.filter((c) => !c.ok).map((c) => <li key={c.teamName}>{c.teamName}: {c.problems.join('; ')}</li>)}
          </ul>
        </div>
      )}

      {r && stato?.cambi ? (
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Cambiamento</th><th>Giocatore</th><th>Dettaglio</th></tr></thead>
            <tbody>
              {r.repriced.map((x) => (
                <tr key={`p${x.extId}`}>
                  <td><span className="tag warn">Prezzo</span></td>
                  <td><b>{x.name}</b> <span style={{ color: 'var(--muted)' }}>{x.teamName}</span></td>
                  <td className="mono">{x.from} → {x.to} crediti</td>
                </tr>
              ))}
              {r.moved.map((x) => (
                <tr key={`m${x.extId}`}>
                  <td><span className="tag warn">Squadra</span></td>
                  <td><b>{x.name}</b></td>
                  <td>{x.from} → {x.to} · {x.price} crediti</td>
                </tr>
              ))}
              {r.added.map((x) => (
                <tr key={`a${x.extId}`}>
                  <td><span className="tag ok">Entra</span></td>
                  <td><b>{x.name}</b></td>
                  <td>in {x.teamName} per {x.price} crediti</td>
                </tr>
              ))}
              {r.removed.map((x) => (
                <tr key={`r${x.extId}`}>
                  <td><span className="tag crit">Esce</span></td>
                  <td><b>{x.name}</b></td>
                  <td>
                    da {x.teamName} · pagato {x.price}, restituiti <b>{x.rimborso}</b>
                    {x.tipoRimborso === 'free_100' ? ' (100%: fuori dalla Serie A o squalificato)' : ' (75%)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </form>
  );
}
