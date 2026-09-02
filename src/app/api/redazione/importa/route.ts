import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { importaGiornata, ImportRifiutato } from '@/lib/redazione/importaServer';
import { notifyAdminPlain } from '@/lib/telegram';

/**
 * Dove atterra il bookmarklet.
 *
 * Chi chiama non è un utente loggato: è un pezzo di codice che gira dentro la
 * pagina della lega, su un altro dominio. Non ha una sessione e non deve
 * averla — quello che porta è una parola d'ordine condivisa e il tabellino.
 *
 * Per questo l'endpoint fa una cosa sola e la fa stretta: accetta un import,
 * lo salva, lo verifica, e risponde. Non legge niente, non cancella niente.
 * Al massimo un dispetto costa una riga in più in `redazione_imports`.
 */

export const runtime = 'nodejs';

/** Confronto a tempo costante: un confronto normale perde il segreto un carattere alla volta. */
function segretoGiusto(dato: string | null): boolean {
  const atteso = process.env.REDAZIONE_IMPORT_SECRET;
  if (!atteso) return false;
  if (!dato) return false;
  const a = Buffer.from(dato);
  const b = Buffer.from(atteso);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const CORS = {
  'access-control-allow-origin': 'https://leghe.fantacalcio.it',
  'access-control-allow-headers': 'content-type, x-redazione-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  if (!process.env.REDAZIONE_IMPORT_SECRET) {
    return NextResponse.json(
      { ok: false, errore: 'REDAZIONE_IMPORT_SECRET non è configurata sul server' },
      { status: 503, headers: CORS },
    );
  }
  if (!segretoGiusto(request.headers.get('x-redazione-secret'))) {
    return NextResponse.json({ ok: false, errore: 'parola d\'ordine sbagliata' },
      { status: 401, headers: CORS });
  }

  // un tabellino di otto sfide sta abbondantemente sotto: oltre, è spazzatura
  const lunghezza = Number(request.headers.get('content-length') ?? 0);
  if (lunghezza > 2_000_000) {
    return NextResponse.json({ ok: false, errore: 'payload troppo grande' },
      { status: 413, headers: CORS });
  }

  let corpo: unknown;
  try { corpo = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'JSON illeggibile' }, { status: 400, headers: CORS }); }

  try {
    const esito = await importaGiornata(corpo);

    await notifyAdminPlain(riepilogo(esito));

    return NextResponse.json({ ok: true, ...esito }, { headers: CORS });
  } catch (e) {
    if (e instanceof ImportRifiutato) {
      await notifyAdminPlain(
        `📥 IMPORT RIFIUTATO\n\n${e.message}\n\n`
        + `Il grezzo è salvato${e.importId ? ` (${e.importId})` : ''}: si può rifare senza ricopiare la giornata.`,
      );
      return NextResponse.json({ ok: false, errore: e.message, importId: e.importId },
        { status: 422, headers: CORS });
    }
    return NextResponse.json({ ok: false, errore: (e as Error).message },
      { status: 500, headers: CORS });
  }
}

function riepilogo(e: Awaited<ReturnType<typeof importaGiornata>>): string {
  const righe = [
    `📥 GIORNATA ${e.giornata ?? '?'} IMPORTATA`,
    '',
    `${e.sfideScritte} sfide su ${e.sfideLette} · ${e.giocatori} giocatori, ${e.agganciati} agganciati al listone`,
  ];
  if (e.schedine) {
    righe.push(`Schedine: ${e.schedine.schedine} · ${e.schedine.giocate} giocate, ${e.schedine.azzeccate} azzeccate`
      + (e.schedine.inAttesa ? ` · ${e.schedine.inAttesa} in attesa` : ''));
  }
  if (e.problemi.length) {
    righe.push('', 'Da guardare:', ...e.problemi.map((p) => `· ${p}`));
  }
  return righe.join('\n');
}
