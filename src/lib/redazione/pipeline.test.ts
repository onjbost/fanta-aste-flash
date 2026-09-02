import { describe, expect, it } from 'vitest';
import { numeriLeciti, trovaSpunti, type ContestoGiornata } from './spunti';
import { ScrittoreTemplate, type RichiestaPezzo } from './scrittore';
import { montaMessaggio, verificaPezzo } from './verifica';

/**
 * La catena intera, senza database e senza modello: dai fatti di una giornata
 * vera agli spunti, dagli spunti al pezzo, dal pezzo al messaggio verificato.
 *
 * I numeri sono quelli della giornata 1 di Fanta Mansarda 2ed, letti dalla
 * lega. Se questo test passa, i pezzi si incastrano davvero.
 */

function sq(nome: string, teamId: string, gol: number, fp: number, giocatori: [string, number | null][] = []) {
  return {
    teamId, nome, soprannomi: [], gol, fantapunti: fp, modulo: '4-3-3',
    modificatore: 0, bonusCapitano: 0,
    inviataIl: '2026-08-28T18:04:23.000Z', chiusuraIl: '2026-08-29T13:00:00.000Z',
    giocatori: giocatori.map(([n, fv], i) => ({
      nome: n, ruolo: 'C' as const, voto: fv, fantavoto: fv,
      titolare: true, entered: false, isCaptain: i === 0, counted: fv != null,
      bonus: {}, prezzoAsta: null, daAstaFlash: false,
    })),
  };
}

const contesto: ContestoGiornata = {
  fanta: 1, serieA: 2,
  sfide: [
    {
      fixtureId: 'f1', competizione: 'campionato',
      casa: sq('Pirati dei Caracoli', 'pirati', 0, 63.5, [['Kolo Muani', 6], ['Bowie', 5.5]]),
      ospite: sq('FC Joga Benito', 'joga', 1, 69, [['Dybala', 7], ['Douvikas', 10.5]]),
    },
    {
      fixtureId: 'f2', competizione: 'campionato',
      casa: sq('FC NTONIA', 'ntonia', 3, 78.5, [['Uno', 8]]),
      ospite: sq('Borussia Alecchiomund', 'borussia', 2, 72, [['Due', 7]]),
    },
    {
      fixtureId: 'f3', competizione: 'campionato',
      casa: sq('Montester United', 'montester', 1, 70.5, [['Tre', 6]]),
      ospite: sq('Qarabaggio', 'qarabaggio', 2, 77, [['Quattro', 9]]),
    },
    {
      fixtureId: 'f4', competizione: 'campionato',
      casa: sq('DEPORTIVO APERITIVO', 'deportivo', 2, 74.5, [['Cinque', 6.5]]),
      ospite: sq('FC CANEPARDO', 'canepardo', 1, 71, [['Sei', 6]]),
    },
  ],
  precedenti: [],
  classificaPrima: [],
  classificaDopo: [
    { teamId: 'ntonia', nome: 'FC NTONIA', punti: 3, posizione: 1 },
    { teamId: 'joga', nome: 'FC Joga Benito', punti: 3, posizione: 2 },
    { teamId: 'qarabaggio', nome: 'Qarabaggio', punti: 3, posizione: 3 },
    { teamId: 'deportivo', nome: 'DEPORTIVO APERITIVO', punti: 3, posizione: 4 },
    { teamId: 'canepardo', nome: 'FC CANEPARDO', punti: 0, posizione: 5 },
    { teamId: 'montester', nome: 'Montester United', punti: 0, posizione: 6 },
    { teamId: 'borussia', nome: 'Borussia Alecchiomund', punti: 0, posizione: 7 },
    { teamId: 'pirati', nome: 'Pirati dei Caracoli', punti: 0, posizione: 8 },
  ],
  tipster: [
    { teamId: 'montester', nome: 'Montester United', punti: 23.9, giocate: 4, azzeccate: 1, esatti: 0, controSeStesso: null },
  ],
};

function richiestaDa(ctx: ContestoGiornata, minParole = 10): RichiestaPezzo {
  return {
    giornata: ctx.fanta, serieA: ctx.serieA, tono: 4, minParole, paroleVietate: [],
    squadre: ctx.sfide.flatMap((s) => [s.casa, s.ospite]).map((t) => ({
      nome: t.nome, allenatore: null, soprannomi: [], tormentoni: null,
      puntiDeboli: null, intoccabile: null,
    })),
    sfide: ctx.sfide.map((s) => ({
      fixtureId: s.fixtureId, casa: s.casa.nome, ospite: s.ospite.nome,
      golCasa: s.casa.gol, golOspite: s.ospite.gol,
      fpCasa: s.casa.fantapunti, fpOspite: s.ospite.fantapunti,
      moduloCasa: s.casa.modulo, moduloOspite: s.ospite.modulo,
      competizione: s.competizione,
    })),
    spunti: trovaSpunti(ctx),
    classifica: ctx.classificaDopo,
    tipster: ctx.tipster,
  };
}

describe('la catena intera, sulla giornata 1 vera', () => {
  const spunti = trovaSpunti(contesto);

  it('trova qualcosa da dire su questa giornata', () => {
    expect(spunti.length).toBeGreaterThan(0);
  });

  it('vede che Qarabaggio ha vinto pur essendo in trasferta con più fantapunti di Montester', () => {
    const s = spunti.find((x) => x.codice === 'vittoria_misura' && x.fixtureId === 'f3');
    // 77 contro 70,5: non è di misura, e non deve inventarselo
    expect(s).toBeUndefined();
  });

  it('nota che FC NTONIA ha il punteggio più alto e ha vinto: nessun record amaro', () => {
    expect(spunti.some((x) => x.codice === 'sconfitta_col_record')).toBe(false);
  });

  it('i template producono un pezzo per ognuna delle quattro sfide', async () => {
    const r = richiestaDa(contesto);
    const pezzo = await new ScrittoreTemplate().scrivi(r);
    expect(pezzo.sfide).toHaveLength(4);
    expect(new Set(pezzo.sfide.map((s) => s.fixtureId))).toEqual(new Set(['f1', 'f2', 'f3', 'f4']));
  });

  it('e il pezzo dei template passa la verifica: non inventa numeri', async () => {
    const r = richiestaDa(contesto);
    const pezzo = await new ScrittoreTemplate().scrivi(r);
    const e = verificaPezzo(pezzo, r, numeriLeciti(contesto, r.spunti));
    expect(e.inventati).toEqual([]);
  });

  it('il messaggio finale contiene tutte le sfide e i due blocchi finali', async () => {
    const r = richiestaDa(contesto);
    const pezzo = await new ScrittoreTemplate().scrivi(r);
    const m = montaMessaggio(pezzo, r);

    expect(m).toContain('GIORNATA 1');
    for (const s of r.sfide) expect(m).toContain(`${s.casa} ${s.golCasa}-${s.golOspite} ${s.ospite}`);
    expect(m).toContain('LA CLASSIFICA');
    expect(m).toContain('TORNEO DEI TIPSTER');
  });

  it('la verifica boccia il pezzo se una sfida è più corta del minimo', async () => {
    const r = richiestaDa(contesto, 150);   // i template non arrivano a 150 parole
    const pezzo = await new ScrittoreTemplate().scrivi(r);
    const e = verificaPezzo(pezzo, r, numeriLeciti(contesto, r.spunti));
    expect(e.ok).toBe(false);
    expect(e.problemi.some((p) => p.includes('parole invece di 150'))).toBe(true);
  });
});
