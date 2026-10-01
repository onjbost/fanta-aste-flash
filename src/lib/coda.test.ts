import { describe, expect, it } from 'vitest';
import { rigaDellaCoda, testoDellaCoda, totaleDellaCoda, type VoceDellaCoda } from './coda';

const voce = (p: Partial<VoceDellaCoda> & { lottoId: string }): VoceDellaCoda => ({
  squadra: 'FC Joga Benito',
  prende: { nome: 'COULIBALY L.', ruolo: 'C', club: 'Lecce' },
  svincola: { nome: 'ZALEWSKI', ruolo: 'C' },
  prezzo: 1,
  ...p,
});

/*
 * I dati sono quelli veri della prima asta: quattro lotti senza contendenti,
 * due del Joga Benito e uno a testa per NTONIA e Pirati.
 */
const veri: VoceDellaCoda[] = [
  voce({ lottoId: 'l1' }),
  voce({
    lottoId: 'l2', prende: { nome: 'CAMBIAGHI', ruolo: 'C', club: 'Bologna' },
    svincola: { nome: 'GAETANO', ruolo: 'C' }, prezzo: 3,
  }),
  voce({
    lottoId: 'l3', squadra: 'FC NTONIA',
    prende: { nome: 'OSMAJIC', ruolo: 'A', club: 'Genoa' },
    svincola: { nome: 'BOGA', ruolo: 'A' },
  }),
  voce({
    lottoId: 'l4', squadra: 'Pirati dei Caracoli',
    prende: { nome: 'CISSÈ A.', ruolo: 'C', club: 'Milan' },
    svincola: { nome: 'JASHARI', ruolo: 'C' },
  }),
];

describe('rigaDellaCoda', () => {
  it('dice chi esce e chi entra, in quest\'ordine', () => {
    // prima lo svincolo: su Leghe Fantacalcio è il movimento da fare per
    // primo, altrimenti la rosa è di un giocatore troppo lunga
    expect(rigaDellaCoda(voce({ lottoId: 'x' })))
      .toBe('FC Joga Benito: svincola ZALEWSKI (C) → prende COULIBALY L. (C, Lecce) per 1');
  });

  it('se lo svincolando manca lo dice invece di tacere', () => {
    const r = rigaDellaCoda(voce({ lottoId: 'x', svincola: null }));
    expect(r).toContain('svincolando mancante');
    expect(r).toContain('COULIBALY L.');
  });
});

describe('testoDellaCoda', () => {
  it('raggruppa per squadra: si lavora una rosa per volta', () => {
    const t = testoDellaCoda(veri);
    const righe = t.split('\n');
    expect(righe[0]).toBe('FC Joga Benito');
    // le due del Joga Benito sono attaccate, non sparse
    expect(righe[1]).toContain('ZALEWSKI');
    expect(righe[2]).toContain('GAETANO');
    expect(t.indexOf('FC NTONIA')).toBeGreaterThan(t.indexOf('GAETANO'));
  });

  it('le squadre in ordine alfabetico, non in quello in cui arrivano i lotti', () => {
    // apposta all'incontrario: se l'ordine fosse quello dei lotti, questo
    // elenco uscirebbe con i Pirati in cima
    const alrovescio = [veri[3], veri[2], veri[1], veri[0]];
    const squadre = testoDellaCoda(alrovescio).split('\n').filter((r) => r && !r.startsWith(' '));
    expect(squadre).toEqual(['FC Joga Benito', 'FC NTONIA', 'Pirati dei Caracoli']);
  });

  it('e una coda vuota lo dice, invece di dare un foglio bianco', () => {
    expect(testoDellaCoda([])).toBe('Nessun lotto da assegnare senza asta.');
  });
});

describe('totaleDellaCoda', () => {
  it('somma quello che esce davvero dalle casse', () => {
    expect(totaleDellaCoda(veri)).toBe(6);
    expect(totaleDellaCoda([])).toBe(0);
  });
});
