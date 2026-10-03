'use client';

import { useActionState, useMemo, useState } from 'react';
import { salvaSchedina, type ActionState } from './actions';
import { ESATTI_FISSI, ALTRO, ALTRO_FINO_AL_TRE, type Mercato } from '@/lib/tipster';

export interface QuotaUI { market: Mercato; selection: string; price: number }
export interface SfidaUI {
  id: string;
  competition: 'campionato' | 'coppa';
  fase: string;
  casa: string;
  ospite: string;
  quote: QuotaUI[];
}

/**
 * L'ordine in lavagna è fisso e non dipende dalle quote: chi gioca deve
 * trovare la casella sempre nello stesso posto, sfida dopo sfida.
 */
const ORDINE: Record<Mercato, readonly string[]> = {
  '1x2': ['1', 'X', '2'],
  ou: ['over_1.5', 'over_2.5', 'over_3.5', 'under_1.5', 'under_2.5', 'under_3.5'],
  gg: ['gg', 'ng'],
  exact: [...ESATTI_FISSI, ALTRO, ALTRO_FINO_AL_TRE],
};

function inOrdine(mercato: Mercato, quote: QuotaUI[]): QuotaUI[] {
  const pos = ORDINE[mercato];
  return [...quote].sort((a, b) => pos.indexOf(a.selection) - pos.indexOf(b.selection));
}

const ETICHETTA: Record<string, string> = {
  '1': '1', X: 'X', '2': '2', altro: 'Altro', altri: 'Altro',
  'over_1.5': 'Over 1.5', 'under_1.5': 'Under 1.5',
  'over_2.5': 'Over 2.5', 'under_2.5': 'Under 2.5',
  'over_3.5': 'Over 3.5', 'under_3.5': 'Under 3.5',
  gg: 'Goal', ng: 'NoGoal',
};
const etichetta = (s: string) => ETICHETTA[s] ?? s;

/**
 * I risultati esatti in tre colonne, come sulle lavagne dei bookmaker: vince
 * la casa, pareggio, vince l'ospite, ognuna dal punteggio più basso.
 */
function colonneEsatti(quote: QuotaUI[]): { colonne: QuotaUI[][]; altro: QuotaUI[] } {
  const gol = (q: QuotaUI) => q.selection.split('-').map(Number);
  const punteggi = quote.filter((q) => /^\d+-\d+$/.test(q.selection));
  const ordina = (l: QuotaUI[]) => l.sort((a, b) => {
    const [ac, ao] = gol(a); const [bc, bo] = gol(b);
    return Math.max(ac, ao) - Math.max(bc, bo) || Math.min(ac, ao) - Math.min(bc, bo);
  });
  return {
    colonne: [
      ordina(punteggi.filter((q) => gol(q)[0] > gol(q)[1])),
      ordina(punteggi.filter((q) => gol(q)[0] === gol(q)[1])),
      ordina(punteggi.filter((q) => gol(q)[0] < gol(q)[1])),
    ],
    altro: quote.filter((q) => !/^\d+-\d+$/.test(q.selection)),
  };
}

const chiave = (fixtureId: string, market: string, selection: string) =>
  `${fixtureId}|${market}|${selection}`;

export function Schedina({ sfide, iniziali, moltiplicatore, tetto, chiusa }: {
  sfide: SfidaUI[];
  iniziali: { fixtureId: string; market: Mercato; selection: string }[];
  moltiplicatore: number;
  tetto: number;
  chiusa: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvaSchedina, null);
  const [scelte, setScelte] = useState<Set<string>>(
    () => new Set(iniziali.map((g) => chiave(g.fixtureId, g.market, g.selection))),
  );

  const perSfida = useMemo(() => {
    const m = new Map<string, number>();
    scelte.forEach((k) => {
      const f = k.split('|')[0];
      m.set(f, (m.get(f) ?? 0) + 1);
    });
    return m;
  }, [scelte]);

  const giocate = useMemo(() => [...scelte].map((k) => {
    const [fixtureId, market, selection] = k.split('|');
    return { fixtureId, market: market as Mercato, selection };
  }), [scelte]);

  const punti = (fixtureId: string, price: number) => {
    const n = Math.max(1, perSfida.get(fixtureId) ?? 1);
    return (moltiplicatore / n) * price;
  };

  const scoperte = sfide.filter((s) => s.competition === 'campionato' && !perSfida.get(s.id)).length;

  // quanto vale la schedina se le prende tutte: la cifra che chi gioca cerca
  const prezzi = useMemo(() => new Map(sfide.flatMap((s) =>
    s.quote.map((q) => [chiave(s.id, q.market, q.selection), q.price] as const))), [sfide]);
  const potenziale = giocate.reduce((t, g) => t + punti(g.fixtureId, prezzi.get(chiave(g.fixtureId, g.market, g.selection)) ?? 0), 0);

  function tocca(fixtureId: string, market: string, selection: string) {
    if (chiusa) return;
    const k = chiave(fixtureId, market, selection);
    setScelte((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(k)) dopo.delete(k);
      else {
        if ((perSfida.get(fixtureId) ?? 0) >= tetto) return prima;
        dopo.add(k);
      }
      return dopo;
    });
  }

  return (
    <form action={action}>
      <input type="hidden" name="giocate" value={JSON.stringify(giocate)} />

      {sfide.map((s) => {
        const n = perSfida.get(s.id) ?? 0;
        const esito = inOrdine('1x2', s.quote.filter((q) => q.market === '1x2'));
        const altri: [string, QuotaUI[]][] = ([
          ['Gol totali', inOrdine('ou', s.quote.filter((q) => q.market === 'ou'))],
          ['Segnano entrambe', inOrdine('gg', s.quote.filter((q) => q.market === 'gg'))],
          ['Risultato esatto', inOrdine('exact', s.quote.filter((q) => q.market === 'exact'))],
        ] as [string, QuotaUI[]][]).filter(([, q]) => q.length > 0);
        const sceltiAltrove = altri.reduce((t, [, q]) =>
          t + q.filter((x) => scelte.has(chiave(s.id, x.market, x.selection))).length, 0);

        const casella = (q: QuotaUI) => {
          const attiva = scelte.has(chiave(s.id, q.market, q.selection));
          return (
            <button
              type="button"
              key={q.market + q.selection}
              className={`quota${attiva ? ' on' : ''}`}
              onClick={() => tocca(s.id, q.market, q.selection)}
              disabled={chiusa || (!attiva && n >= tetto)}
              aria-pressed={attiva}
              title={attiva ? `vale ${punti(s.id, q.price).toFixed(1)} punti` : undefined}
            >
              <span className="sel">{etichetta(q.selection)}</span>
              <span className="num">{q.price.toFixed(2)}</span>
              {attiva && <span className="pt">{punti(s.id, q.price).toFixed(1)} pt</span>}
            </button>
          );
        };

        return (
          <div className="sfida" key={s.id}>
            <div className="sfida-head">
              <span className={`tag ${s.competition === 'coppa' ? 'warn' : 'muted'}`}>
                {s.competition === 'coppa' ? `Coppa · ${s.fase}` : 'Campionato'}
              </span>
              <span className={`sfida-n num${n === 0 && s.competition === 'campionato' ? ' vuota' : ''}`}>
                {n}<small>/{tetto}</small>
              </span>
            </div>
            <div className="sfida-nomi">
              <span className="casa">{s.casa}</span>
              <span className="vs">vs</span>
              <span className="ospite">{s.ospite}</span>
            </div>

            {esito.length > 0 && <div className="quote griglia3">{esito.map(casella)}</div>}

            {altri.length > 0 && (
              <details className="altri-mercati" open={sceltiAltrove > 0 || undefined}>
                <summary>
                  Altri mercati
                  {sceltiAltrove > 0 && <span className="pallino">{sceltiAltrove}</span>}
                  <svg className="giu" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </summary>
                {altri.map(([titolo, quote]) => {
                  if (titolo === 'Risultato esatto') {
                    const { colonne, altro } = colonneEsatti(quote);
                    return (
                      <div className="mercato" key={titolo}>
                        <div className="mercato-k">{titolo}</div>
                        <div className="esatti">
                          {colonne.map((c, i) => <div className="esatti-col" key={i}>{c.map(casella)}</div>)}
                        </div>
                        {altro.length > 0 && <div className="quote" style={{ marginTop: 6 }}>{altro.map(casella)}</div>}
                      </div>
                    );
                  }
                  return (
                    <div className="mercato" key={titolo}>
                      <div className="mercato-k">{titolo}</div>
                      <div className={titolo === 'Segnano entrambe' ? 'quote griglia2' : 'quote griglia3'}>
                        {quote.map(casella)}
                      </div>
                    </div>
                  );
                })}
              </details>
            )}
          </div>
        );
      })}

      {!chiusa && (
        <div className="barra-schedina">
          <div className="barra-dati">
            <span><b className="num">{giocate.length}</b> {giocate.length === 1 ? 'giocata' : 'giocate'}</span>
            {giocate.length > 0 && <span className="potenziale">fino a <b className="num">{potenziale.toFixed(1)}</b> pt</span>}
            {scoperte > 0 && (
              <span className="avviso">{scoperte} {scoperte === 1 ? 'sfida' : 'sfide'} di campionato senza giocate</span>
            )}
          </div>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      )}

      {state && (
        <div className={`callout${state.ok ? '' : ' crit'}`} style={{ marginTop: 12 }}>{state.message}</div>
      )}
    </form>
  );
}
