import { NextResponse, type NextRequest } from 'next/server';
import { advanceSessions } from '@/lib/market';
import { queueSessionMessage } from '@/lib/messageBuilder';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdmin, notifyAdminPlain, tgPhaseChange } from '@/lib/telegram';
import { raccogliIndisponibili } from '@/lib/infortuni/infortuniServer';

/**
 * Cron giornaliero (Vercel). Fa tre cose:
 *   1. allinea lo stato delle sessioni al calendario
 *   2. prepara i riepiloghi di T−5 e T−1 come bozze da controllare
 *   3. il mercoledì, raccoglie gli indisponibili di Serie A
 *   4. tocca il database, così il progetto Supabase gratuito non va in pausa
 *
 * Le fasi vengono comunque ricalcolate dall'orologio a ogni pagina: se il cron
 * salta un giro, l'app resta corretta lo stesso.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  }

  const changed = await advanceSessions();

  const db = supabaseAdmin();

  for (const c of changed) {
    if (c.to !== 'calls_closed' && c.to !== 'joins_closed') continue;
    await queueSessionMessage(c.id, c.to);

    const { data: s } = await db.from('auction_sessions').select('number').eq('id', c.id).single();
    const { count } = await db.from('lots')
      .select('id', { count: 'exact', head: true }).eq('session_id', c.id).neq('status', 'cancelled');
    await notifyAdmin(tgPhaseChange(s?.number ?? 0, c.to, count ?? 0));
  }

  // Il mercoledì gli indisponibili. Dentro il cron che c'è già e non in uno
  // suo: il piano Hobby di Vercel ne concede pochissimi, e un `getDay()`
  // costa meno di uno slot. Il mercoledì è la scelta dell'admin — sappi però
  // che gli infortuni veri si sanno il venerdì, dalla rifinitura: se un
  // giorno le quote si pubblicheranno più tardi, questo giorno va spostato.
  let indisponibili: Awaited<ReturnType<typeof raccogliIndisponibili>> | null = null;
  if (new Date().getUTCDay() === 3) {
    indisponibili = await raccogliIndisponibili();
    if (indisponibili.problemi.length) {
      await notifyAdminPlain(
        `Indisponibili: ${indisponibili.righe} righe, ${indisponibili.agganciate} agganciate.\n`
        + indisponibili.problemi.join('\n'),
      );
    }
  }

  const { count } = await db.from('players').select('id', { count: 'exact', head: true });

  return NextResponse.json({
    ok: true, changed, players: count ?? 0, indisponibili, at: new Date().toISOString(),
  });
}
