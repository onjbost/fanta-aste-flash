import { storicoSchedine } from '@/lib/tipsterServer';
import { ElencoGiocate } from './giocate';
import { Condividi } from './Condividi';

export async function Storico({ teamId }: { teamId: string }) {
  const { schedine, errore } = await storicoSchedine(teamId);

  if (errore) {
    return (
      <div className="callout crit">
        <b>Non riesco a leggere le schedine.</b><br />
        {errore}<br />
        Se parla di una colonna che non esiste, manca una migrazione su Supabase.
      </div>
    );
  }

  if (!schedine.length) {
    return (
      <div className="panel">
        <div className="empty">
          Non hai ancora giocato nessuna schedina. La prima si fa dalla tab «Gioca».
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="sub" style={{ marginBottom: 12 }}>
        {schedine.length} {schedine.length === 1 ? 'schedina giocata' : 'schedine giocate'}.
        Tocca una riga per vedere cosa avevi giocato. «Condividi» la mostra agli altri
        allenatori nella loro tab; finché non lo fai la vedi solo tu.
      </p>

      {schedine.map((s) => {
        const prese = s.giocate.filter((g) => g.outcome === 'won').length;
        return (
          <details className="panel storico" key={s.slipId}>
            <summary>
              <div className="storico-riga">
                <div>
                  <b>Giornata {s.giornata ?? '—'}</b>
                  <span className="storico-data">
                    {' · '}
                    {new Date(s.inviataIl).toLocaleDateString('it-IT', {
                      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="storico-esito">
                  <Condividi slipId={s.slipId} condivisa={s.condivisa} />
                  <span className="storico-n">
                    {s.giocate.length} {s.giocate.length === 1 ? 'giocata' : 'giocate'}
                  </span>
                  {s.conclusa ? (
                    <>
                      <span className="tag ok">{prese} prese</span>
                      <b className="num">{(s.punti ?? 0).toFixed(1)} pt</b>
                    </>
                  ) : (
                    <span className="tag muted">in corso</span>
                  )}
                </div>
              </div>
            </summary>

            <div className="storico-corpo">
              <ElencoGiocate giocate={s.giocate} />
            </div>
          </details>
        );
      })}
    </>
  );
}
