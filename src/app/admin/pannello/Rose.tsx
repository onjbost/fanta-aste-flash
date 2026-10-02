'use client';

import { useActionState } from 'react';
import {
  aggiornaListoneAction, aggiornaRoseAction, riportaAstaAction,
  type StatoListone, type StatoRiporto, type StatoRose,
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
 * «Aggiorna le rose»: il primo invio mostra le differenze con la lega (rose,
 * costi, crediti), il secondo — con la conferma spuntata — le copia.
 */
export function AggiornaRose() {
  const [stato, azione, inCorso] = useActionState<StatoRose, FormData>(aggiornaRoseAction, null);
  const d = stato?.differenze;
  const daConfermare = Boolean(stato?.ok && stato.cambi > 0 && !stato.applicate);

  return (
    <form action={azione}>
      {daConfermare && (
        <label style={{
          display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px',
          textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: '.86rem',
        }}>
          <input type="checkbox" name="conferma" style={{ width: 'auto' }} />
          <b>confermo, copia rose, costi e crediti della lega</b>
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

      {d && stato?.cambi ? (
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Cosa</th><th>Chi</th><th>Nella lega</th></tr></thead>
            <tbody>
              {d.crediti.map((x) => (
                <tr key={`k${x.teamName}`}>
                  <td><span className="tag warn">Crediti</span></td>
                  <td><b>{x.teamName}</b></td>
                  <td className="mono">{x.da} → {x.a}</td>
                </tr>
              ))}
              {d.costi.map((x) => (
                <tr key={`p${x.extId}`}>
                  <td><span className="tag warn">Costo</span></td>
                  <td><b>{x.nome}</b> <span style={{ color: 'var(--muted)' }}>{x.teamName}</span></td>
                  <td className="mono">{x.da} → {x.a}</td>
                </tr>
              ))}
              {d.entrano.map((x) => (
                <tr key={`a${x.extId}`}>
                  <td><span className="tag ok">Entra</span></td>
                  <td><b>{x.nome}</b></td>
                  <td>in {x.teamName}, costo {x.price}</td>
                </tr>
              ))}
              {d.escono.map((x) => (
                <tr key={`r${x.extId}`}>
                  <td><span className="tag crit">Esce</span></td>
                  <td><b>{x.nome}</b></td>
                  <td>non è più in {x.teamName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sub" style={{ margin: '8px 0 0' }}>
            È una copia dello stato della lega, non un&apos;operazione di mercato: chi esce non
            restituisce crediti e non consuma cambi, perché i crediti si prendono dalla lega così come sono.
          </p>
        </div>
      ) : null}
    </form>
  );
}

/** Riporta sulla lega svincoli e acquisti dell'ultima asta chiusa. */
export function RiportaAsta({ sessionId }: { sessionId: string | null }) {
  const [stato, azione, inCorso] = useActionState<StatoRiporto, FormData>(riportaAstaAction, null);
  return (
    <form action={azione} style={{ marginTop: 12 }}>
      <input type="hidden" name="sessionId" value={sessionId ?? ''} />
      <button type="submit" disabled={inCorso || !sessionId}>
        {inCorso ? 'Scrivo sulla lega…' : 'Riporta l\'ultima asta sulla lega'}
      </button>
      {stato && (
        <div className={`callout${stato.ok ? '' : ' crit'}`} style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
          {stato.messaggio}
          {stato.passi.length > 0 && <ul style={{ margin: '6px 0 0' }}>{stato.passi.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
