import { describe, it, expect } from 'vitest';
import {
  cifraDiRilancio, consumoDelTimer, lineaDelleFasi, rilancioMinimo, scadenzaDellaFase, scorciatoie,
} from './asta';

/**
 * L'Asta ridisegnata: la linea delle fasi, la scadenza in grande e il
 * pannello di rilancio della sala. I componenti disegnano, le regole stanno qui.
 */

describe('la linea delle fasi', () => {
  it('segna fatte le tappe passate e accende quella di adesso', () => {
    expect(lineaDelleFasi('calls_closed').map((f) => f.stato))
      .toEqual(['fatta', 'adesso', 'dopo', 'dopo']);
  });

  it('un\'asta in programma ha tutte le tappe davanti', () => {
    expect(lineaDelleFasi('scheduled').every((f) => f.stato === 'dopo')).toBe(true);
  });

  it('un\'asta chiusa le ha tutte dietro', () => {
    expect(lineaDelleFasi('closed').every((f) => f.stato === 'fatta')).toBe(true);
  });
});

describe('la scadenza in grande', () => {
  const date = {
    chiamate: new Date('2026-10-05T19:30:00Z'),
    adesioni: new Date('2026-10-09T19:30:00Z'),
    asta: new Date('2026-10-10T19:30:00Z'),
  };

  it('a chiamate aperte conta la chiusura delle chiamate', () => {
    expect(scadenzaDellaFase('calls_open', date)?.quando).toBe(date.chiamate);
  });

  it('dopo le chiamate conta la chiusura delle adesioni, poi l\'asta', () => {
    expect(scadenzaDellaFase('calls_closed', date)?.quando).toBe(date.adesioni);
    expect(scadenzaDellaFase('joins_closed', date)?.quando).toBe(date.asta);
  });

  it('in sala non c\'è più niente da contare', () => {
    expect(scadenzaDellaFase('live', date)).toBeNull();
  });
});

describe('la cifra del rilancio', () => {
  it('sul lotto senza offerte il minimo è 1, poi un credito sopra', () => {
    expect(rilancioMinimo(null)).toBe(1);
    expect(rilancioMinimo(14)).toBe(15);
  });

  it('senza scelta propone il minimo', () => {
    expect(cifraDiRilancio(null, 15)).toBe(15);
  });

  it('se il minimo sale oltre la cifra scelta, si riallinea al minimo', () => {
    expect(cifraDiRilancio(14, 16)).toBe(16);
  });

  it('una cifra scelta più alta del minimo resta quella', () => {
    expect(cifraDiRilancio(20, 16)).toBe(20);
  });

  it('le scorciatoie sommano all\'offerta, o partono da zero', () => {
    expect(scorciatoie(12).map((s) => s.cifra)).toEqual([13, 17, 22]);
    expect(scorciatoie(null).map((s) => s.cifra)).toEqual([1, 5, 10]);
  });
});

describe('l\'anello del timer', () => {
  const fine = '2026-10-10T19:30:10.000Z';
  const t = (s: number) => new Date('2026-10-10T19:30:00.000Z').getTime() + s * 1000;

  it('è pieno appena il timer riparte e vuoto alla fine', () => {
    expect(consumoDelTimer(fine, t(0), 10)).toBe(0);
    expect(consumoDelTimer(fine, t(5), 10)).toBeCloseTo(0.5);
    expect(consumoDelTimer(fine, t(12), 10)).toBe(1);
  });

  it('senza countdown acceso non consuma niente', () => {
    expect(consumoDelTimer(null, t(3), 10)).toBe(0);
  });
});
