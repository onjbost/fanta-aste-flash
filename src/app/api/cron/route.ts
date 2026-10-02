import { NextResponse, type NextRequest } from 'next/server';
import { advanceSessions } from '@/lib/market';
import { queueSessionMessage } from '@/lib/messageBuilder';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdmin, notifyAdminPlain, tgPhaseChange } from '@/lib/telegram';
import { raccogliIndisponibili } from '@/lib/infortuni/infortuniServer';
import { raccogliFoto } from '@/lib/gazzetta/newsServer';
import { raccogliQuotazioni, raccogliStatistiche, raccogliVoti } from '@/lib/fonti/fontiServer';
import {
  calcoloAutomaticoAcceso, importaGiornateConcluse, LegheNonCollegata, statoCollegamento,
} from '@/lib/leghe/legheServer';
import { liveGiornata } from '@/lib/live/liveServer';
import { allineaCalendario } from '@/lib/live/calendarioServer';
import { aggiornaListoneDallaLega, aggiornaRoseDallaLega } from '@/lib/leghe/roseServer';

// il giro legge in fila fantacalcio.it e Leghe Fantacalcio: cinque minuti,
// il massimo del piano. Quasi tutto è attesa di rete, che non consuma CPU
export const maxDuration = 300;

/**
 * Cron giornaliero (Vercel), alle 9. In ordine di importanza, così se il
 * tempo finisse resterebbe indietro la cosa che conta meno:
 *   1. allinea lo stato delle sessioni al calendario e prepara i riepiloghi
 *   2. allinea il calendario di Serie A col live di fantacalcio.it
 *   3. i voti di giornata, poi calcola e importa da Leghe Fantacalcio la
 *      giornata conclusa (i voti servono a capire se è finita)
 *   4. listone e rose da Leghe Fantacalcio
 *   5. il mercoledì, gli indisponibili di Serie A e le foto delle news
 *   6. quotazioni e statistiche di stagione da fantacalcio.it
 * Tutto questo tocca il database, e il progetto Supabase gratuito non va in pausa.
 *
 * Le fasi vengono comunque ricalcolate dall'orologio a ogni pagina: se il cron
 * salta un giro, l'app resta corretta lo stesso.
 */
/** L'ora di adesso a Roma, 0–23. */
function oraRoma(adesso = new Date()): number {
  return Number(new Intl.DateTimeFormat('it-IT', { hour: '2-digit', hour12: false, timeZone: 'Europe/Rome' }).format(adesso));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  }

  // Il giro è alle 9 italiane. Vercel ragiona in UTC e l'Italia cambia ora
  // due volte l'anno: in vercel.json ci sono due esecuzioni (7 e 8 UTC) e
  // lavora solo quella che cade alle 9 a Roma — d'estate la prima, d'inverno
  // la seconda. Senza `ora` (una chiamata a mano) si lavora sempre.
  const ora = request.nextUrl.searchParams.get('ora');
  if (ora && oraRoma() !== Number(ora)) {
    return NextResponse.json({ ok: true, saltato: `a Roma non sono le ${ora}` });
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

  // I voti prima dell'import: quando il live non risponde, è dalle pagelle
  // complete di tutti i club che si capisce che la giornata è finita
  const voti = await raccogliVoti();

  // Le giornate concluse da Leghe Fantacalcio, senza preferito: si guardano
  // ogni mattina, ma una giornata si legge solo dal giorno dopo la sua ultima
  // partita di Serie A, col calendario aggiornato. Se la lega a quel punto non
  // l'ha ancora calcolata, lo si dice e si riprova la mattina dopo. Il token
  // che sta per scadere si dice per tempo.
  let giornate: Awaited<ReturnType<typeof importaGiornateConcluse>> | null = null;
  try {
    // solo dal giorno dopo l'ultima partita di Serie A della giornata: prima
    // la lega non può averla calcolata, e leggere non serve a niente
    // e se a quel punto la lega non l'ha calcolata, la calcola l'app: solo a
    // partite tutte finite secondo il live (LEGHE_CALCOLO_AUTOMATICO=no lo spegne)
    giornate = await importaGiornateConcluse({ aspettaIlCalcolo: true, calcola: calcoloAutomaticoAcceso() });
    for (const c of giornate.calcolate) {
      await notifyAdminPlain(`🧮 Ho calcolato su Leghe Fantacalcio ${c.competizione === 'coppa' ? 'il turno di coppa' : 'la giornata'} ${c.giornata}.`);
    }
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

  // Listone e rose da Leghe Fantacalcio. Il listone (svincolati compresi) è
  // anagrafica e si scrive sempre; le rose solo se nessuna differenza tocca
  // un giocatore mosso nell'app di recente — se la lega è indietro rispetto
  // a un'asta flash, copiarla disferebbe il mercato. In quel caso si dice e
  // decide l'admin dal Pannello.
  let listone: Awaited<ReturnType<typeof aggiornaListoneDallaLega>> | null = null;
  let rose: Awaited<ReturnType<typeof aggiornaRoseDallaLega>> | null = null;
  try {
    listone = await aggiornaListoneDallaLega(null);
    if (!listone.ok) await notifyAdminPlain(`📋 ${listone.messaggio}`);
    rose = await aggiornaRoseDallaLega({ actor: null, automatico: true });
    if (rose.applicate) await notifyAdminPlain(`👥 ${rose.messaggio}`);
    else if (rose.cambi > 0 || !rose.ok) await notifyAdminPlain(`👥 ${rose.messaggio}`);
  } catch (e) {
    if (!(e instanceof LegheNonCollegata)) await notifyAdminPlain(`Listone e rose da Leghe Fantacalcio: ${(e as Error).message}`);
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

  // Quotazioni, voti e statistiche tutti i giorni: sono una pagina ciascuna, la scrittura
  // sovrascrive e non duplica, e i voti escono fra lunedì e martedì ma i
  // recuperi arrivano quando arrivano. Se qualcosa non torna lo dice una
  // volta a settimana, il mercoledì con gli indisponibili: un guasto della
  // pagina non deve diventare un messaggio ogni mattina.
  const quotazioni = await raccogliQuotazioni();
  const statistiche = await raccogliStatistiche();
  const guasti = [
    ...quotazioni.problemi.map((p) => `Quotazioni: ${p}`),
    ...voti.problemi.map((p) => `Voti: ${p}`),
    ...statistiche.problemi.map((p) => `Statistiche: ${p}`),
  ];
  if (guasti.length && new Date().getUTCDay() === 3) await notifyAdminPlain(guasti.join('\n'));

  const { count } = await db.from('players').select('id', { count: 'exact', head: true });

  return NextResponse.json({
    ok: true, changed, players: count ?? 0, indisponibili, foto, quotazioni, voti, statistiche,
    listone: listone ? { ok: listone.ok, messaggio: listone.messaggio } : null,
    rose: rose ? { applicate: rose.applicate, cambi: rose.cambi, messaggio: rose.messaggio } : null,
    giornate: giornate ? { importate: giornate.importate.length, problemi: giornate.problemi } : null,
    calendario,
    at: new Date().toISOString(),
  });
}
