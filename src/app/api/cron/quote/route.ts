import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { notifyAdminPlain } from '@/lib/telegram';
import { aggiornaQuoteProssima } from '@/lib/schedineAuto';

// il Monte Carlo e l'anteprima, se le quote sono nuove, prendono qualche decina di secondi
export const maxDuration = 120;

/** L'ora di adesso a Roma, 0–23. */
function oraRoma(adesso = new Date()): number {
  return Number(new Intl.DateTimeFormat('it-IT', { hour: '2-digit', hour12: false, timeZone: 'Europe/Rome' }).format(adesso));
}

/**
 * Le quote del pomeriggio (Vercel), alle 15: rigenera quelle della prossima
 * giornata finché le schedine sono aperte, e le pubblica se non lo erano.
 * Mentre una giornata è in corso è fermo; riparte quando il giro del mattino
 * l'ha calcolata. Come il cron del mattino, due esecuzioni in vercel.json
 * (13 e 14 UTC) e lavora solo quella che cade alle 15 a Roma.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  }
  const ora = request.nextUrl.searchParams.get('ora');
  if (ora && oraRoma() !== Number(ora)) {
    return NextResponse.json({ ok: true, saltato: `a Roma non sono le ${ora}` });
  }

  const esito = await aggiornaQuoteProssima();
  if (esito.fatto === 'pubblicate' || esito.fatto === 'aggiornate' || esito.fatto === 'errore') {
    revalidatePath('/schedine');
    revalidatePath('/admin/schedine');
    // la pubblicazione si annuncia da sé con l'anteprima
    if (esito.fatto !== 'pubblicate') await notifyAdminPlain(`🎟️ ${esito.messaggio}`);
  }
  return NextResponse.json({ ok: esito.fatto !== 'errore', ...esito, at: new Date().toISOString() });
}
