import { NextResponse, type NextRequest } from 'next/server';
import { advanceSessions } from '@/lib/market';
import { queueSessionMessage } from '@/lib/messageBuilder';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdmin, tgPhaseChange } from '@/lib/telegram';

/**
 * Cron giornaliero (Vercel). Fa tre cose:
 *   1. allinea lo stato delle sessioni al calendario
 *   2. prepara i riepiloghi di T−5 e T−1 come bozze da controllare
 *   3. tocca il database, così il progetto Supabase gratuito non va in pausa
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

  const { count } = await db.from('players').select('id', { count: 'exact', head: true });

  return NextResponse.json({ ok: true, changed, players: count ?? 0, at: new Date().toISOString() });
}
