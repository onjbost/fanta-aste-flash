import { describe, expect, it } from 'vitest';
import {
  COLORI, coperturaFoto, dataEstesa, disposizioneFoto, faseDiCoppa, fuocoValido,
  numeroEdizione, paroleDelCappello, type FotoPrima,
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

describe('coperturaFoto', () => {
  const riquadro = { larghezza: 782, altezza: 436 };

  it('copre il riquadro: nessun lato resta scoperto', () => {
    for (const foto of [
      { larghezza: 1100, altezza: 733 }, { larghezza: 600, altezza: 900 },
      { larghezza: 4903, altezza: 3163 }, { larghezza: 100, altezza: 100 },
    ]) {
      const [w, h] = coperturaFoto(foto, riquadro).dimensione
        .split(' ').map((v) => parseFloat(v));
      expect(w).toBeGreaterThanOrEqual(riquadro.larghezza);
      expect(h).toBeGreaterThanOrEqual(riquadro.altezza);
    }
  });

  it('mantiene le proporzioni: una foto storta è peggio di nessuna foto', () => {
    const [w, h] = coperturaFoto({ larghezza: 1100, altezza: 733 }, riquadro).dimensione
      .split(' ').map((v) => parseFloat(v));
    expect(w / h).toBeCloseTo(1100 / 733, 2);
  });

  it('centra in orizzontale', () => {
    const c = coperturaFoto({ larghezza: 2000, altezza: 500 }, riquadro);
    const [w] = c.dimensione.split(' ').map((v) => parseFloat(v));
    const [x] = c.posizione.split(' ').map((v) => parseFloat(v));
    expect(x).toBe(Math.round((riquadro.larghezza - w) / 2));
  });

  it('il fuoco orizzontale sposta senza mai scoprire un bordo', () => {
    /*
     * La proprietà che conta: comunque si sposti, la foto continua a
     * coprire il riquadro. Non c'è un ritaglio da fare dopo — lo
     * spostamento è una frazione dello scarto, e lo scarto è negativo
     * perché l'ingrandimento copre sempre.
     */
    const foto = { larghezza: 2000, altezza: 500 };
    for (const fuocoX of [0, 25, 50, 75, 100]) {
      const c = coperturaFoto({ ...foto, fuocoX }, riquadro);
      const [w] = c.dimensione.split(' ').map((v) => parseFloat(v));
      const [x] = c.posizione.split(' ').map((v) => parseFloat(v));
      expect(x).toBeLessThanOrEqual(0);                      // niente bordo a sinistra
      expect(x + w).toBeGreaterThanOrEqual(riquadro.larghezza); // niente bordo a destra
    }
  });

  it('agli estremi il bordo della foto tocca quello del riquadro', () => {
    const foto = { larghezza: 2000, altezza: 500 };
    const sinistra = coperturaFoto({ ...foto, fuocoX: 0 }, riquadro);
    const destra = coperturaFoto({ ...foto, fuocoX: 100 }, riquadro);
    const [w] = sinistra.dimensione.split(' ').map((v) => parseFloat(v));
    expect(parseFloat(sinistra.posizione.split(' ')[0])).toBe(0);
    expect(parseFloat(destra.posizione.split(' ')[0])).toBe(riquadro.larghezza - w);
  });

  it('senza fuoco orizzontale resta centrata, come prima che esistesse', () => {
    const c = coperturaFoto({ larghezza: 2000, altezza: 500 }, riquadro);
    const [w] = c.dimensione.split(' ').map((v) => parseFloat(v));
    expect(parseFloat(c.posizione.split(' ')[0])).toBe(Math.round((riquadro.larghezza - w) / 2));
  });

  it('il fuoco muove il taglio in verticale, e solo lì', () => {
    const foto = { larghezza: 600, altezza: 900 };
    const cima = coperturaFoto({ ...foto, fuoco: 0 }, riquadro);
    const fondo = coperturaFoto({ ...foto, fuoco: 100 }, riquadro);
    expect(cima.dimensione).toBe(fondo.dimensione);
    expect(parseFloat(cima.posizione.split(' ')[1])).toBe(0);
    expect(parseFloat(fondo.posizione.split(' ')[1])).toBeLessThan(0);
  });

  it('scrive tutto in pixel: le percentuali i due motori le leggono diverse', () => {
    const c = coperturaFoto({ larghezza: 1100, altezza: 733 }, riquadro);
    expect(c.dimensione).toMatch(/^\d+px \d+px$/);
    expect(c.posizione).toMatch(/^-?\d+px -?\d+px$/);
  });

  it('misure impossibili non producono NaN', () => {
    const c = coperturaFoto({ larghezza: 0, altezza: 0 }, riquadro);
    expect(c.dimensione).not.toContain('NaN');
    expect(c.posizione).not.toContain('NaN');
  });
});

describe('faseDiCoppa', () => {
  it('legge la fase dal numero di partite, che è l\'unica cosa che la dice', () => {
    // otto squadre in due gironi fanno quattro partite a turno; le
    // semifinali due; la finale una. Sono le giornate vere della lega:
    // gironi a fanta 2-5-8-11-14-17, semifinali a 23 e 29, finale a 37
    expect(faseDiCoppa(4)).toBe('gironi');
    expect(faseDiCoppa(2)).toBe('semifinali');
    expect(faseDiCoppa(1)).toBe('finale');
  });

  it('più di quattro partite restano fase a gironi', () => {
    expect(faseDiCoppa(6)).toBe('gironi');
  });
});

describe('numeroEdizione', () => {
  it('per la coppa numera i turni di coppa, non le giornate di campionato', () => {
    expect(numeroEdizione('coppa', 3, 'gironi')).toBe('COPPA · GIORNATA 3');
  });

  it('dalle semifinali il numero lascia il posto al turno', () => {
    expect(numeroEdizione('coppa', 7, 'semifinali')).toBe('COPPA · SEMIFINALI');
    expect(numeroEdizione('coppa', 8, 'finale')).toBe('COPPA · FINALE');
  });

  it('le altre edizioni non cambiano', () => {
    expect(numeroEdizione('settimanale', 4)).toBe('N. 4');
    expect(numeroEdizione('fantamercato', 2)).toBe('MERCATO N. 2');
  });
});

describe('l\'oro della coppa', () => {
  it('si legge sul rosa, al contrario del giallo del gancio', () => {
    // il giallo vive su fondo scuro: sul rosa misura 1.25:1, cioè niente.
    // Questa non è un'opinione, è la formula del contrasto WCAG
    const lum = (h: string) => {
      const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const contrasto = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    expect(contrasto(COLORI.oro, COLORI.rosa)).toBeGreaterThan(3);
    expect(contrasto(COLORI.giallo, COLORI.rosa)).toBeLessThan(2);
  });
});
