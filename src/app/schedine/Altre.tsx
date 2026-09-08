import { schedineDegliAltri } from '@/lib/tipsterServer';
import { ElencoGiocate } from './giocate';

/**
 * Le schedine degli altri, a tendine annidate: giornata → squadra → giocate.
 *
 * Ci sono tutte: nel Torneo dei Tipster una schedina è pubblica da quando
 * viene giocata. Se una squadra non compare in una giornata, quella giornata
 * non l'ha giocata.
 */
export async function Altre({ teamId, leagueId }: { teamId: string; leagueId: string }) {
  const { giornate, errore } = await schedineDegliAltri(leagueId, teamId);

  if (errore) {
    return (
      <div className="callout crit">
        <b>Non riesco a leggere le schedine degli altri.</b><br />
        {errore}<br />
        Se parla di una colonna che non esiste, manca una migrazione su Supabase.
      </div>
    );
  }

  if (!giornate.length) {
    return (
      <div className="panel">
        <div className="empty">
          Nessun altro allenatore ha ancora giocato una schedina.<br />
          Appena lo fanno, le trovi qui.
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="sub" style={{ marginBottom: 12 }}>
        Tutte le schedine degli altri allenatori, giornata per giornata.
      </p>

      {giornate.map((g) => (
        <details className="panel storico" key={g.serieA} open={giornate[0].serieA === g.serieA}>
          <summary>
            <div className="storico-riga">
              <div>
                <b>Giornata {g.giornata ?? '—'}</b>
                <span className="storico-data">
                  {' · '}
                  {g.data
                    ? new Date(g.data).toLocaleDateString('it-IT', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })
                    : `Serie A ${g.serieA}`}
                </span>
              </div>
              <div className="storico-esito">
                <span className="storico-n">
                  {g.squadre.length} {g.squadre.length === 1 ? 'schedina' : 'schedine'}
                </span>
                {g.conclusa
                  ? <span className="tag ok">conclusa</span>
                  : <span className="tag muted">in corso</span>}
              </div>
            </div>
          </summary>

          <div className="storico-corpo">
            {g.squadre.map((s) => (
              <details className="squadra" key={s.slipId}>
                <summary>
                  <div className="storico-riga">
                    <b>{s.squadra}</b>
                    <div className="storico-esito">
                      <span className="storico-n">
                        {s.giocate.length} {s.giocate.length === 1 ? 'giocata' : 'giocate'}
                      </span>
                      {g.conclusa && <b className="num">{(s.punti ?? 0).toFixed(1)} pt</b>}
                    </div>
                  </div>
                </summary>
                <div className="squadra-corpo">
                  <ElencoGiocate giocate={s.giocate} />
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}
