import { describe, expect, it } from 'vitest';
import {
  dataEstesa, disposizioneFoto, fuocoValido, numeroEdizione, paroleDelCappello,
  type FotoPrima,
} from './prima';

const foto = (larghezza: number, altezza: number): FotoPrima =>
  ({ src: 'x', larghezza, altezza, provenienza: '', fuoco: 35 });

describe('disposizioneFoto', () => {
  it('le foto degli articoli di fantacalcio.it fanno da sfondo', () => {
    // sono orizzontali: 1200×675, 1100×733
    expect(disposizioneFoto(foto(1200, 675))).toBe('sfondo');
    expect(disposizioneFoto(foto(1100, 733))).toBe('sfondo');
  });

  it('una card verticale va affiancata al testo', () => {
    expect(disposizioneFoto(foto(600, 900))).toBe('affianco');
  });

  it('una quasi quadrata va nel riquadro', () => {
    expect(disposizioneFoto(foto(800, 800))).toBe('riquadro');
    expect(disposizioneFoto(foto(900, 800))).toBe('riquadro');
  });

  it('16:9 e 16:10 si comportano uguale: la pagina non cambia per due pixel', () => {
    expect(disposizioneFoto(foto(1600, 900))).toBe(disposizioneFoto(foto(1600, 1000)));
  });

  it('senza foto, o con misure impossibili, lo dice invece di indovinare', () => {
    expect(disposizioneFoto(null)).toBe('senzaFoto');
    expect(disposizioneFoto(foto(0, 500))).toBe('senzaFoto');
    expect(disposizioneFoto(foto(500, -1))).toBe('senzaFoto');
  });
});

describe('paroleDelCappello', () => {
  it('lascia più spazio quando la foto è sfondo e meno quando è affiancata', () => {
    expect(paroleDelCappello('sfondo').max).toBeGreaterThan(paroleDelCappello('affianco').max);
  });
  it('ogni disposizione ha una finestra sensata, mai vuota', () => {
    for (const d of ['sfondo', 'affianco', 'riquadro', 'senzaFoto'] as const) {
      const p = paroleDelCappello(d);
      expect(p.min).toBeGreaterThan(0);
      expect(p.max).toBeGreaterThan(p.min);
    }
  });
});

describe('fuocoValido', () => {
  it('tiene il valore dentro i limiti invece di far uscire la foto dal riquadro', () => {
    expect(fuocoValido(-30)).toBe(0);
    expect(fuocoValido(180)).toBe(100);
    expect(fuocoValido(42)).toBe(42);
  });
  it('senza valore sceglie un fuoco alto, dove di solito sta la faccia', () => {
    expect(fuocoValido(undefined)).toBe(35);
    expect(fuocoValido(NaN)).toBe(35);
  });
});

describe('numeroEdizione', () => {
  it('distingue la giornata dalla sessione d\'asta', () => {
    expect(numeroEdizione('settimanale', 3)).toBe('N. 3');
    expect(numeroEdizione('fantamercato', 3)).toBe('MERCATO N. 3');
  });
});

describe('dataEstesa', () => {
  it('scrive la data come un giornale', () => {
    expect(dataEstesa(new Date('2026-09-28T00:00:00Z'))).toBe('28 SETTEMBRE 2026');
    expect(dataEstesa(new Date('2027-01-05T00:00:00Z'))).toBe('5 GENNAIO 2027');
  });
});
