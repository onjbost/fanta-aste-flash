'use client';

import { useActionState, useMemo, useState } from 'react';
import { salvaSchedina, type ActionState } from './actions';
import type { Mercato } from '@/lib/tipster';

export interface QuotaUI { market: Mercato; selection: string; price: number }
export interface SfidaUI {
  id: string;
  competition: 'campionato' | 'coppa';
  fase: string;
  casa: string;
  ospite: string;
  quote: QuotaUI[];
}

const ETICHETTA: Record<string, string> = {
  '1': '1', X: 'X', '2': '2',
  'over_1.5': 'Over 1.5', 'under_1.5': 'Under 1.5',
  'over_2.5': 'Over 2.5', 'under_2.5': 'Under 2.5',
  'over_3.5': 'Over 3.5', 'under_3.5': 'Under 3.5',
  gg: 'Goal', ng: 'NoGoal',
};
const etichetta = (s: string) => ETICHETTA[s] ?? s;

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
        const gruppi: [string, QuotaUI[]][] = [
          ['Esito', s.quote.filter((q) => q.market === '1x2')],
          ['Gol totali', s.quote.filter((q) => q.market === 'ou')],
          ['Segnano entrambe', s.quote.filter((q) => q.market === 'gg')],
          ['Risultato esatto', s.quote.filter((q) => q.market === 'exact')],
        ];

        return (
          <div className="panel sfida" key={s.id}>
            <div className="sfida-head">
              <div>
                <span className={`tag ${s.competition === 'coppa' ? 'warn' : 'muted'}`}>
                  {s.competition === 'coppa' ? `Coppa · ${s.fase}` : 'Campionato'}
                </span>
                <div className="sfida-nomi">{s.casa} <span>–</span> {s.ospite}</div>
              </div>
              <div className={`sfida-n ${n === 0 && s.competition === 'campionato' ? 'vuota' : ''}`}>
                {n}<small>/{tetto}</small>
              </div>
            </div>

            {gruppi.filter(([, q]) => q.length > 0).map(([titolo, quote]) => (
              <div className="mercato" key={titolo}>
                <div className="mercato-k">{titolo}</div>
                <div className="quote">
                  {quote.map((q) => {
                    const attiva = scelte.has(chiave(s.id, q.market, q.selection));
                    return (
                      <button
                        type="button"
                        key={q.market + q.selection}
                        className={`quota${attiva ? ' on' : ''}`}
                        onClick={() => tocca(s.id, q.market, q.selection)}
                        disabled={chiusa || (!attiva && n >= tetto)}
                        title={attiva ? `vale ${punti(s.id, q.price).toFixed(1)} punti` : undefined}
                      >
                        <span className="sel">{etichetta(q.selection)}</span>
                        <span className="num">{q.price.toFixed(2)}</span>
                        {attiva && <span className="pt">{punti(s.id, q.price).toFixed(1)} pt</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {!chiusa && (
        <div className="barra-schedina">
          <div>
            <b>{giocate.length}</b> {giocate.length === 1 ? 'giocata' : 'giocate'}
            {scoperte > 0 && (
              <span className="avviso"> · {scoperte} {scoperte === 1 ? 'sfida' : 'sfide'} di campionato senza giocate</span>
            )}
          </div>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Salvo…' : 'Salva schedina'}
          </button>
        </div>
      )}

      {state && (
        <div className={`callout${state.ok ? '' : ' crit'}`} style={{ marginTop: 12 }}>{state.message}</div>
      )}
    </form>
  );
}
