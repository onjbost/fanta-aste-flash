import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ALTEZZA, LARGHEZZA, Prima } from './Prima';
import { COLORI, type DatiPrima } from './prima';

const F = 'src/lib/gazzetta/font';
const fonts = [
  { name: 'Titolo', data: readFileSync(`${F}/titolo.ttf`), weight: 400 as const, style: 'normal' as const },
  { name: 'Testo', data: readFileSync(`${F}/testo.ttf`), weight: 400 as const, style: 'normal' as const },
  { name: 'Forte', data: readFileSync(`${F}/forte.otf`), weight: 600 as const, style: 'normal' as const },
];

/*
 * Una foto 1100×733 vera — un JPEG minuscolo prodotto da un encoder vero,
 * riscalato da Satori. Le misure dichiarate contano più dei pixel: è da
 * quelle che si calcola il ritaglio.
 */
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAADAAcDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ//2Q==';

const d: DatiPrima = {
  tipo: 'settimanale', numero: 'N. 3', data: '28 SETTEMBRE 2026',
  sottotestata: 'STRUMENTI ★ SCARAMANZIE ★ BOTTE DI CULO',
  occhiello: 'LA GIORNATA 3',
  titolo: 'Ntonia ne fa quattro', gancio: 'con un Mastantuono da 18',
  sottotitolo: 'FC NTONIA - FC CANEPARDO 4-1',
  cappello: 'Ottantaquattro fantapunti. Canepardo ne mette settanta e mezzo e resta l’unica a zero dopo tre giornate: a questo punto non è sfortuna, è un metodo.',
  foto: { src: FOTO, larghezza: 1100, altezza: 733, provenienza: 'test', fuoco: 32 },
  classifica: [
    { nome: 'DEPORTIVO APERITIVO', punti: 9 }, { nome: 'FC NTONIA', punti: 7 },
    { nome: 'FC Joga Benito', punti: 6 }, { nome: 'Qarabaggio', punti: 5 },
    { nome: 'Montester United', punti: 3 }, { nome: 'Borussia Alecchiomund', punti: 2 },
    { nome: 'Pirati dei Caracoli', punti: 1 }, { nome: 'FC CANEPARDO', punti: 0 },
  ],
  prossimi: [
    { casa: 'FC Joga Benito', ospite: 'FC NTONIA' }, { casa: 'FC CANEPARDO', ospite: 'Qarabaggio' },
    { casa: 'Borussia Alecchiomund', ospite: 'DEPORTIVO APERITIVO' },
    { casa: 'Pirati dei Caracoli', ospite: 'Montester United' },
  ],
  altre: [
    { titolo: 'Joga Benito 2-1 Montester', testo: 'Cinque fantapunti di scarto. Montester perde in casa e guarda la classifica dal quinto posto: il progetto procede.' },
    { titolo: 'Qarabaggio 1-1 Borussia', testo: 'Pareggio fra chi non voleva vincere e chi non ci è riuscito. Il Borussia muove la classifica, resta penultimo.' },
    { titolo: 'Deportivo 2-0 Pirati', testo: 'Settantasei contro sessantadue e mezzo. I Pirati hanno un punto in tre giornate e l’aria di chi se lo merita.' },
  ],
  spalla: { numero: '18', didascalia: 'i fantapunti di Mastantuono: nessuno in campionato ne ha fatti tanti in una giornata sola.' },
  piedeSinistra: 'FANTA MANSARDA', piedeDestra: 'UNICA ED INIMITABILE',
};

/*
 * Perché questo test esiste.
 *
 * `Prima.tsx` è scritto nel sottoinsieme che Satori conosce — solo flexbox —
 * ma niente nel compilatore lo verifica: una riga di CSS che il browser
 * disegna bene e Satori ignora passa i tipi, passa i test puri, e si scopre
 * guardando l'immagine già mandata nel gruppo. Qui la pagina si renderizza
 * davvero, ed è l'unico posto dove quella classe di guasti si vede.
 */
describe('la prima pagina attraverso Satori', () => {
  const rendi = (dati = d) =>
    satori(Prima({ d: dati }), { width: LARGHEZZA, height: ALTEZZA, fonts });

  it('esce delle misure della pagina, non di quelle del contenuto', async () => {
    const svg = await rendi();
    expect(svg.startsWith(`<svg width="${LARGHEZZA}" height="${ALTEZZA}"`)).toBe(true);
  });

  it('la foto copre il riquadro senza deformarsi e senza affiancarsi', async () => {
    // il guasto che questo test blocca: `background-size: cover` in Satori
    // non esiste, e la foto usciva a mosaico. Il ritaglio adesso si calcola,
    // e queste due misure sono il calcolo
    const svg = await rendi();
    const m = svg.match(/<image x="0" y="0" width="(\d+)" height="(\d+)"/);
    expect(m).not.toBeNull();
    const [largo, alto] = [Number(m![1]), Number(m![2])];
    expect(largo).toBeGreaterThanOrEqual(842 - 60);   // la larghezza utile
    expect(alto).toBeGreaterThanOrEqual(436);         // l'altezza dell'apertura
    expect(largo / alto).toBeCloseTo(1100 / 733, 2);
  });

  it('i testi vengono disegnati, in tutti e tre i colori della pagina', async () => {
    /*
     * Satori converte le lettere in tracciati: nell'SVG il testo non c'è
     * più, quindi cercarlo sarebbe inutile. Si controllano i colori: il
     * titolo bianco, il gancio giallo e l'inchiostro delle colonne. Se un
     * font non si caricasse Satori solleverebbe; se un blocco restasse
     * vuoto, quel colore sparirebbe dai tracciati.
     */
    const svg = await rendi();
    for (const colore of [COLORI.carta, COLORI.giallo, COLORI.inchiostro]) {
      expect(svg).toContain(`<path fill="${colore}"`);
    }
  });

  it('senza foto non si rompe: resta la sola tipografia', async () => {
    const svg = await rendi({ ...d, foto: null });
    expect(svg).not.toContain('<image');
    expect(svg).toContain(`<path fill="${COLORI.carta}"`);
  });

  it('resvg produce un PNG al doppio delle misure', () => {
    const png = new Resvg(
      `<svg width="${LARGHEZZA}" height="${ALTEZZA}" xmlns="http://www.w3.org/2000/svg">`
      + '<rect width="100%" height="100%" fill="#FFD6E0"/></svg>',
      { fitTo: { mode: 'width', value: LARGHEZZA * 2 }, font: { loadSystemFonts: false } },
    ).render();
    expect([png.width, png.height]).toEqual([LARGHEZZA * 2, ALTEZZA * 2]);
  });
}, 60_000);
