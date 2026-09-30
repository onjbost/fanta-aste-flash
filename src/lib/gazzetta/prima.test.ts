import { describe, expect, it } from 'vitest';
import {
  COLORI, ZOOM_MASSIMO, ZOOM_MINIMO, coperturaFoto, dataEstesa, disposizioneFoto,
  faseDiCoppa, fuocoValido, numeroEdizione, paroleDelCappello, righeDelTesto,
  riquadroDellaFoto, spazioDiManovra, zoomPerSpostarsi, zoomValido,
  allaColonna, alRiquadro, colonnaLibera, spostaVoce,
  type DatiPrima, type FotoPrima,
} from './prima';

/** dimensione e posizione in numeri, come le legge il CSS della pagina */
function misure(c: { dimensione: string; posizione: string }) {
  const [w, h] = c.dimensione.split(' ').map((v) => parseFloat(v));
  const [x, y] = c.posizione.split(' ').map((v) => parseFloat(v));
  return { w, h, x, y };
}

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

describe('righeDelTesto', () => {
  it('un testo senza a capo resta una riga sola', () => {
    expect(righeDelTesto('Ntonia ne fa quattro'))
      .toEqual([{ testo: 'Ntonia ne fa quattro', rientro: 0 }]);
  });

  it('spezza dove l\'admin ha spezzato', () => {
    expect(righeDelTesto('Ntonia\nne fa quattro').map((r: { testo: string }) => r.testo))
      .toEqual(['Ntonia', 'ne fa quattro']);
  });

  it('gli spazi in testa diventano un rientro, non spazi', () => {
    // in HTML uno spazio in testa sparisce, e `soloTesto` butterebbe via la
    // tabulazione: tradotti in punti sopravvivono a tutti e due i motori
    const r = righeDelTesto('primo\n    secondo');
    expect(r[1].testo).toBe('secondo');
    expect(r[1].rientro).toBeGreaterThan(0);
    expect(r[0].rientro).toBe(0);
  });

  it('una tabulazione rientra più di uno spazio', () => {
    const conTab = righeDelTesto('\tx')[0].rientro;
    const conSpazio = righeDelTesto(' x')[0].rientro;
    expect(conTab).toBeGreaterThan(conSpazio);
  });

  it('regge anche gli a capo di Windows', () => {
    expect(righeDelTesto('uno\r\ndue').map((r: { testo: string }) => r.testo)).toEqual(['uno', 'due']);
  });

  it('una riga vuota resta, perché è uno stacco voluto', () => {
    expect(righeDelTesto('uno\n\ndue')).toHaveLength(3);
  });
});


describe('lo zoom della foto', () => {
  const riquadro = { larghezza: 782, altezza: 436 };
  // la foto del video: più larga in proporzione del riquadro, quindi la
  // copertura minima la fa combaciare in altezza — ed è per questo che il
  // cursore verticale non spostava niente
  const larga = { larghezza: 1600, altezza: 800 };

  it('senza zoom la manopola verticale non ha scarto da percorrere (il difetto)', () => {
    const cima = misure(coperturaFoto({ ...larga, fuoco: 0 }, riquadro));
    const fondo = misure(coperturaFoto({ ...larga, fuoco: 100 }, riquadro));
    expect(cima.y).toBe(fondo.y);
    expect(spazioDiManovra(larga, riquadro).y).toBe(0);
  });

  it('con lo zoom la stessa foto si sposta anche in verticale', () => {
    const cima = misure(coperturaFoto({ ...larga, fuoco: 0, zoom: 150 }, riquadro));
    const fondo = misure(coperturaFoto({ ...larga, fuoco: 100, zoom: 150 }, riquadro));
    expect(fondo.y).toBeLessThan(cima.y);
    expect(cima.y).toBe(0);
    expect(spazioDiManovra({ ...larga, zoom: 150 }, riquadro).y).toBeGreaterThan(100);
  });

  it('lo zoom ingrandisce senza storcere', () => {
    const c = misure(coperturaFoto({ ...larga, zoom: 175 }, riquadro));
    expect(c.w / c.h).toBeCloseTo(larga.larghezza / larga.altezza, 2);
    const base = misure(coperturaFoto(larga, riquadro));
    expect(c.w / base.w).toBeCloseTo(1.75, 2);
  });

  it('a qualunque zoom e con qualunque taglio la foto copre: niente spazi neri', () => {
    const fotografie = [
      { larghezza: 1600, altezza: 800 }, { larghezza: 1100, altezza: 733 },
      { larghezza: 600, altezza: 900 }, { larghezza: 100, altezza: 100 },
      { larghezza: 4903, altezza: 3163 },
    ];
    for (const f of fotografie) {
      for (const zoom of [100, 105, 137, 200, 300]) {
        for (const fuoco of [0, 33, 50, 100]) {
          for (const fuocoX of [0, 50, 100]) {
            const box = riquadroDellaFoto(disposizioneFoto({
              src: '', provenienza: '', fuoco, ...f,
            }));
            const { w, h, x, y } = misure(coperturaFoto({ ...f, zoom, fuoco, fuocoX }, box));
            expect(x).toBeLessThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(0);
            expect(x + w).toBeGreaterThanOrEqual(box.larghezza);
            expect(y + h).toBeGreaterThanOrEqual(box.altezza);
          }
        }
      }
    }
  });

  it('senza il campo zoom la pagina resta identica a prima', () => {
    const senza = coperturaFoto({ ...larga, fuoco: 35 }, riquadro);
    const cento = coperturaFoto({ ...larga, fuoco: 35, zoom: 100 }, riquadro);
    expect(senza).toEqual(cento);
  });

  it('zoomValido tiene i limiti e non scende mai sotto la copertura', () => {
    expect(zoomValido(undefined)).toBe(ZOOM_MINIMO);
    expect(zoomValido(NaN)).toBe(ZOOM_MINIMO);
    expect(zoomValido(10)).toBe(ZOOM_MINIMO);
    expect(zoomValido(-400)).toBe(ZOOM_MINIMO);
    expect(zoomValido(1000)).toBe(ZOOM_MASSIMO);
    expect(zoomValido(137.4)).toBe(137);
  });

  it('zoomPerSpostarsi propone un ingrandimento che serve davvero', () => {
    const z = zoomPerSpostarsi(larga, riquadro, 'y');
    expect(z).toBeGreaterThan(100);
    expect(spazioDiManovra({ ...larga, zoom: z }, riquadro).y).toBeGreaterThanOrEqual(60);
  });

  it('e non propone niente da fare quando lo spazio c\'è già', () => {
    const alta = { larghezza: 800, altezza: 1600 };
    expect(spazioDiManovra(alta, riquadro).y).toBeGreaterThan(60);
    expect(zoomPerSpostarsi(alta, riquadro, 'y')).toBe(100);
  });
});

describe('riquadroDellaFoto', () => {
  it('sono le misure che la pagina disegna davvero', () => {
    expect(riquadroDellaFoto('sfondo')).toEqual({ larghezza: 782, altezza: 436 });
    expect(riquadroDellaFoto('affianco')).toEqual({ larghezza: 290, altezza: 436 });
    expect(riquadroDellaFoto('riquadro')).toEqual({ larghezza: 300, altezza: 300 });
  });

  it('senza foto vale il riquadro grande, che non fa danni', () => {
    expect(riquadroDellaFoto('senzaFoto')).toEqual({ larghezza: 782, altezza: 436 });
  });
});

describe('spostare i paragrafi', () => {
  const voce = (titolo: string) => ({ titolo, testo: `testo di ${titolo}` });
  const pagina = (p: Partial<DatiPrima> = {}): DatiPrima => ({
    tipo: 'fantamercato', numero: 'N. 1', data: 'oggi', sottotestata: '', occhiello: '',
    titolo: 'T', gancio: '', sottotitolo: '', cappello: '', foto: null,
    classifica: [], prossimi: [], gironi: null, tabellone: null,
    altre: [voce('uno'), voce('due'), voce('tre')],
    colonna: null, spalla: null, piedeSinistra: '', piedeDestra: '',
    ...p,
  });

  it('su e giù scambiano con il vicino', () => {
    const v = ['a', 'b', 'c'];
    expect(spostaVoce(v, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(spostaVoce(v, 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('ai bordi non fa niente, invece di perdere una voce', () => {
    const v = ['a', 'b', 'c'];
    expect(spostaVoce(v, 0, -1)).toEqual(v);
    expect(spostaVoce(v, 2, 1)).toEqual(v);
    expect(spostaVoce(v, 9, 1)).toEqual(v);
    expect(spostaVoce([], 0, 1)).toEqual([]);
  });

  it('non tocca l\'originale: l\'editor lavora per copie', () => {
    const v = ['a', 'b'];
    spostaVoce(v, 0, 1);
    expect(v).toEqual(['a', 'b']);
  });

  it('la colonna è libera nelle edizioni di mercato, occupata nelle altre', () => {
    expect(colonnaLibera(pagina())).toBe(true);
    expect(colonnaLibera(pagina({ classifica: [{ nome: 'X', punti: 3 }] }))).toBe(false);
    expect(colonnaLibera(pagina({ prossimi: [{ casa: 'A', ospite: 'B' }] }))).toBe(false);
    expect(colonnaLibera(pagina({ gironi: [{ gruppo: 'A', righe: [] }] }))).toBe(false);
    expect(colonnaLibera(pagina({ tabellone: [{ turno: 'x', testo: 'y' }] }))).toBe(false);
  });

  it('porta un paragrafo nella colonna, creandola se non c\'è', () => {
    const d = allaColonna(pagina(), 1);
    expect(d.altre.map((x) => x.titolo)).toEqual(['uno', 'tre']);
    expect(d.colonna?.voci.map((x) => x.titolo)).toEqual(['due']);
    expect(d.colonna?.titolo).toBe('In breve');
  });

  it('e lo accoda a quella che c\'è già', () => {
    const con = pagina({ colonna: { titolo: 'Gli scambi', voci: [voce('zero')] } });
    const d = allaColonna(con, 0);
    expect(d.colonna?.titolo).toBe('Gli scambi');
    expect(d.colonna?.voci.map((x) => x.titolo)).toEqual(['zero', 'uno']);
  });

  it('non ci porta niente quando la colonna è occupata dalla classifica', () => {
    const conClassifica = pagina({ classifica: [{ nome: 'X', punti: 3 }] });
    expect(allaColonna(conClassifica, 0)).toBe(conClassifica);
  });

  it('riporta un paragrafo nel riquadro, e l\'ultimo si porta via la colonna', () => {
    const con = pagina({ colonna: { titolo: 'Gli scambi', voci: [voce('x'), voce('y')] } });
    const uno = alRiquadro(con, 0);
    expect(uno.colonna?.voci.map((v) => v.titolo)).toEqual(['y']);
    expect(uno.altre.map((v) => v.titolo)).toEqual(['uno', 'due', 'tre', 'x']);

    const vuota = alRiquadro(uno, 0);
    expect(vuota.colonna).toBeNull();
  });

  it('un indice che non esiste non combina danni', () => {
    const d = pagina();
    expect(allaColonna(d, 9)).toBe(d);
    expect(alRiquadro(d, 0)).toBe(d);
  });

  it('il giro completo riporta la pagina com\'era', () => {
    const d = pagina();
    const tornata = alRiquadro(allaColonna(d, 2), 0);
    expect(tornata.altre.map((x) => x.titolo)).toEqual(['uno', 'due', 'tre']);
    expect(tornata.colonna).toBeNull();
  });
});
