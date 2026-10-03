import { describe, expect, it } from 'vitest';
import {
  formazioneMC, generatore, grigliaMC, pescaFantavoto, quoteSfidaMC, simulaGiornata,
  type FormazioneMC, type Pesca,
} from './montecarlo';
import { griglia, type GiocatoreTipster } from './tipster';
import type { Role } from './rules';

function rosa(prefisso: string, club: string, q: number, opt: Partial<GiocatoreTipster> = {}): GiocatoreTipster[] {
  const ruoli: [Role, number][] = [['P', 2], ['D', 5], ['C', 6], ['A', 4]];
  return ruoli.flatMap(([r, quanti]) => Array.from({ length: quanti }, (_, i) => ({
    playerId: `${prefisso}-${r}${i}`, role: r, club, quotazione: Math.max(1, q - i * 3), ...opt,
  })));
}

const n = 6000;

function sfida(a: GiocatoreTipster[], b: GiocatoreTipster[], seme = 7) {
  const fa = { ...formazioneMC(a, {}), teamId: 'a' };
  const fb = { ...formazioneMC(b, {}), teamId: 'b' };
  const sim = simulaGiornata(new Map<string, FormazioneMC>([['a', fa], ['b', fb]]), { n, seme });
  const esiti = quoteSfidaMC(sim, fa, fb);
  const p = (m: string, s: string) => esiti.find((e) => e.market === m && e.selection === s)!.probability;
  return { sim, esiti, p, fa, fb };
}

describe('generatore', () => {
  it('con lo stesso seme dà gli stessi numeri', () => {
    const a = generatore(42); const b = generatore(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('pescaFantavoto', () => {
  const r = generatore(3);
  const media = (g: Pesca) => {
    let s = 0;
    for (let i = 0; i < 20000; i++) s += pescaFantavoto(g, r, 0, 0, 0);
    return s / 20000;
  };
  const base: Pesca = { playerId: 'x', role: 'A', club: 'X', media: 8, pGioca: 1, seiPolitico: false, avversario: null };

  it('la media pescata è quella chiesta, per ogni ruolo', () => {
    expect(media(base)).toBeCloseTo(8, 0);
    expect(media({ ...base, role: 'D', media: 6.2 })).toBeCloseTo(6.2, 0);
    expect(media({ ...base, role: 'P', media: 6 })).toBeCloseTo(6, 0);
  });

  it('il 6 politico è 6 secco', () => {
    expect(pescaFantavoto({ ...base, seiPolitico: true }, r, 3, -3, 2)).toBe(6);
  });
});

describe('simulaGiornata e quote', () => {
  it('le probabilità di ogni mercato sommano a uno', () => {
    const { esiti } = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 30));
    for (const m of ['1x2', 'gg', 'exact']) {
      const s = esiti.filter((e) => e.market === m).reduce((x, e) => x + e.probability, 0);
      expect(s).toBeCloseTo(1, 6);
    }
  });

  it('tutti i risultati della lavagna restano quotabili', () => {
    const { esiti } = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 30));
    expect(esiti.filter((e) => e.market === 'exact')).toHaveLength(26);
  });

  it('due squadre uguali hanno quasi le stesse quote', () => {
    const { p } = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 30));
    expect(Math.abs(p('1x2', '1') - p('1x2', '2'))).toBeLessThan(0.04);
  });

  it('la squadra più forte è favorita', () => {
    const { p } = sfida(rosa('a', 'Inter', 45), rosa('b', 'Milan', 12));
    expect(p('1x2', '1')).toBeGreaterThan(p('1x2', '2') + 0.2);
  });

  it('il livello resta quello della stima tarata', () => {
    const { sim, fa } = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 30));
    expect(sim.riepilogo.get('a')!.media).toBeCloseTo(fa.stima.mu, 0);
  });

  it('con lo stesso seme le quote sono identiche', () => {
    const x = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 25), 11).esiti;
    const y = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 25), 11).esiti;
    expect(x).toEqual(y);
  });

  it('chi ha titolari incerti perde punti rispetto a chi li ha sicuri', () => {
    const sicuri = rosa('a', 'Inter', 30, { forma: { fantamedia: null, peso: 0, titolarita: 1 } });
    const incerti = rosa('b', 'Milan', 30, { forma: { fantamedia: null, peso: 0, titolarita: 0.4 } });
    const { sim } = sfida(sicuri, incerti);
    expect(sim.riepilogo.get('a')!.media).toBeGreaterThan(sim.riepilogo.get('b')!.media + 1);
  });

  it('due squadre con gli stessi club pareggiano più spesso: la giornata del club è condivisa', () => {
    const indip = sfida(rosa('a', 'Inter', 30), rosa('b', 'Milan', 30)).p('1x2', 'X');
    const stessi = sfida(rosa('a', 'Inter', 30), rosa('b', 'Inter', 30)).p('1x2', 'X');
    expect(stessi).toBeGreaterThan(indip);
  });
});

describe('grigliaMC', () => {
  it('le caselle vuote prendono un pizzico di modello analitico', () => {
    const g = grigliaMC(Float64Array.from([70, 70]), Float64Array.from([50, 50]),
      griglia({ mu: 66, sd: 8 }, { mu: 66, sd: 8 }), 1);
    expect(g[1][0]).toBeGreaterThan(0.5);
    expect(g[3][3]).toBeGreaterThan(0);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});
