import 'server-only';

/**
 * Dalla prima pagina al PNG.
 *
 * Satori trasforma l'albero di `Prima.tsx` in SVG, resvg lo rasterizza.
 * L'alternativa era un browser headless: su Vercel significa `@sparticuz/
 * chromium`, cinquanta megabyte di funzione e qualche secondo di avvio a
 * freddo, per disegnare una pagina che è fatta di rettangoli e testo.
 *
 * Da Satori discende il vincolo che governa ogni riga di `Prima.tsx`: conosce
 * **solo flexbox**. Per questo il componente è scritto in quel sottoinsieme
 * fin dall'inizio, e non «adattato» dopo: l'anteprima nell'editor e il PNG
 * escono dallo stesso albero, e se divergessero l'admin manderebbe nel gruppo
 * qualcosa che non ha visto.
 *
 * I font stanno nel repo, non su un CDN. Un carattere che non arriva
 * produrrebbe una pagina impaginata male dentro un'immagine, cioè un guasto
 * che si vede solo dopo averla mandata.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { ALTEZZA, LARGHEZZA, Prima } from './Prima';
import type { DatiPrima } from './prima';

const CARTELLA = path.join(process.cwd(), 'src', 'lib', 'gazzetta', 'font');

let caricati: { name: string; data: Buffer; weight: 400 | 600; style: 'normal' }[] | null = null;

async function font() {
  if (caricati) return caricati;
  const [titolo, testo, forte] = await Promise.all([
    readFile(path.join(CARTELLA, 'titolo.ttf')),
    readFile(path.join(CARTELLA, 'testo.ttf')),
    readFile(path.join(CARTELLA, 'forte.otf')),
  ]);
  caricati = [
    { name: 'Titolo', data: titolo, weight: 400, style: 'normal' },
    { name: 'Testo', data: testo, weight: 400, style: 'normal' },
    { name: 'Forte', data: forte, weight: 600, style: 'normal' },
  ];
  return caricati;
}

/**
 * La foto, scaricata e messa in linea.
 *
 * Satori saprebbe anche andarsela a prendere da sé, ma allora un sito lento
 * o irraggiungibile farebbe fallire l'esportazione senza dire perché. Qui si
 * scarica prima: se non arriva, la pagina esce senza foto — di sola
 * tipografia regge, con un rettangolo vuoto no.
 */
async function inLinea(dati: DatiPrima): Promise<DatiPrima> {
  const foto = dati.foto;
  if (!foto || foto.src.startsWith('data:')) return dati;

  try {
    const res = await fetch(foto.src, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ...dati, foto: null };
    const tipo = res.headers.get('content-type') ?? 'image/jpeg';
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { ...dati, foto: { ...foto, src: `data:${tipo};base64,${base64}` } };
  } catch {
    return { ...dati, foto: null };
  }
}

export async function primaInSvg(dati: DatiPrima): Promise<string> {
  return satori(Prima({ d: await inLinea(dati) }), {
    width: LARGHEZZA, height: ALTEZZA, fonts: await font(),
  });
}

/**
 * Il PNG, al doppio delle misure.
 *
 * 842×1190 sono i punti della pagina; su un telefono moderno un'immagine a
 * quella risoluzione si vede sgranata appena la si apre a schermo intero,
 * ed è esattamente quello che farà chi la riceve.
 */
export async function primaInPng(dati: DatiPrima, scala = 2): Promise<Buffer> {
  const svg = await primaInSvg(dati);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(LARGHEZZA * scala) },
    font: { loadSystemFonts: false },
  });
  return Buffer.from(resvg.render().asPng());
}
