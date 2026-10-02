import { cosaGiocaLaLega, giornataCorrente, schedineDegliAltri } from '@/lib/tipsterServer';
import { ElencoGiocate, PillolaEsito, SELEZIONE, MERCATO } from './giocate';

/**
 * «Cosa gioca la lega» sulla giornata in corso: per ogni sfida, le caselle
 * giocate con l'oro tanto più pieno quanto più sono state scelte.
 */
async function CosaGiocaLaLega({ leagueId }: { leagueId: string }) {
  const giornata = await giornataCorrente(leagueId);
  if (!giornata) return null;
  const { sfide, schedine, errore } = await cosaGiocaLaLega(leagueId, giornata);
  if (errore || !sfide.length) return null;

  return (
    <section className="lega-gioca" aria-labelledby="lega-gioca-titolo">
      <h2 id="lega-gioca-titolo">Cosa gioca la lega</h2>
      <p className="sub" style={{ margin: '-4px 0 12px' }}>
        Giornata {giornata.fanta} · {schedine} {schedine === 1 ? 'schedina' : 'schedine'}, la tua compresa.
        Più l&apos;oro è pieno, più quella casella è stata giocata.
      </p>
      {sfide.map((s) => (
        <div className="sfida lega-sfida" key={s.id}>
          <div className="sfida-nomi">
            <span className="casa">{s.casa}</span><span className="vs">vs</span><span className="ospite">{s.ospite}</span>
          </div>
          <div className="quote">
            {s.caselle.map((c) => (
              <span
                key={c.market + c.selection} className={`quota popolare${c.intensita >= 0.55 ? ' forte' : ''}`}
                style={{ ['--pieno' as string]: `${Math.round(18 + c.intensita * 82)}%` }}
                title={`${c.volte} ${c.volte === 1 ? 'volta' : 'volte'}`}
              >
                <span className="sel">
                  {c.market !== '1x2' && <small>{MERCATO[c.market] ?? c.market} </small>}
                  {SELEZIONE[c.selection] ?? c.selection}
                </span>
                <span className="num">{c.price ? c.price.toFixed(2) : '—'}</span>
                <span className="volte num">×{c.volte}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Le schedine degli altri, giornata per giornata: dentro, un biglietto per
 * squadra, chiuso finché non lo tocchi.
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

  return (
    <>
      <CosaGiocaLaLega leagueId={leagueId} />

      <h2>Le schedine degli altri</h2>
      {!giornate.length && (
        <div className="panel">
          <div className="empty">
            Nessun altro allenatore ha ancora giocato una schedina.<br />
            Appena lo fanno, le trovi qui.
          </div>
        </div>
      )}

      {giornate.map((g, i) => (
        <details className="giornata-blocco" key={g.serieA} open={i === 0 || undefined}>
          <summary>
            <b>Giornata {g.giornata ?? '—'}</b>
            <span className="sub">
              {g.squadre.length} {g.squadre.length === 1 ? 'schedina' : 'schedine'}
              {g.conclusa ? ' · conclusa' : ' · in corso'}
            </span>
            <svg className="giu" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </summary>

          {g.squadre.map((s) => {
            const prese = s.giocate.filter((x) => x.outcome === 'won').length;
            return (
              <details className="biglietto" key={s.slipId}>
                <summary>
                  <div className="biglietto-testa">
                    <div>
                      <b>{s.squadra}</b>
                      <small>{s.giocate.length} {s.giocate.length === 1 ? 'giocata' : 'giocate'}</small>
                    </div>
                    <PillolaEsito conclusa={g.conclusa} prese={prese} totale={s.giocate.length} punti={s.punti} />
                  </div>
                </summary>
                <div className="biglietto-corpo">
                  <ElencoGiocate giocate={s.giocate} />
                </div>
              </details>
            );
          })}
        </details>
      ))}
    </>
  );
}
