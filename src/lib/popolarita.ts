/**
 * «Cosa gioca la lega»: quante volte è stata giocata ogni casella, sfida per
 * sfida. Serve a sfumare le quote in oro — più è piena, più è giocata.
 *
 * Oro e non verde: «la più giocata» non è «quella uscita», e il verde in
 * quest'app vuol dire solo presa.
 */

export interface GiocataGrezza { fixtureId: string; market: string; selection: string }

export interface CasellaPopolare {
  market: string;
  selection: string;
  volte: number;
  /** da 0 a 1, rispetto alla casella più giocata della stessa sfida */
  intensita: number;
}

const chiave = (m: string, s: string) => `${m}|${s}`;

/**
 * Le caselle giocate di ogni sfida, dalla più giocata.
 *
 * L'intensità si misura dentro la sfida e non su tutta la giornata: una sfida
 * con due schedine e una con otto devono potersi leggere allo stesso modo,
 * «dove sta la lega su questa partita».
 */
export function popolaritaPerSfida(giocate: GiocataGrezza[]): Map<string, CasellaPopolare[]> {
  const conti = new Map<string, Map<string, number>>();
  for (const g of giocate) {
    const m = conti.get(g.fixtureId) ?? new Map<string, number>();
    const k = chiave(g.market, g.selection);
    m.set(k, (m.get(k) ?? 0) + 1);
    conti.set(g.fixtureId, m);
  }

  const out = new Map<string, CasellaPopolare[]>();
  conti.forEach((m, fixtureId) => {
    const max = Math.max(...m.values());
    out.set(fixtureId, [...m.entries()]
      .map(([k, volte]) => {
        const [market, selection] = k.split('|');
        return { market, selection, volte, intensita: volte / max };
      })
      .sort((a, b) => b.volte - a.volte || a.market.localeCompare(b.market)));
  });
  return out;
}
