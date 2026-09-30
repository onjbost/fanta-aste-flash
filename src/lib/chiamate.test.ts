import { describe, expect, it } from 'vitest';
import {
  avvisoDiAdesione, chiamatoDa, daMostrare, esitoDellaScelta, type Chiamata,
  chiamateDaiLotti,
} from './chiamate';

const TAVARES = { id: 'p1', name: 'TAVARES N.' };
const KEAN = { id: 'p2', name: 'KEAN' };

const chiamate: Chiamata[] = [
  { playerId: 'p1', squadra: 'Real Mansarda', partecipo: false },
  { playerId: 'p3', squadra: 'Gattuccio FC', partecipo: true },
];

describe('esitoDellaScelta', () => {
  it('senza giocatore scelto non avvisa niente', () => {
    expect(esitoDellaScelta(undefined, chiamate)).toEqual({ tipo: 'chiamata' });
    expect(esitoDellaScelta(null, chiamate)).toEqual({ tipo: 'chiamata' });
  });

  it('un giocatore libero resta una chiamata', () => {
    expect(esitoDellaScelta(KEAN, chiamate)).toEqual({ tipo: 'chiamata' });
  });

  it('un giocatore chiamato da un altro diventa un\'adesione, col nome della squadra', () => {
    const e = esitoDellaScelta(TAVARES, chiamate);
    expect(e.tipo).toBe('adesione');
    if (e.tipo !== 'adesione') throw new Error('mai');
    expect(e.squadra).toBe('Real Mansarda');
    expect(e.avviso).toBe('TAVARES N. è stato già chiamato da Real Mansarda. Conferma per aderire all\'asta.');
  });

  it('un lotto in cui sono già dentro non è né chiamata né adesione', () => {
    const e = esitoDellaScelta({ id: 'p3', name: 'LOOKMAN' }, chiamate);
    expect(e.tipo).toBe('dentro');
    if (e.tipo !== 'dentro') throw new Error('mai');
    expect(e.avviso).toContain('Sei già dentro il lotto di LOOKMAN');
  });

  it('l\'avviso nomina prima il giocatore e poi la squadra', () => {
    expect(avvisoDiAdesione('X', 'Y')).toBe('X è stato già chiamato da Y. Conferma per aderire all\'asta.');
  });

  it('senza lotti aperti tutto è una chiamata', () => {
    expect(esitoDellaScelta(TAVARES, [])).toEqual({ tipo: 'chiamata' });
  });
});

describe('daMostrare', () => {
  it('toglie solo i giocatori dei lotti in cui sono già dentro', () => {
    const lista = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    expect(daMostrare(lista, chiamate).map((g) => g.id)).toEqual(['p1', 'p2']);
  });

  it('senza lotti aperti non toglie niente', () => {
    const lista = [{ id: 'p1' }, { id: 'p2' }];
    expect(daMostrare(lista, [])).toHaveLength(2);
  });
});

describe('chiamatoDa', () => {
  it('dice la squadra che ha chiamato', () => {
    expect(chiamatoDa('p1', chiamate)).toBe('Real Mansarda');
  });
  it('e niente se il giocatore è libero', () => {
    expect(chiamatoDa('p2', chiamate)).toBeNull();
  });
});

describe('chiamateDaiLotti', () => {
  // le righe hanno la forma che arriva davvero da /asta: i lotti annullati
  // non ci sono, la squadra è annidata nella join
  const lotti = [
    { id: 'l4', player_id: 'osmajic', teams: { name: 'FC NTONIA' } },
    { id: 'l5', player_id: 'romano', teams: { name: 'FC NTONIA' } },
    { id: 'l7', player_id: 'cambiaghi', teams: { name: 'FC Joga Benito' } },
  ];

  it('segna «partecipo» solo sui lotti in cui sono dentro', () => {
    expect(chiamateDaiLotti(lotti, ['l5'])).toEqual([
      { playerId: 'osmajic', squadra: 'FC NTONIA', partecipo: false },
      { playerId: 'romano', squadra: 'FC NTONIA', partecipo: true },
      { playerId: 'cambiaghi', squadra: 'FC Joga Benito', partecipo: false },
    ]);
  });

  it('senza mie partecipazioni sono tutti da avvisare', () => {
    expect(chiamateDaiLotti(lotti, []).every((c) => !c.partecipo)).toBe(true);
  });

  it('una join vuota non fa saltare niente', () => {
    expect(chiamateDaiLotti([{ id: 'l9', player_id: 'x', teams: null }], [])[0].squadra).toBe('?');
  });

  it('il giro completo: scelgo ROMANO e mi dice chi l\'ha chiamato', () => {
    const c = chiamateDaiLotti(lotti, []);
    const e = esitoDellaScelta({ id: 'romano', name: 'ROMANO' }, c);
    expect(e.tipo).toBe('adesione');
    if (e.tipo !== 'adesione') throw new Error('mai');
    expect(e.avviso).toBe('ROMANO è stato già chiamato da FC NTONIA. Conferma per aderire all\'asta.');
  });
});
