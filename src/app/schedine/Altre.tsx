import { schedineCondivise } from '@/lib/tipsterServer';
import { ElencoGiocate } from './giocate';

/**
 * Le schedine che gli altri hanno voluto mostrare, a tendine annidate:
 * giornata → squadra → giocate. Chi non condivide non compare.
 */
export async function Altre({ teamId, leagueId }: { teamId: string; leagueId: string }) {
  const giornate = await schedineCondivise(leagueId, teamId);

  if (!giornate.length) {
    return (
      <div className="panel">
        <div className="empty">
          Nessuno ha ancora condiviso una schedina.<br />
          Puoi cominciare tu: in «Le mie schedine» c'è il tasto Condividi.
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="sub" style={{ marginBottom: 12 }}>
        Solo le schedine che gli altri hanno scelto di mostrare.
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
