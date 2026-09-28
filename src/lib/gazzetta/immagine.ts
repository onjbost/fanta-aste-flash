/**
 * Quanto è grande un'immagine, letto dai suoi primi byte.
 *
 * Serve prima di impaginare: la disposizione della foto in prima pagina la
 * decidono le proporzioni (`disposizioneFoto`), e senza le misure vere una
 * foto verticale finirebbe stirata a tutta larghezza.
 *
 * Trenta righe invece di una dipendenza: si leggono solo le intestazioni,
 * che per JPEG e PNG sono documentate e ferme da trent'anni, e sono i due
 * soli formati che fantacalcio.it serve. Un WebP o un formato che non
 * conosciamo torna `null`, e chi chiama tratta il caso invece di ricevere
 * misure inventate.
 */

export interface Misure { larghezza: number; altezza: number }

export function misuraImmagine(dati: Uint8Array): Misure | null {
  return misuraPng(dati) ?? misuraJpeg(dati) ?? misuraGif(dati);
}

/** PNG: firma di 8 byte, poi il chunk IHDR con larghezza e altezza a 32 bit. */
function misuraPng(d: Uint8Array): Misure | null {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (d.length < 24) return null;
  for (let i = 0; i < firma.length; i++) if (d[i] !== firma[i]) return null;
  // 12..15 dev'essere «IHDR»: senza questo controllo un file che comincia
  // per caso con la firma darebbe misure a caso
  if (d[12] !== 0x49 || d[13] !== 0x48 || d[14] !== 0x44 || d[15] !== 0x52) return null;
  return { larghezza: leggi32(d, 16), altezza: leggi32(d, 20) };
}

/**
 * JPEG: si salta di marcatore in marcatore fino a un SOF, che porta le
 * misure. Non è il primo segmento del file: prima ci stanno le miniature,
 * i profili di colore e i dati della macchina fotografica.
 */
function misuraJpeg(d: Uint8Array): Misure | null {
  if (d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) { i++; continue; }        // riallineamento sui byte di riempimento
    const marcatore = d[i + 1];
    if (marcatore === 0xd8 || marcatore === 0x01 || (marcatore >= 0xd0 && marcatore <= 0xd7)) {
      i += 2; continue;                           // marcatori senza lunghezza
    }
    if (marcatore === 0xd9 || marcatore === 0xda) return null;  // fine, o inizio dei dati

    const lunghezza = (d[i + 2] << 8) | d[i + 3];
    if (lunghezza < 2) return null;               // lunghezza impossibile: file rotto

    // SOF0..SOF15, saltando DHT (c4), JPGA (c8) e DAC (cc), che non sono SOF
    const sof = marcatore >= 0xc0 && marcatore <= 0xcf
      && marcatore !== 0xc4 && marcatore !== 0xc8 && marcatore !== 0xcc;
    if (sof) {
      return {
        altezza: (d[i + 5] << 8) | d[i + 6],
        larghezza: (d[i + 7] << 8) | d[i + 8],
      };
    }
    i += 2 + lunghezza;
  }
  return null;
}

/** GIF: raro ma capita, e costa tre righe. Le misure sono a 16 bit, invertite. */
function misuraGif(d: Uint8Array): Misure | null {
  if (d.length < 10) return null;
  if (d[0] !== 0x47 || d[1] !== 0x49 || d[2] !== 0x46) return null;
  return { larghezza: d[6] | (d[7] << 8), altezza: d[8] | (d[9] << 8) };
}

function leggi32(d: Uint8Array, i: number): number {
  return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
}
