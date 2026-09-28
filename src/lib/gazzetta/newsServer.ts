import 'server-only';

/**
 * L'indice settimanale delle foto — dalle news di fantacalcio.it al database.
 *
 * Gira insieme agli indisponibili, il mercoledì. La ragione è spiegata in
 * `news.ts` e vale la pena ripeterla: cercare la foto nel momento in cui
 * l'admin compone la pagina vorrebbe dire appoggiarsi a un sito esterno
 * proprio mentre sta pubblicando. Così invece un guasto si scopre il
 * mercoledì con un messaggio Telegram, e il sabato sera l'editor legge solo
 * il nostro database.
 *
 * Non solleva mai: torna i problemi. La chiama il cron, e un cron che esplode
 * perché una pagina esterna ha cambiato impaginazione si porta dietro anche
 * tutto il resto del giro.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { articoliDaIndice, dataDaUrl, datiDaArticolo, type ArticoloNews } from './news';

const INDICE = 'https://www.fantacalcio.it/news';

/**
 * Quanti articoli si aprono per ogni raccolta.
 *
 * L'indice ne elenca molti di più, ma ogni articolo è una richiesta a un
 * sito che non è nostro e il cron di Vercel ha un tempo massimo. Trenta
 * bastano: coprono i giorni fra due raccolte, che è la finestra che serve
 * per avere la foto di chi ha giocato nell'ultima giornata.
 */
const QUANTI = 30;

/** Quanto si tiene l'indice: oltre, le foto sono di un'altra stagione. */
const GIORNI_DA_TENERE = 120;

export interface EsitoFoto {
  trovati: number;
  nuovi: number;
  problemi: string[];
}

async function scarica(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FantaMansarda/1.0)' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function raccogliFoto(): Promise<EsitoFoto> {
  const problemi: string[] = [];
  const db = supabaseAdmin();

  const indice = await scarica(INDICE);
  if (!indice) return { trovati: 0, nuovi: 0, problemi: ['non sono riuscito a leggere l\'indice delle news'] };

  const indirizzi = articoliDaIndice(indice).slice(0, QUANTI);
  if (!indirizzi.length) {
    // il sintomo che la pagina è cambiata e il riconoscimento non se n'è
    // accorto: l'indice delle news non è mai davvero vuoto
    return { trovati: 0, nuovi: 0, problemi: ['l\'indice non contiene nessun articolo riconoscibile'] };
  }

  // quali abbiamo già: un articolo pubblicato non cambia più, quindi
  // riaprirlo sarebbe una richiesta buttata
  const { data: gia } = await db.from('news_photos')
    .select('articolo_url').in('articolo_url', indirizzi);
  const conosciuti = new Set((gia ?? []).map((r) => r.articolo_url as string));
  const daAprire = indirizzi.filter((u) => !conosciuti.has(u));

  const righe: { articolo_url: string; pubblicata_il: string | null; immagine_url: string; titolo: string }[] = [];
  for (const url of daAprire) {
    const html = await scarica(url);
    if (!html) { problemi.push(`non ho potuto aprire ${url}`); continue; }
    const { immagine, titolo } = datiDaArticolo(html);
    // senza immagine o senza titolo la riga non serve a niente: la foto non
    // si potrebbe mostrare, o non si potrebbe abbinare a nessuno
    if (!immagine || !titolo) continue;
    righe.push({
      articolo_url: url, pubblicata_il: dataDaUrl(url),
      immagine_url: immagine, titolo,
    });
  }

  if (righe.length) {
    const { error } = await db.from('news_photos')
      .upsert(righe, { onConflict: 'articolo_url', ignoreDuplicates: true });
    if (error) problemi.push(`non sono riuscito a salvare le foto: ${error.message}`);
  }

  // le vecchie si buttano: una foto di quattro mesi fa in prima pagina è
  // peggio che nessuna foto, e la tabella non deve crescere per sempre
  const limite = new Date(Date.now() - GIORNI_DA_TENERE * 86_400_000).toISOString().slice(0, 10);
  await db.from('news_photos').delete().lt('pubblicata_il', limite);

  return { trovati: indirizzi.length, nuovi: righe.length, problemi };
}

/**
 * L'indice, come lo vuole `scegliFoto`.
 *
 * Le righe senza data finirebbero in fondo all'ordinamento per data: si
 * mettono alla data della raccolta, che è la migliore approssimazione che
 * abbiamo e non le fa sparire.
 */
export async function indiceFoto(): Promise<ArticoloNews[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('news_photos')
    .select('articolo_url, pubblicata_il, immagine_url, titolo, raccolta_il')
    .order('pubblicata_il', { ascending: false, nullsFirst: false })
    .limit(400);

  return (data ?? []).map((r) => ({
    url: r.articolo_url as string,
    titolo: r.titolo as string,
    immagine: r.immagine_url as string,
    data: (r.pubblicata_il as string | null) ?? String(r.raccolta_il).slice(0, 10),
  }));
}
