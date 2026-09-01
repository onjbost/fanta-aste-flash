import { describe, it, expect } from 'vitest';
import {
  golDaFantapunti, distribuzioneGol, griglia, mercatiDaGriglia, quoteSfida,
  quotaDaProbabilita, risolvi, puntiGiocata, risolviSchedina,
  fantamediaAttesa, forzaClub, stimaSquadra, MOLTIPLICATORE, ESATTI_FISSI, ALTRO,
  type GiocatoreTipster, type ContestoClub,
} from './tipster';

const somma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('la scala dei gol', () => {
  it('sotto 66 non si segna', () => {
    expect(golDaFantapunti(0)).toBe(0);
    expect(golDaFantapunti(65.5)).toBe(0);
  });
  it('66 è il primo gol, poi uno ogni 6', () => {
    expect(golDaFantapunti(66)).toBe(1);
    expect(golDaFantapunti(71.5)).toBe(1);
    expect(golDaFantapunti(72)).toBe(2);
    expect(golDaFantapunti(78)).toBe(3);
    expect(golDaFantapunti(101)).toBe(6);
  });
});

describe('distribuzione dei gol', () => {
  it('è una distribuzione di probabilità', () => {
    const p = distribuzioneGol({ mu: 72, sd: 9 });
    expect(somma(p)).toBeCloseTo(1, 10);
    expect(p.every((x) => x >= 0)).toBe(true);
  });

  it('una squadra più forte segna di più', () => {
    const scarsa = distribuzioneGol({ mu: 62, sd: 9 });
    const forte = distribuzioneGol({ mu: 80, sd: 9 });
    const attesi = (p: number[]) => p.reduce((s, x, g) => s + x * g, 0);
    expect(attesi(forte)).toBeGreaterThan(attesi(scarsa));
    expect(scarsa[0]).toBeGreaterThan(forte[0]);
  });

  it("l'ultima casella raccoglie le goleade, quindi la somma resta 1", () => {
    const p = distribuzioneGol({ mu: 110, sd: 9 }, 4);
    expect(somma(p)).toBeCloseTo(1, 10);
    expect(p[4]).toBeGreaterThan(0.5);
  });
});

describe('i mercati sono coerenti fra loro', () => {
  const g = griglia({ mu: 72, sd: 9 }, { mu: 71, sd: 9 });
  const esiti = mercatiDaGriglia(g);
  const p = (market: string, selection: string) =>
    esiti.find((e) => e.market === market && e.selection === selection)!.probability;

  it('1 + X + 2 fa 1', () => {
    expect(p('1x2', '1') + p('1x2', 'X') + p('1x2', '2')).toBeCloseTo(1, 10);
  });
  it('over e under si completano su ogni soglia', () => {
    for (const s of [1.5, 2.5, 3.5]) {
      expect(p('ou', `over_${s}`) + p('ou', `under_${s}`)).toBeCloseTo(1, 10);
    }
  });
  it('goal e nogoal si completano', () => {
    expect(p('gg', 'gg') + p('gg', 'ng')).toBeCloseTo(1, 10);
  });
  it('le soglie sono ordinate: over 1.5 è più probabile di over 3.5', () => {
    expect(p('ou', 'over_1.5')).toBeGreaterThan(p('ou', 'over_2.5'));
    expect(p('ou', 'over_2.5')).toBeGreaterThan(p('ou', 'over_3.5'));
  });
  it('i risultati esatti quotati stanno dentro il loro 1X2', () => {
    const esatti = esiti.filter((e) => e.market === 'exact');
    const casa = esatti.filter((e) => {
      const [c, o] = e.selection.split('-').map(Number);
      return c > o;
    });
    expect(somma(casa.map((e) => e.probability))).toBeLessThanOrEqual(p('1x2', '1') + 1e-9);
  });
  it('nella sfida equilibrata la squadra di casa è appena favorita', () => {
    expect(p('1x2', '1')).toBeGreaterThan(p('1x2', '2'));
  });
});

describe('quote', () => {
  it('sono l\'inverso della probabilità, a due decimali', () => {
    expect(quotaDaProbabilita(0.5)).toBe(2);
    expect(quotaDaProbabilita(0.25)).toBe(4);
    expect(quotaDaProbabilita(0.418)).toBe(2.39);
  });
  it('non scendono sotto 1.01 nemmeno per un esito quasi certo', () => {
    expect(quotaDaProbabilita(0.999)).toBe(1.01);
  });
  it('una probabilità nulla non si quota', () => {
    expect(() => quotaDaProbabilita(0)).toThrow();
  });
  it('il risultato esatto paga molto più dell\'1X2', () => {
    const esiti = quoteSfida({ mu: 72, sd: 9 }, { mu: 71, sd: 9 });
    const uno = esiti.find((e) => e.market === '1x2' && e.selection === '1')!;
    const esatto = esiti.filter((e) => e.market === 'exact')[0];
    expect(esatto.price).toBeGreaterThan(uno.price * 3);
  });
  it('una sfida squilibrata ha l\'1 basso e il 2 alto', () => {
    const esiti = quoteSfida({ mu: 80, sd: 9 }, { mu: 62, sd: 9 });
    const uno = esiti.find((e) => e.selection === '1')!;
    const due = esiti.find((e) => e.selection === '2')!;
    expect(uno.price).toBeLessThan(1.6);
    expect(due.price).toBeGreaterThan(6);
  });
});

describe('risoluzione dei mercati', () => {
  it('1X2', () => {
    expect(risolvi('1x2', '1', 2, 1)).toBe(true);
    expect(risolvi('1x2', 'X', 2, 2)).toBe(true);
    expect(risolvi('1x2', '2', 2, 3)).toBe(true);
    expect(risolvi('1x2', '1', 1, 1)).toBe(false);
  });
  it('over e under, con la soglia mezza per non avere pareggi', () => {
    expect(risolvi('ou', 'over_2.5', 2, 1)).toBe(true);
    expect(risolvi('ou', 'under_2.5', 2, 1)).toBe(false);
    expect(risolvi('ou', 'under_2.5', 1, 1)).toBe(true);
    expect(risolvi('ou', 'over_3.5', 2, 2)).toBe(true);
  });
  it('goal e nogoal', () => {
    expect(risolvi('gg', 'gg', 1, 1)).toBe(true);
    expect(risolvi('gg', 'gg', 3, 0)).toBe(false);
    expect(risolvi('gg', 'ng', 3, 0)).toBe(true);
    expect(risolvi('gg', 'ng', 0, 0)).toBe(true);
  });
  it('risultato esatto, e non è simmetrico', () => {
    expect(risolvi('exact', '2-1', 2, 1)).toBe(true);
    expect(risolvi('exact', '2-1', 1, 2)).toBe(false);
  });
  it('un esito scritto male si fa sentire subito', () => {
    expect(() => risolvi('1x2', 'Y', 1, 0)).toThrow();
    expect(() => risolvi('exact', 'due a uno', 2, 1)).toThrow();
  });
});

describe('punteggio', () => {
  it('giocata secca: dieci volte la quota', () => {
    expect(puntiGiocata(2.39, 1)).toBe(23.9);
  });
  it('due giocate sulla stessa sfida dimezzano il moltiplicatore', () => {
    expect(puntiGiocata(2.39, 2)).toBe(11.95);
  });
  it('tre giocate lo dividono per tre', () => {
    expect(puntiGiocata(4.5, 3)).toBe(15);
  });

  it('il valore atteso è dieci qualunque sia la strategia', () => {
    // è la proprietà che tiene in piedi il torneo: con quote eque nessuna
    // combinazione di giocate è furba, cambia solo la varianza
    const esiti = quoteSfida({ mu: 72, sd: 9 }, { mu: 71, sd: 9 });
    const q = (sel: string) => esiti.find((e) => e.market === '1x2' && e.selection === sel)!;

    const secca = q('1').probability * puntiGiocata(q('1').price, 1);
    const doppia = q('1').probability * puntiGiocata(q('1').price, 2)
      + q('X').probability * puntiGiocata(q('X').price, 2);
    const tripla = ['1', 'X', '2']
      .reduce((s, sel) => s + q(sel).probability * puntiGiocata(q(sel).price, 3), 0);

    expect(secca).toBeCloseTo(MOLTIPLICATORE, 1);
    expect(doppia).toBeCloseTo(MOLTIPLICATORE, 1);
    expect(tripla).toBeCloseTo(MOLTIPLICATORE, 1);
  });

  it('anche il risultato esatto vale dieci, in media', () => {
    const esiti = quoteSfida({ mu: 72, sd: 9 }, { mu: 71, sd: 9 });
    const e = esiti.filter((x) => x.market === 'exact')[0];
    expect(e.probability * puntiGiocata(e.price, 1)).toBeCloseTo(MOLTIPLICATORE, 1);
  });
});

describe('risoluzione di una schedina', () => {
  const giocate = [
    { fixtureId: 'f1', market: '1x2' as const, selection: '1', price: 2.39 },
    { fixtureId: 'f1', market: '1x2' as const, selection: 'X', price: 4.5 },
    { fixtureId: 'f2', market: 'gg' as const, selection: 'gg', price: 1.88 },
    { fixtureId: 'f3', market: 'exact' as const, selection: '2-1', price: 15.85 },
  ];

  it('divide il moltiplicatore solo dove ci sono più giocate', () => {
    const { giocate: r } = risolviSchedina(giocate, [
      { fixtureId: 'f1', golCasa: 1, golOspite: 1 },
      { fixtureId: 'f2', golCasa: 2, golOspite: 1 },
      { fixtureId: 'f3', golCasa: 2, golOspite: 1 },
    ]);
    expect(r[0].outcome).toBe('lost');
    expect(r[1].outcome).toBe('won');
    expect(r[1].points).toBe(22.5);     // 10/2 × 4.50
    expect(r[2].points).toBe(18.8);     // 10/1 × 1.88
    expect(r[3].points).toBe(158.5);    // il colpo grosso
  });

  it('somma i punti della giornata', () => {
    const { punti } = risolviSchedina(giocate, [
      { fixtureId: 'f1', golCasa: 1, golOspite: 1 },
      { fixtureId: 'f2', golCasa: 2, golOspite: 1 },
      { fixtureId: 'f3', golCasa: 2, golOspite: 1 },
    ]);
    expect(punti).toBe(22.5 + 18.8 + 158.5);
  });

  it('una sfida senza risultato resta in sospeso e non porta punti', () => {
    const { giocate: r, punti } = risolviSchedina(giocate, [
      { fixtureId: 'f1', golCasa: 2, golOspite: 0 },
    ]);
    expect(r.filter((g) => g.outcome === 'void')).toHaveLength(2);
    expect(punti).toBe(11.95);          // solo la vittoria interna, divisa per due
  });

  it('chi non gioca niente non prende niente, senza rompersi', () => {
    expect(risolviSchedina([], []).punti).toBe(0);
  });
});

describe('dalla rosa alla distribuzione', () => {
  const forza = { Inter: 1.8, Milan: 1.2, Lecce: -1.1, Venezia: -1.4 };

  const rosa = (club: string): GiocatoreTipster[] => [
    { playerId: 'p1', role: 'P', club, quotazione: 18 },
    { playerId: 'p2', role: 'P', club, quotazione: 5 },
    { playerId: 'd1', role: 'D', club, quotazione: 24 },
    { playerId: 'd2', role: 'D', club, quotazione: 20 },
    { playerId: 'd3', role: 'D', club, quotazione: 12 },
    { playerId: 'd4', role: 'D', club, quotazione: 3 },
    { playerId: 'c1', role: 'C', club, quotazione: 40 },
    { playerId: 'c2', role: 'C', club, quotazione: 30 },
    { playerId: 'c3', role: 'C', club, quotazione: 20 },
    { playerId: 'c4', role: 'C', club, quotazione: 10 },
    { playerId: 'a1', role: 'A', club, quotazione: 60 },
    { playerId: 'a2', role: 'A', club, quotazione: 30 },
    { playerId: 'a3', role: 'A', club, quotazione: 12 },
  ];

  it('la fantamedia attesa cresce con la quotazione e col ruolo offensivo', () => {
    expect(fantamediaAttesa('A', 60)).toBeGreaterThan(fantamediaAttesa('A', 10));
    expect(fantamediaAttesa('A', 60)).toBeGreaterThan(fantamediaAttesa('D', 25));
    expect(fantamediaAttesa('P', 1)).toBeGreaterThan(5);
    expect(fantamediaAttesa('A', 999)).toBeLessThan(9);
  });

  it('schiera undici titolari col modulo 3-4-3', () => {
    const s = stimaSquadra(rosa('Inter'), {}, { forzaClub: forza });
    expect(s.undici).toHaveLength(11);
    expect(s.undici.filter((p) => p.role === 'D')).toHaveLength(3);
    expect(s.undici.map((p) => p.playerId)).not.toContain('p2');   // il secondo portiere no
    expect(s.undici.map((p) => p.playerId)).not.toContain('d4');   // il quarto difensore no
  });

  it('salta chi non è disponibile e pesca il successivo', () => {
    const r = rosa('Inter').map((p) => p.playerId === 'a1' ? { ...p, disponibile: false } : p);
    const s = stimaSquadra(r, {}, { forzaClub: forza });
    expect(s.undici.map((p) => p.playerId)).not.toContain('a1');
    expect(s.undici.filter((p) => p.role === 'A')).toHaveLength(2);
  });

  it('un avversario forte abbassa la media, uno debole la alza', () => {
    const dura: Record<string, ContestoClub> = { Milan: { avversario: 'Inter', inCasa: false } };
    const facile: Record<string, ContestoClub> = { Milan: { avversario: 'Venezia', inCasa: true } };
    expect(stimaSquadra(rosa('Milan'), facile, { forzaClub: forza }).mu)
      .toBeGreaterThan(stimaSquadra(rosa('Milan'), dura, { forzaClub: forza }).mu);
  });

  it('col 6 politico i giocatori valgono 6 secchi e la squadra è più prevedibile', () => {
    const normale = stimaSquadra(rosa('Lecce'), { Lecce: { avversario: 'Inter', inCasa: true } }, { forzaClub: forza });
    const politico = stimaSquadra(rosa('Lecce'), { Lecce: { avversario: 'Inter', inCasa: true, seiPolitico: true } }, { forzaClub: forza });
    expect(politico.mu).toBe(66);                       // 11 × 6
    expect(politico.sd).toBeLessThan(normale.sd);
  });

  it('una rosa più forte produce quote più basse sulla sua vittoria', () => {
    const forteRosa = rosa('Inter');
    const scarsaRosa = rosa('Inter').map((p) => ({ ...p, quotazione: Math.max(1, p.quotazione / 4) }));
    const a = stimaSquadra(forteRosa, {}, { forzaClub: forza });
    const b = stimaSquadra(scarsaRosa, {}, { forzaClub: forza });
    const esiti = quoteSfida(a, b);
    const uno = esiti.find((e) => e.selection === '1')!;
    const due = esiti.find((e) => e.selection === '2')!;
    expect(uno.price).toBeLessThan(due.price);
  });

  it('la media di una squadra vera sta in un intervallo credibile', () => {
    const s = stimaSquadra(rosa('Inter'), {}, { forzaClub: forza });
    expect(s.mu).toBeGreaterThan(60);
    expect(s.mu).toBeLessThan(85);
    expect(s.sd).toBeGreaterThan(6);
    expect(s.sd).toBeLessThan(12);
  });
});

describe('forza dei club dal listone', () => {
  const listone = [
    ...Array.from({ length: 12 }, (_, i) => ({ club: 'Inter', quotazione: 40 - i })),
    ...Array.from({ length: 12 }, (_, i) => ({ club: 'Milan', quotazione: 30 - i })),
    ...Array.from({ length: 12 }, (_, i) => ({ club: 'Venezia', quotazione: 12 - i * 0.5 })),
  ];
  it('mette i club in scala, con la media a zero', () => {
    const f = forzaClub(listone);
    expect(f.Inter).toBeGreaterThan(f.Milan);
    expect(f.Milan).toBeGreaterThan(f.Venezia);
    expect((f.Inter + f.Milan + f.Venezia) / 3).toBeCloseTo(0, 6);
  });
  it('non si rompe su un listone vuoto', () => {
    expect(forzaClub([])).toEqual({});
  });
});

describe('taratura', () => {
  const rosa: GiocatoreTipster[] = [
    { playerId: 'p', role: 'P', club: 'Inter', quotazione: 18 },
    ...Array.from({ length: 3 }, (_, i) => ({ playerId: `d${i}`, role: 'D' as const, club: 'Inter', quotazione: 20 })),
    ...Array.from({ length: 4 }, (_, i) => ({ playerId: `c${i}`, role: 'C' as const, club: 'Inter', quotazione: 25 })),
    ...Array.from({ length: 3 }, (_, i) => ({ playerId: `a${i}`, role: 'A' as const, club: 'Inter', quotazione: 30 })),
  ];

  it('la correzione sposta la media senza toccare la dispersione', () => {
    const base = stimaSquadra(rosa, {});
    const spostata = stimaSquadra(rosa, {}, { correzioneMedia: -4 });
    expect(spostata.mu).toBeCloseTo(base.mu - 4, 6);
    expect(spostata.sd).toBe(base.sd);
  });

  it('abbassando la media si segna meno, e l\'Under sale', () => {
    const a = stimaSquadra(rosa, {});
    const b = stimaSquadra(rosa, {}, { correzioneMedia: -6 });
    const over = (x: typeof a) => quoteSfida(x, x).find((e) => e.selection === 'over_2.5')!.probability;
    expect(over(b)).toBeLessThan(over(a));
  });

  it('la correzione non cambia chi è favorito', () => {
    const forte = stimaSquadra(rosa, {});
    const debole = stimaSquadra(rosa.map((p) => ({ ...p, quotazione: 5 })), {});
    const senza = quoteSfida(forte, debole).find((e) => e.selection === '1')!.probability;
    const con = quoteSfida(
      { ...forte, mu: forte.mu - 5 }, { ...debole, mu: debole.mu - 5 },
    ).find((e) => e.selection === '1')!.probability;
    expect(Math.abs(senza - con)).toBeLessThan(0.06);
  });
});

describe('lavagna fissa dei risultati esatti', () => {
  const esiti = quoteSfida({ mu: 72, sd: 9 }, { mu: 71, sd: 9 });
  const esatti = esiti.filter((e) => e.market === 'exact');

  it('ci sono sempre gli stessi sedici punteggi, più «altro»', () => {
    expect(esatti.map((e) => e.selection)).toEqual([...ESATTI_FISSI, ALTRO]);
  });

  it('l\'ordine non dipende dalle quote: è quello della lavagna', () => {
    const squilibrata = quoteSfida({ mu: 82, sd: 9 }, { mu: 60, sd: 9 })
      .filter((e) => e.market === 'exact').map((e) => e.selection);
    expect(squilibrata).toEqual(esatti.map((e) => e.selection));
  });

  it('coprono tutto: le probabilità sommano a 1', () => {
    expect(somma(esatti.map((e) => e.probability))).toBeCloseTo(1, 9);
  });

  it('«altro» vince quando il risultato non è in lavagna', () => {
    expect(risolvi('exact', 'altro', 4, 1)).toBe(true);
    expect(risolvi('exact', 'altro', 2, 5)).toBe(true);
    expect(risolvi('exact', 'altro', 2, 1)).toBe(false);
    expect(risolvi('exact', 'altro', 3, 3)).toBe(false);
  });

  it('anche «altro» vale dieci punti attesi', () => {
    const a = esatti.find((e) => e.selection === ALTRO)!;
    expect(a.probability * puntiGiocata(a.price, 1)).toBeCloseTo(MOLTIPLICATORE, 1);
  });
});
