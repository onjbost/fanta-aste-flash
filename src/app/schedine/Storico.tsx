import { storicoSchedine } from '@/lib/tipsterServer';
import { ElencoGiocate, PillolaEsito } from './giocate';

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
        Le schedine sono pubbliche: appena la salvi, gli altri la vedono.
      </p>

      {schedine.map((s, i) => {
        const prese = s.giocate.filter((g) => g.outcome === 'won').length;
        return (
          <details className="biglietto" key={s.slipId} open={i === 0 || undefined}>
            <summary>
              <div className="biglietto-testa">
                <div>
                  <b>Giornata {s.giornata ?? '—'}</b>
                  <small>
                    {s.giocate.length} {s.giocate.length === 1 ? 'giocata' : 'giocate'} ·{' '}
                    {new Date(s.inviataIl).toLocaleDateString('it-IT', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
                    })}
                  </small>
                </div>
                <PillolaEsito conclusa={s.conclusa} prese={prese} totale={s.giocate.length} punti={s.punti} />
              </div>
            </summary>
            <div className="biglietto-corpo">
              <ElencoGiocate giocate={s.giocate} />
            </div>
          </details>
        );
      })}
    </>
  );
}
