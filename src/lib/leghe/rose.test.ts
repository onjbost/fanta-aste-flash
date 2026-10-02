import { describe, expect, it } from 'vitest';
import { MINIMO_LISTONE, traduciListoneERose, type GiocatoreApi } from './rose';

const nostri = [
  { extId: '5585', name: 'MALEN', role: 'A' as const, club: 'Roma', quotation: 38, outOfList: false },
  { extId: '254', name: 'DIMARCO', role: 'D' as const, club: 'Inter', quotation: 31, outOfList: false },
  { extId: '999', name: 'VECCHIO', role: 'C' as const, club: 'Lecce', quotation: 1, outOfList: true },
];

// un listone abbastanza lungo da passare il controllo, con tre giocatori veri in testa
function pool(extra: GiocatoreApi[] = []): { players: GiocatoreApi[] } {
  const riempitivo = Array.from({ length: MINIMO_LISTONE }, (_, i) => ({
    id: 100000 + i, name: `Riserva ${i}`, stnme: 'GEN', quotd: 1, fcrle: 3,
  }));
  return {
    players: [
      { id: 5585, name: 'Malen', stnme: 'ROM', quotd: 37, fcrle: 4 },
      { id: 254, name: 'Dimarco', stnme: 'INT', quotd: '30', fcrle: 2 },
      { id: 999, name: 'Vecchio', stnme: 'LEC', quotd: 1, fcrle: 3 },
      ...extra,
      ...riempitivo,
    ],
  };
}

const squadre = ['Montester United', 'FC NTONIA'];

describe('traduciListoneERose', () => {
  it('traduce il listone nella forma dell\'export: nome maiuscolo, club per esteso, ruolo e quotazione', () => {
    const t = traduciListoneERose(pool(), [], nostri, squadre);
    const malen = t.giocatori.find((g) => g.extId === '5585')!;
    expect(malen).toMatchObject({ name: 'MALEN', club: 'Roma', role: 'A', quotation: 37, teamName: null, price: null });
    expect(t.giocatori.find((g) => g.extId === '254')).toMatchObject({ club: 'Inter', role: 'D', quotation: 30 });
    expect(t.problemi).toEqual([]);
  });

  it('il «fuori lista» resta quello che abbiamo, la lega non lo dice', () => {
    const t = traduciListoneERose(pool(), [], nostri, squadre);
    expect(t.giocatori.find((g) => g.extId === '999')!.outOfList).toBe(true);
  });

  it('appaia `cal` e `cs` per posizione e aggancia le squadre senza badare alle maiuscole', () => {
    const t = traduciListoneERose(pool(), [
      { id: 1, n: 'MONTESTER UNITED', cal: '5585;254', cs: '120;45' },
      { id: 2, n: 'fc ntonia', cal: '', cs: '' },
    ], nostri, squadre);
    expect(t.giocatori.find((g) => g.extId === '5585')).toMatchObject({ teamName: 'Montester United', price: 120 });
    expect(t.giocatori.find((g) => g.extId === '254')).toMatchObject({ teamName: 'Montester United', price: 45 });
    expect(t.conRosa).toBe(1);
    expect(t.squadreSconosciute).toEqual([]);
  });

  it('una rosa con più giocatori che prezzi non si legge: un prezzo al giocatore sbagliato è peggio di niente', () => {
    const t = traduciListoneERose(pool(), [{ id: 1, n: 'Montester United', cal: '5585;254', cs: '120' }], nostri, squadre);
    expect(t.problemi.some((p) => p.includes('rosa non leggibile'))).toBe(true);
    expect(t.giocatori.find((g) => g.extId === '5585')!.teamName).toBeNull();
  });

  it('dice le squadre della lega che da noi non ci sono', () => {
    const t = traduciListoneERose(pool(), [{ id: 3, n: 'Squadra Nuova', cal: '5585', cs: '10' }], nostri, squadre);
    expect(t.squadreSconosciute).toEqual(['Squadra Nuova']);
  });

  it('un listone troppo corto è una risposta monca, e lo dice', () => {
    const t = traduciListoneERose({ players: [{ id: 1, name: 'Solo', stnme: 'ROM', quotd: 1, fcrle: 1 }] }, [], nostri, squadre);
    expect(t.problemi.some((p) => p.includes('solo 1 giocatori'))).toBe(true);
  });

  it('senza `fcrle` prende il ruolo che sappiamo già', () => {
    const t = traduciListoneERose(pool([{ id: 777, name: 'Nuovo', stnme: 'NAP', quotd: 5 }]), [], nostri, squadre,
      new Map([['777', { ruolo: 'C' as const }]]));
    expect(t.giocatori.find((g) => g.extId === '777')).toMatchObject({ role: 'C', name: 'NUOVO' });
  });
});
