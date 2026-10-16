'use client';

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { giocaSchedina, salvaBozza, type ActionState } from './actions';
import { ESATTI_FISSI, ALTRO, type Mercato } from '@/lib/tipster';
import type { GiocataStorico } from '@/lib/tipsterServer';
import { Foglio } from '../Foglio';
import { Giocata, TendinaSchedina } from './giocate';

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
  exact: [...ESATTI_FISSI, ALTRO],
};

function inOrdine(mercato: Mercato, quote: QuotaUI[]): QuotaUI[] {
  const pos = ORDINE[mercato];
  return [...quote].sort((a, b) => pos.indexOf(a.selection) - pos.indexOf(b.selection));
}

const ETICHETTA: Record<string, string> = {
  '1': '1', X: 'X', '2': '2', altro: 'Altro',
  'over_1.5': 'Over 1.5', 'under_1.5': 'Under 1.5',
  'over_2.5': 'Over 2.5', 'under_2.5': 'Under 2.5',
  'over_3.5': 'Over 3.5', 'under_3.5': 'Under 3.5',
  gg: 'Goal', ng: 'NoGoal',
};
const etichetta = (s: string) => ETICHETTA[s] ?? s;

const chiave = (fixtureId: string, market: string, selection: string) =>
  `${fixtureId}|${market}|${selection}`;

export interface SchedinaGiocataUI {
  giornata: number | null;
  inviataIl: string;
  giocate: GiocataStorico[];
}

/**
 * La lavagna della giornata. Le caselle accese sono la **bozza** — le scelte
 * salvate e non giocate, alle quote di adesso — mai la schedina giocata, che
 * sta a parte nella tendina in cima.
 *
 * «Salva» tiene le scelte; «Gioca schedina» le gioca e congela le quote. Se
 * per la giornata c'è già una schedina giocata, prima di sovrascriverla si
 * chiede conferma mostrandole tutte e due.
 */
export function Schedina({ sfide, iniziali, moltiplicatore, tetto, chiusa, giornata, giocata }: {
  sfide: SfidaUI[];
  /** la bozza salvata */
  iniziali: { fixtureId: string; market: Mercato; selection: string }[];
  moltiplicatore: number;
  tetto: number;
  chiusa: boolean;
  giornata: number | null;
  giocata: SchedinaGiocataUI | null;
}) {
  const [statoBozza, salva, inSalva] = useActionState<ActionState, FormData>(salvaBozza, null);
  const [statoGioca, gioca, inGioco] = useActionState<ActionState, FormData>(giocaSchedina, null);
  const [ultimo, setUltimo] = useState<'bozza' | 'gioca' | null>(null);
  const [conferma, setConferma] = useState(false);
  const [scelte, setScelte] = useState<Set<string>>(
    () => new Set(iniziali.map((g) => chiave(g.fixtureId, g.market, g.selection))),
  );
  // quello che c'è nella bozza sul server: le scelte diverse sono «non salvate»
  const [salvate, setSalvate] = useState<Set<string>>(() => new Set(scelte));
  const inviate = useRef<Set<string>>(new Set());
  const pending = inSalva || inGioco;

  useEffect(() => { if (statoBozza?.ok) setSalvate(new Set(inviate.current)); }, [statoBozza]);
  useEffect(() => {
    // giocata: la lavagna riparte vuota, la schedina ora sta nella tendina
    if (statoGioca?.ok) { setScelte(new Set()); setSalvate(new Set()); setConferma(false); }
  }, [statoGioca]);

  const sporca = scelte.size !== salvate.size || [...scelte].some((k) => !salvate.has(k));

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

  function invia(quale: 'bozza' | 'gioca') {
    const fd = new FormData();
    fd.set('giocate', JSON.stringify(giocate));
    inviate.current = new Set(scelte);
    setUltimo(quale);
    startTransition(() => (quale === 'bozza' ? salva : gioca)(fd));
  }

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
    <div>

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
                {altri.map(([titolo, quote]) => (
                  <div className="mercato" key={titolo}>
                    <div className="mercato-k">{titolo}</div>
                    <div className={titolo === 'Segnano entrambe' ? 'quote griglia2' : 'quote griglia3'}>
                      {quote.map(casella)}
                    </div>
                  </div>
                ))}
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
          <div className="barra-bottoni">
            <button type="button" disabled={pending || !sporca} onClick={() => invia('bozza')}>
              {inSalva ? 'Salvo…' : 'Salva'}
            </button>
            <button className="primary" type="button" disabled={pending || giocate.length === 0}
                    onClick={() => (giocata ? setConferma(true) : invia('gioca'))}>
              {inGioco ? 'Gioco…' : 'Gioca schedina'}
            </button>
          </div>
        </div>
      )}

      {!chiusa && (
        <p className={`bozza-nota${sporca ? ' sporca' : ''}`}>
          {sporca
            ? 'Modifiche non salvate.'
            : salvate.size
              ? 'Bozza salvata: non è ancora giocata, le quote restano quelle di adesso.'
              : 'Nessuna bozza salvata.'}
        </p>
      )}

      {ultimo && (ultimo === 'bozza' ? statoBozza : statoGioca) && (() => {
        const st = (ultimo === 'bozza' ? statoBozza : statoGioca) as NonNullable<ActionState>;
        return <div className={`callout${st.ok ? '' : ' crit'}`} style={{ marginTop: 12 }}>{st.message}</div>;
      })()}

      {giocata && (
        <Foglio aperto={conferma} onChiudi={() => setConferma(false)} titolo="Sostituire la schedina?">
          <div>
            <p style={{ fontSize: '.9rem', margin: '10px 0 0' }}>
              Per la giornata {giornata ?? '—'} hai già giocato una schedina. Se giochi questa,{' '}
              <b>la precedente viene sovrascritta</b>: le sue giocate e le sue quote non valgono più.
            </p>
            <div className="foglio-k">La schedina che verrà sovrascritta</div>
            <TendinaSchedina {...giocata} moltiplicatore={moltiplicatore} />
            <div className="foglio-k">La nuova, alle quote di adesso</div>
            {giocate.map((g) => {
              const s = sfide.find((x) => x.id === g.fixtureId);
              return (
                <Giocata key={chiave(g.fixtureId, g.market, g.selection)} g={{
                  sfida: s ? `${s.casa} – ${s.ospite}` : '?',
                  competizione: s?.competition ?? 'campionato',
                  market: g.market, selection: g.selection,
                  price: prezzi.get(chiave(g.fixtureId, g.market, g.selection)) ?? 0,
                  outcome: null, points: null, risultato: null,
                }} />
              );
            })}
            {statoGioca && !statoGioca.ok && <div className="callout crit" style={{ marginTop: 10 }}>{statoGioca.message}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setConferma(false)} disabled={inGioco}>Annulla</button>
              <button type="button" className="primary" onClick={() => invia('gioca')} disabled={inGioco}>
                {inGioco ? 'Gioco…' : 'Sì, gioca e sovrascrivi'}
              </button>
            </div>
          </div>
        </Foglio>
      )}
    </div>
  );
}
