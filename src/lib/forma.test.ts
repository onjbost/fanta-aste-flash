import { describe, expect, it } from 'vitest';
import { fantavotoConForma, fondiVoti, formaGiocatore, giudizioForma } from './forma';

const coperte = [1, 2, 3, 4, 5, 6];

describe('formaGiocatore', () => {
  it('guarda solo le giornate prima di quella da giocare', () => {
    const f = formaGiocatore([
      { giornata: 5, voto: 6, fantavoto: 6 },
      { giornata: 6, voto: 9, fantavoto: 15 },
    ], 6, coperte);
    expect(f.fantamedia).toBe(6);
    expect(f.presenze).toBe(1);
  });

  it("l'ultima giornata pesa più delle prime", () => {
    const f = formaGiocatore([
      { giornata: 2, voto: 6, fantavoto: 6 },
      { giornata: 5, voto: 7, fantavoto: 10 },
    ], 6, coperte);
    expect(f.fantamedia!).toBeGreaterThan(8);
  });

  it('chi non prende voto nelle giornate coperte perde titolarità', () => {
    const f = formaGiocatore([{ giornata: 5, voto: 6, fantavoto: 6 }], 6, coperte);
    expect(f.titolarita).toBe(0.2);
    expect(f.ultimi).toEqual([null, null, null, null, 6]);
  });

  it('con poche giornate coperte la titolarità non si dice', () => {
    expect(formaGiocatore([{ giornata: 1, voto: 6, fantavoto: 6 }], 2, [1]).titolarita).toBeNull();
  });

  it('senza voti non inventa una media', () => {
    expect(formaGiocatore([], 6, coperte)).toMatchObject({ fantamedia: null, peso: 0 });
  });
});

describe('fantavotoConForma', () => {
  it('senza forma resta la stima da quotazione', () => {
    expect(fantavotoConForma(6.5, null)).toBe(6.5);
  });

  it('una sola giornata sposta poco, cinque spostano molto', () => {
    const una = fantavotoConForma(6, { fantamedia: 10, peso: 1 });
    const cinque = fantavotoConForma(6, { fantamedia: 10, peso: 5 });
    expect(una).toBe(7);
    expect(cinque).toBeGreaterThan(8);
    expect(cinque).toBeLessThan(10);
  });
});

describe('fondiVoti', () => {
  it('per chi è stato schierato vince il fantavoto della lega', () => {
    const v = fondiVoti(
      [{ giornata: 5, voto: 7, fantavoto: 10 }, { giornata: 4, voto: 6, fantavoto: 6 }],
      [{ giornata: 5, voto: 7, fantavoto: 11 }],
    );
    expect(v).toEqual([
      { giornata: 4, voto: 6, fantavoto: 6 },
      { giornata: 5, voto: 7, fantavoto: 11 },
    ]);
  });

  it('un senza voto della lega non cancella un voto delle pagelle', () => {
    const v = fondiVoti([{ giornata: 5, voto: 6, fantavoto: 6 }], [{ giornata: 5, voto: null, fantavoto: null }]);
    expect(v[0].fantavoto).toBe(6);
  });
});

describe('giudizioForma', () => {
  it('serve almeno due presenze per dire qualcosa', () => {
    expect(giudizioForma({ fantamedia: 12, presenze: 1 }, 6)).toBeNull();
    expect(giudizioForma({ fantamedia: 8, presenze: 3 }, 6)).toBe('su');
    expect(giudizioForma({ fantamedia: 5, presenze: 3 }, 6)).toBe('giu');
  });
});
