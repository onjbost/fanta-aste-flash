'use client';

import { useActionState } from 'react';
import { syncFromFile, type SyncState } from './actions';

export function SyncForm() {
  const [state, action, pending] = useActionState<SyncState, FormData>(syncFromFile, null);
  const p = state?.preview;
  const r = p?.rosters;
  const changes = r ? r.added.length + r.removed.length + r.moved.length + r.repriced.length : 0;

  return (
    <div className="panel" style={{ padding: 18 }}>
      <form action={action}>
        <div className="field">
          <label htmlFor="file">Export «Lista calciatori» della lega</label>
          <input id="file" name="file" type="file" accept=".xlsx,.csv,.txt" required />
          <p style={{ fontSize: '.83rem', color: 'var(--muted)', marginTop: 6 }}>
            Il primo invio mostra soltanto le differenze. Niente viene scritto finché non
            spunti la conferma qui sotto e reinvii.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '12px 0 16px' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '.85rem' }}>
            <input type="checkbox" name="rosters" style={{ width: 'auto' }} />
            aggiorna anche le rose (non solo il listone)
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '.85rem' }}>
            <input type="checkbox" name="confirm" style={{ width: 'auto' }} />
            <b>confermo, applica</b>
          </label>
        </div>

        <button type="submit" className="primary" disabled={pending}>
          {pending ? 'Leggo…' : 'Leggi il file'}
        </button>
      </form>

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">
          {state.message}
          {state.applied && state.applied.length > 0 && (
            <ul style={{ margin: '8px 0 0' }}>
              {state.applied.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {state?.checks && state.checks.some((c) => !c.ok) && (
        <div className="callout crit">
          <b>Rose da controllare nel file:</b>
          <ul style={{ margin: '8px 0 0' }}>
            {state.checks.filter((c) => !c.ok).map((c) => (
              <li key={c.teamName}>{c.teamName}: {c.problems.join('; ')}</li>
            ))}
          </ul>
        </div>
      )}

      {p && (
        <>
          <h3 style={{ marginTop: 20 }}>Cosa cambierebbe</h3>

          {changes === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
              Le rose nel file sono identiche a quelle nel database.
            </p>
          ) : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Cambiamento</th><th>Giocatore</th><th>Dettaglio</th></tr></thead>
                <tbody>
                  {r!.repriced.map((x) => (
                    <tr key={`p${x.extId}`}>
                      <td><span className="tag warn">Prezzo</span></td>
                      <td><b>{x.name}</b> <span style={{ color: 'var(--muted)' }}>{x.teamName}</span></td>
                      <td className="mono">{x.from} → {x.to} crediti</td>
                    </tr>
                  ))}
                  {r!.moved.map((x) => (
                    <tr key={`m${x.extId}`}>
                      <td><span className="tag warn">Squadra</span></td>
                      <td><b>{x.name}</b></td>
                      <td>{x.from} → {x.to} · {x.price} crediti</td>
                    </tr>
                  ))}
                  {r!.added.map((x) => (
                    <tr key={`a${x.extId}`}>
                      <td><span className="tag ok">Entra</span></td>
                      <td><b>{x.name}</b></td>
                      <td>in {x.teamName} per {x.price} crediti</td>
                    </tr>
                  ))}
                  {r!.removed.map((x) => (
                    <tr key={`r${x.extId}`}>
                      <td><span className="tag crit">Esce</span></td>
                      <td><b>{x.name}</b></td>
                      <td>
                        da {x.teamName} · pagato {x.price}, restituiti <b>{x.rimborso}</b>
                        {x.tipoRimborso === 'free_100'
                          ? ' (100%: fuori dalla Serie A o squalificato)'
                          : ' (75%)'}
                        {x.fromFlashAuction && (
                          <span className="tag crit" style={{ marginLeft: 8 }}>preso all'asta flash</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 12 }}>
            Listone: {p.listone.newPlayers.length} nuovi, {p.listone.updated.length} aggiornati,
            {' '}{p.listone.disappeared.length} spariti dal file. {r!.unchanged} contratti invariati.
          </p>

          {p.unknownTeams.length > 0 && (
            <div className="callout crit">
              Squadre nel file che non esistono nella lega: {p.unknownTeams.join(', ')}.
              Sistemale prima di applicare, altrimenti quelle rose verrebbero ignorate.
            </div>
          )}

          {r!.removed.some((x) => x.fromFlashAuction) && (
            <div className="callout crit">
              Attenzione: alcuni giocatori che uscirebbero dalle rose erano stati presi
              in un'asta flash. Se il file è stato esportato prima di quell'asta, applicando
              le rose annulleresti il risultato del mercato.
            </div>
          )}
        </>
      )}
    </div>
  );
}
