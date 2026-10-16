import 'server-only';

/**
 * Le quote delle schedine senza admin: generate e pubblicate appena la
 * giornata prima è calcolata, poi rigenerate ogni pomeriggio fino alla
 * chiusura, così seguono rose, formazioni e indisponibili di adesso.
 *
 * Il giro si ferma mentre una giornata è in corso — cominciata e non ancora
 * calcolata — e riparte da solo quando il cron la importa: la «prossima» a
 * quel punto è quella dopo. Il pulsante in /admin/schedine resta, e fa la
 * stessa pubblicazione.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdminPlain } from '@/lib/telegram';
import { generaQuote, giornataDaRiga } from '@/lib/tipsterServer';
import { generaAnteprima } from '@/lib/redazione/anteprimaServer';

/**
 * Pubblica le quote già generate di una giornata e la annuncia.
 *
 * Pubblicare e annunciare sono due cose. Le quote a questo punto sono già in
 * lavagna e la lega può giocare: se l'anteprima non si genera — il modello
 * non risponde, Telegram è giù — si dice com'è andata, ma non si annulla la
 * pubblicazione. Il contrario sarebbe la cosa peggiore: quote pubblicate e
 * admin convinto di no.
 */
export async function pubblicaQuoteGiornata(matchdayId: string): Promise<{ ok: boolean; message: string }> {
  const db = supabaseAdmin();
  const { data: md } = await db.from('matchdays').select('*').eq('id', matchdayId).single();
  if (!md) return { ok: false, message: 'Giornata inesistente.' };

  const { count } = await db.from('odds').select('id', { count: 'exact', head: true })
    .in('fixture_id', (await db.from('fixtures').select('id').eq('matchday_id', matchdayId))
      .data?.map((f) => f.id) ?? []);
  if (!count) return { ok: false, message: 'Genera prima le quote.' };

  await db.from('matchdays')
    .update({ odds_published_at: new Date().toISOString(), status: 'open' })
    .eq('id', matchdayId);

  const g = giornataDaRiga(md);
  try {
    const a = await generaAnteprima(matchdayId);
    const r = await notifyAdminPlain(a.testo);
    if (!r.sent) {
      return {
        ok: true,
        message: `Quote pubblicate: in lega si può giocare. L'anteprima però non è partita `
          + `su Telegram (${r.reason}): rigenerala da lì o scrivila a mano.`,
      };
    }
    const come = a.provider === 'gemini'
      ? 'scritta dal modello'
      : `a template${a.problemi.length ? ` (${a.problemi[0]})` : ''}`;
    return {
      ok: true,
      message: `Quote pubblicate: in lega si può giocare. Anteprima ${come} mandata su `
        + 'Telegram: copiala nel gruppo.',
    };
  } catch (e) {
    await notifyAdminPlain(
      `📋 QUOTE PUBBLICATE\n\nGiornata ${g.fanta} (Serie A ${g.serieA}).\n`
      + `Si gioca fino a ${new Date(g.lockAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`,
    );
    return {
      ok: true,
      message: 'Quote pubblicate: in lega si può giocare. L\'anteprima non è venuta ('
        + (e as Error).message + '): su Telegram è partito l\'avviso secco.',
    };
  }
}

export interface EsitoQuoteAuto {
  /** cosa è successo, in una riga: per Telegram, il registro e la risposta del cron */
  messaggio: string;
  fatto: 'fermo' | 'niente' | 'pubblicate' | 'aggiornate' | 'invariate' | 'errore';
  serieA?: number;
}

/**
 * Il giro delle quote.
 *
 * - Se una giornata è in corso (cominciata, col fanta, non ancora calcolata)
 *   non si fa niente: le sue quote sono chiuse e la prossima aspetta il calcolo.
 * - Altrimenti la prossima giornata — la prima non chiusa le cui schedine
 *   sono ancora aperte — prende quote nuove: se non erano pubblicate si
 *   pubblicano e si annunciano, se lo erano si aggiornano in silenzio e si
 *   dice all'admin solo se qualcosa è cambiato.
 * - `soloSeNonPubblicate`: il giro del mattino dopo il calcolo, che
 *   pubblica la giornata nuova ma non rifà quelle già in lavagna.
 */
export async function aggiornaQuoteProssima(
  { soloSeNonPubblicate = false }: { soloSeNonPubblicate?: boolean } = {},
): Promise<EsitoQuoteAuto> {
  const db = supabaseAdmin();
  const adesso = new Date().toISOString();

  const { data: inCorso } = await db.from('matchdays')
    .select('serie_a').not('fanta', 'is', null).in('status', ['scheduled', 'open', 'locked'])
    .lte('first_kickoff_at', adesso).order('serie_a').limit(1).maybeSingle();
  if (inCorso) {
    return {
      fatto: 'fermo', serieA: Number(inCorso.serie_a),
      messaggio: `quote ferme: la ${inCorso.serie_a}ª giornata è in corso, ripartono quando è calcolata`,
    };
  }

  const { data: md } = await db.from('matchdays')
    .select('id, league_id, serie_a, fanta, odds_published_at, lock_at')
    .not('fanta', 'is', null).in('status', ['scheduled', 'open'])
    .gt('lock_at', adesso).order('serie_a').limit(1).maybeSingle();
  if (!md) return { fatto: 'niente', messaggio: 'nessuna giornata da quotare' };

  const serieA = Number(md.serie_a);
  const nome = `giornata ${md.fanta} (Serie A ${serieA})`;
  const pubblicate = Boolean(md.odds_published_at);
  if (pubblicate && soloSeNonPubblicate) {
    return { fatto: 'niente', serieA, messaggio: `le quote della ${nome} sono già pubblicate` };
  }

  try {
    const q = await generaQuote(String(md.league_id), String(md.id));
    if (q.sfide === 0) {
      return { fatto: 'niente', serieA, messaggio: `${nome}: nessuna sfida da quotare, mancano gli accoppiamenti` };
    }
    if (!pubblicate) {
      const p = await pubblicaQuoteGiornata(String(md.id));
      return {
        fatto: p.ok ? 'pubblicate' : 'errore', serieA,
        messaggio: p.ok ? `${nome}: ${q.sfide} sfide quotate. ${p.message}` : `${nome}: ${p.message}`,
      };
    }
    if (q.cambiate === 0) {
      return { fatto: 'invariate', serieA, messaggio: `${nome}: quote rigenerate, nessuna cambiata` };
    }
    return {
      fatto: 'aggiornate', serieA,
      messaggio: `${nome}: quote aggiornate, ${q.cambiate} esiti cambiati su ${q.esiti}`,
    };
  } catch (e) {
    return { fatto: 'errore', serieA, messaggio: `${nome}: quote non generate (${(e as Error).message})` };
  }
}
