import type { GiocataStorico } from '@/lib/tipsterServer';

/**
 * La riga di una giocata in forma compatta, usata sia nello storico proprio
 * sia nelle schedine condivise dagli altri: la stessa cosa si legge allo
 * stesso modo dovunque compaia.
 */

export const MERCATO: Record<string, string> = {
  '1x2': 'Esito', ou: 'Gol', gg: 'Entrambe', exact: 'Esatto',
};

export const SELEZIONE: Record<string, string> = {
  '1': '1', X: 'X', '2': '2',
  'over_1.5': 'Over 1.5', 'under_1.5': 'Under 1.5',
  'over_2.5': 'Over 2.5', 'under_2.5': 'Under 2.5',
  'over_3.5': 'Over 3.5', 'under_3.5': 'Under 3.5',
  gg: 'Goal', ng: 'NoGoal', altro: 'Altro',
};

export function Giocata({ g }: { g: GiocataStorico }) {
  const stato = g.outcome === 'won' ? 'presa' : g.outcome === 'lost' ? 'persa' : 'aperta';
  return (
    <div className={`gio ${stato}`}>
      <span className="gio-sfida">
        {g.competizione === 'coppa' && <span className="tag warn" style={{ marginRight: 6 }}>coppa</span>}
        {g.sfida}
        {g.risultato && <b className="gio-ris">{g.risultato}</b>}
      </span>
      <span className="gio-scelta">
        <span className="gio-mk">{MERCATO[g.market] ?? g.market}</span>
        {SELEZIONE[g.selection] ?? g.selection}
      </span>
      <span className="num gio-q">{g.price.toFixed(2)}</span>
      <span className="num gio-pt">
        {g.outcome === 'won' ? `+${(g.points ?? 0).toFixed(1)}` : g.outcome === 'lost' ? '0' : '—'}
      </span>
    </div>
  );
}

export function ElencoGiocate({ giocate }: { giocate: GiocataStorico[] }) {
  if (!giocate.length) return <div className="empty">Schedina vuota.</div>;
  return <>{giocate.map((g, i) => <Giocata key={i} g={g} />)}</>;
}
