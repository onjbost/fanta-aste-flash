import { NextResponse, type NextRequest } from 'next/server';
import { advanceSessions } from '@/lib/market';
import { queueSessionMessage } from '@/lib/messageBuilder';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdmin, notifyAdminPlain, tgPhaseChange } from '@/lib/telegram';
import { raccogliIndisponibili } from '@/lib/infortuni/infortuniServer';
import { raccogliFoto } from '@/lib/gazzetta/newsServer';
import { raccogliQuotazioni, raccogliVoti } from '@/lib/fonti/fontiServer';
import { importaGiornateConcluse, LegheNonCollegata, statoCollegamento } from '@/lib/leghe/legheServer';
import { liveGiornata } from '@/lib/live/liveServer';
import { allineaCalendario } from '@/lib/live/calendarioServer';

// le pagine di fantacalcio.it si leggono in fila: il tempo standard di una
// funzione non basta quando c'è da recuperare qualche giornata di voti
export const maxDuration = 60;

/**
 * Cron giornaliero (Vercel). Fa cinque cose:
 *   1. allinea lo stato delle sessioni al calendario
 *   2. prepara i riepiloghi di T−5 e T−1 come bozze da controllare
 *   3. il mercoledì, raccoglie gli indisponibili di Serie A e le foto delle news
 *   4. ogni giorno, le quotazioni aggiornate e i voti dell'ultima giornata
 *   5. tocca il database, così il progetto Supabase gratuito non va in pausa
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
  let foto: Awaited<ReturnType<typeof raccogliFoto>> | null = null;
  if (new Date().getUTCDay() === 3) {
    indisponibili = await raccogliIndisponibili();
    if (indisponibili.problemi.length) {
      await notifyAdminPlain(
        `Indisponibili: ${indisponibili.righe} righe, ${indisponibili.agganciate} agganciate.\n`
        + indisponibili.problemi.join('\n'),
      );
    }

    // Le foto della Gazzetta lo stesso giorno, per la stessa ragione: al
    // momento di comporre la prima pagina l'editor deve leggere solo il
    // nostro database, così un guasto si scopre adesso e non il sabato sera.
    foto = await raccogliFoto();
    if (foto.problemi.length) {
      await notifyAdminPlain(
        `Foto Gazzetta: ${foto.nuovi} nuove su ${foto.trovati} articoli.\n`
        + foto.problemi.join('\n'),
      );
    }
  }

  // Quotazioni e voti tutti i giorni: sono una pagina ciascuna, la scrittura
  // sovrascrive e non duplica, e i voti escono fra lunedì e martedì ma i
  // recuperi arrivano quando arrivano. Se qualcosa non torna lo dice una
  // volta a settimana, il mercoledì con gli indisponibili: un guasto della
  // pagina non deve diventare un messaggio ogni mattina.
  const quotazioni = await raccogliQuotazioni();
  const voti = await raccogliVoti();
  const guasti = [
    ...quotazioni.problemi.map((p) => `Quotazioni: ${p}`),
    ...voti.problemi.map((p) => `Voti: ${p}`),
  ];
  if (guasti.length && new Date().getUTCDay() === 3) await notifyAdminPlain(guasti.join('\n'));

  // Il calendario di Serie A delle giornate vicine (quella appena giocata e
  // le due che vengono), allineato col live di fantacalcio.it: anticipi,
  // posticipi e rinvii arrivano qui prima che servano a quote e import.
  const calendario: { serieA: number; esito: Awaited<ReturnType<typeof allineaCalendario>> }[] = [];
  {
    const da = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: vicine } = await db.from('matchdays').select('serie_a')
      .gte('match_date', da).order('match_date').limit(3);
    for (const m of vicine ?? []) {
      const live = await liveGiornata(Number(m.serie_a));
      if ('partite' in live) {
        calendario.push({ serieA: Number(m.serie_a), esito: await allineaCalendario(Number(m.serie_a), live.partite, true).catch(() => null) });
      }
    }
  }

  // Le giornate concluse da Leghe Fantacalcio, senza preferito: si guardano
  // ogni mattina, ma una giornata si legge solo dal giorno dopo la sua ultima
  // partita di Serie A, col calendario aggiornato. Se la lega a quel punto non
  // l'ha ancora calcolata, lo si dice e si riprova la mattina dopo. Il token
  // che sta per scadere si dice per tempo.
  let giornate: Awaited<ReturnType<typeof importaGiornateConcluse>> | null = null;
  try {
    // solo dal giorno dopo l'ultima partita di Serie A della giornata: prima
    // la lega non può averla calcolata, e leggere non serve a niente
    giornate = await importaGiornateConcluse({ aspettaIlCalcolo: true });
    for (const g of giornate.importate) {
      await notifyAdminPlain(
        `📥 Giornata ${g.giornata} di ${g.competizione} importata da Leghe Fantacalcio: `
        + `${g.esito.sfideScritte}/${g.esito.sfideLette} sfide`
        + (g.esito.problemi.length ? `\n${g.esito.problemi.join('\n')}` : ''),
      );
    }
    if (giornate.problemi.length) await notifyAdminPlain(`Leghe Fantacalcio:\n${giornate.problemi.join('\n')}`);
    const stato = await statoCollegamento();
    const restano = stato?.scadeIl ? (Date.parse(stato.scadeIl) - Date.now()) / 86_400_000 : null;
    if (restano != null && restano < 3) {
      await notifyAdminPlain(`🔑 Il token di Leghe Fantacalcio scade fra ${Math.max(0, Math.floor(restano))} giorni: incollane uno nuovo in /admin/redazione.`);
    }
  } catch (e) {
    if (!(e instanceof LegheNonCollegata)) await notifyAdminPlain(`Leghe Fantacalcio: ${(e as Error).message}`);
  }

  const { count } = await db.from('players').select('id', { count: 'exact', head: true });

  return NextResponse.json({
    ok: true, changed, players: count ?? 0, indisponibili, foto, quotazioni, voti,
    giornate: giornate ? { importate: giornate.importate.length, problemi: giornate.problemi } : null,
    calendario,
    at: new Date().toISOString(),
  });
}
