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

/**
 * L'esito di una schedina in una pillola: in corso, oppure prese e punti.
 * Verde solo se ha portato punti: una schedina a zero non è «presa».
 */
export function PillolaEsito({ conclusa, prese, totale, punti }: {
  conclusa: boolean; prese: number; totale: number; punti: number | null;
}) {
  if (!conclusa) return <span className="pillola-esito">in corso</span>;
  const p = punti ?? 0;
  return (
    <span className={`pillola-esito ${p > 0 ? 'presa' : 'persa'}`}>
      <span className="num">{prese}/{totale}</span>
      <b className="num">{p.toFixed(1)} pt</b>
    </span>
  );
}

/**
 * La schedina giocata della giornata, a tendina: chiusa dice «Schedina ·
 * giornata N», aperta le giocate coi prezzi a cui sono state giocate. Sta in
 * cima a «Gioca», in home e nella conferma prima di sovrascriverla.
 */
export function TendinaSchedina({ giornata, inviataIl, giocate, moltiplicatore, aperta = false }: {
  giornata: number | null;
  inviataIl: string;
  giocate: GiocataStorico[];
  moltiplicatore: number;
  aperta?: boolean;
}) {
  // il moltiplicatore si divide fra le giocate della stessa sfida
  const perSfida = new Map<string, number>();
  giocate.forEach((g) => perSfida.set(g.sfida, (perSfida.get(g.sfida) ?? 0) + 1));
  const concluse = giocate.every((g) => g.outcome != null);
  const fino = giocate.reduce((t, g) => t + (moltiplicatore / (perSfida.get(g.sfida) ?? 1)) * g.price, 0);
  const presi = giocate.reduce((t, g) => t + (g.points ?? 0), 0);

  return (
    <details className="biglietto" open={aperta || undefined}>
      <summary>
        <div className="biglietto-testa">
          <div>
            <b>Schedina · giornata {giornata ?? '—'}</b>
            <small>
              {giocate.length} {giocate.length === 1 ? 'giocata' : 'giocate'} · giocata{' '}
              {new Date(inviataIl).toLocaleString('it-IT', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
              })}
            </small>
          </div>
          {concluse
            ? <PillolaEsito conclusa prese={giocate.filter((g) => g.outcome === 'won').length} totale={giocate.length} punti={presi} />
            : <span className="pillola-esito">fino a <b className="num">{fino.toFixed(1)}</b> pt</span>}
          <svg className="giu" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </summary>
      <div className="biglietto-corpo">
        <ElencoGiocate giocate={giocate} />
        <p className="foglio-nota" style={{ margin: '8px 4px 2px' }}>
          Quote congelate quando l&apos;hai giocata: non cambiano più.
        </p>
      </div>
    </details>
  );
}
