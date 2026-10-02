import 'server-only';

/**
 * Le aste flash riportate su Leghe Fantacalcio, al posto dell'admin.
 *
 * Alla chiusura di un'asta l'app scrive sulla lega gli svincoli (col
 * rimborso calcolato dall'app) e gli acquisti (col prezzo battuto), con le
 * stesse chiamate del pannello admin del sito. Poi rilegge le rose della
 * lega e le confronta con le nostre: se qualcosa non torna — un giocatore,
 * un costo, i crediti — lo dice su Telegram invece di far finta di niente.
 *
 * Un'asta riportata non si riporta due volte: la data resta sulla sessione.
 * Una andata storta si riprova dal cron del mattino o dal Pannello, e il
 * piano salta da solo quello che nella lega è già a posto.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdminPlain } from '@/lib/telegram';
import { chiedi, lega, LegheNonCollegata } from './legheServer';
import { anteprimaRoseDallaLega } from './roseServer';
import { pianoAsta, type MovimentoAsta } from './mercato';
import type { SquadraApi } from './rose';

export interface EsitoRiporto {
  ok: boolean;
  /** niente da fare: già riportata, o un'asta senza movimenti */
  saltata: boolean;
  messaggio: string;
  passi: string[];
}

const chiave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Svincoli e acquisti di una sessione, dai contratti che la portano scritta. */
async function movimenti(sessionId: string): Promise<{ svincoli: MovimentoAsta[]; acquisti: MovimentoAsta[] }> {
  const db = supabaseAdmin();
  const { data } = await db.from('contracts')
    .select('price, acquisition_type, released_at, release_type, release_value, teams(name), players(ext_id, name)')
    .eq('session_id', sessionId);
  type Riga = {
    price: number; acquisition_type: string; released_at: string | null; release_type: string | null;
    release_value: number | null; teams: { name: string } | null; players: { ext_id: string; name: string } | null;
  };
  const righe = ((data ?? []) as unknown as Riga[]).filter((r) => r.teams && r.players);
  const m = (r: Riga, crediti: number): MovimentoAsta => ({
    extId: String(r.players!.ext_id), nome: r.players!.name, teamName: r.teams!.name, crediti,
  });
  return {
    svincoli: righe.filter((r) => r.released_at && r.release_type !== 'correction').map((r) => m(r, r.release_value ?? 0)),
    acquisti: righe.filter((r) => r.acquisition_type === 'flash_auction' && !r.released_at).map((r) => m(r, r.price)),
  };
}

/** Le squadre della lega col nostro nome: id, divisione e rosa attuale. */
async function squadreLega(leagueId: string) {
  const [body, { data: nostre }] = await Promise.all([
    chiedi<{ data?: (SquadraApi & { d?: string })[] }>('/onboarding/v1/league/teams?page=1&pageSize=50'),
    supabaseAdmin().from('teams').select('name').eq('league_id', leagueId),
  ]);
  const nome = new Map((nostre ?? []).map((t) => [chiave(t.name as string), t.name as string]));
  const esito = new Map<string, { id: number; divisione: string; rosa: Set<string> }>();
  for (const t of body.data ?? []) {
    const n = nome.get(chiave(String(t.n ?? '')));
    if (!n || t.id == null) continue;
    esito.set(n, {
      id: Number(t.id), divisione: String(t.d || 'A'),
      rosa: new Set(String(t.cal ?? '').split(';').map((x) => x.trim()).filter(Boolean)),
    });
  }
  return esito;
}

/**
 * `riportata`: le chiamate sono andate tutte; la data si segna e il cron non
 * ci riprova. Una differenza trovata dopo (crediti già storti prima
 * dell'asta, per dire) si dice una volta, non ogni mattina.
 */
async function salva(sessionId: string, riportata: boolean, ok: boolean, testo: string) {
  await supabaseAdmin().from('auction_sessions').update({
    leghe_riportata_il: riportata ? new Date().toISOString() : null,
    leghe_esito: `${ok ? 'ok' : 'ko'}: ${testo}`.slice(0, 1500),
  }).eq('id', sessionId).then(() => null, () => null);
}

/**
 * Riporta un'asta chiusa sulla lega. `forza` la rifà anche se risulta già
 * riportata (il piano salta comunque quello che nella lega c'è già).
 * Non solleva: lo chiamano la chiusura dell'asta e il cron.
 */
export async function riportaAstaSullaLega(sessionId: string, opt: { forza?: boolean; avvisa?: boolean } = {}): Promise<EsitoRiporto> {
  const avvisa = opt.avvisa ?? true;
  const db = supabaseAdmin();
  const { data: s } = await db.from('auction_sessions')
    .select('number, status, leghe_riportata_il').eq('id', sessionId).maybeSingle();
  if (!s) return { ok: false, saltata: true, messaggio: 'Asta non trovata.', passi: [] };
  const titolo = `Asta flash #${s.number}`;
  if (s.status !== 'closed') return { ok: false, saltata: true, messaggio: `${titolo} non è ancora chiusa.`, passi: [] };
  if (s.leghe_riportata_il && !opt.forza) {
    return { ok: true, saltata: true, messaggio: `${titolo} è già stata riportata sulla lega.`, passi: [] };
  }

  const passi: string[] = [];
  try {
    const leagueId = await lega();
    const { svincoli, acquisti } = await movimenti(sessionId);
    if (!svincoli.length && !acquisti.length) {
      await salva(sessionId, true, true, 'nessun movimento');
      return { ok: true, saltata: true, messaggio: `${titolo}: nessun acquisto né svincolo da riportare.`, passi };
    }

    const piano = pianoAsta(svincoli, acquisti, await squadreLega(leagueId));
    passi.push(...piano.giaFatti.map((g) => `già a posto: ${g}`));
    const errori = [...piano.problemi];
    for (const r of piano.richieste) {
      // un acquisto dopo uno svincolo fallito spenderebbe crediti che la squadra non ha
      if (r.metodo === 'POST' && errori.some((e) => e.startsWith(`${r.squadra}:`))) {
        errori.push(`${r.squadra}: acquisti non fatti perché lo svincolo non è andato`);
        continue;
      }
      try {
        await chiedi<unknown>(r.percorso, undefined, { metodo: r.metodo, corpo: r.corpo });
        passi.push(`${r.squadra}: ${r.giocatori.join(', ')}`);
      } catch (e) {
        errori.push(`${r.squadra}: ${r.giocatori.join(', ')} — ${(e as Error).message}`);
      }
    }

    // la verifica: le rose della lega adesso sono le nostre?
    const controllo = await anteprimaRoseDallaLega();
    const d = controllo.differenze;
    const coinvolte = new Set([...svincoli, ...acquisti].map((x) => x.teamName));
    const diverse = d ? [
      ...d.entrano.filter((x) => coinvolte.has(x.teamName)).map((x) => `nella lega ${x.nome} è in ${x.teamName}, da noi no`),
      ...d.escono.filter((x) => coinvolte.has(x.teamName)).map((x) => `da noi ${x.nome} è in ${x.teamName}, nella lega no`),
      ...d.costi.filter((x) => coinvolte.has(x.teamName)).map((x) => `${x.nome}: costo ${x.da} da noi, ${x.a} nella lega`),
      ...d.crediti.filter((x) => coinvolte.has(x.teamName)).map((x) => `${x.teamName}: ${x.da} crediti da noi, ${x.a} nella lega`),
    ] : [`verifica non riuscita: ${controllo.messaggio}`];

    const ok = errori.length === 0 && diverse.length === 0;
    const messaggio = ok
      ? `${titolo} riportata su Leghe Fantacalcio: ${svincoli.length} svincoli e ${acquisti.length} acquisti, rose e crediti tornano.`
      : `${titolo} su Leghe Fantacalcio: qualcosa non torna.\n${[...errori, ...diverse].join('\n')}`;
    await salva(sessionId, errori.length === 0, ok, ok ? `${svincoli.length} svincoli, ${acquisti.length} acquisti` : [...errori, ...diverse].join(' · '));
    if (avvisa) await notifyAdminPlain(`${ok ? '✅' : '⚠️'} ${messaggio}`);
    return { ok, saltata: false, messaggio, passi: [...passi, ...errori, ...diverse] };
  } catch (e) {
    const testo = e instanceof LegheNonCollegata ? e.message : `Leghe Fantacalcio: ${(e as Error).message}`;
    await salva(sessionId, false, false, testo);
    if (avvisa && !(e instanceof LegheNonCollegata)) await notifyAdminPlain(`⚠️ ${titolo} non riportata sulla lega: ${testo}`);
    return { ok: false, saltata: false, messaggio: `${titolo} non riportata sulla lega: ${testo}`, passi };
  }
}

/** Le aste chiuse da poco e non ancora riportate: le riprova il cron. */
export async function riportaAsteInSospeso(): Promise<EsitoRiporto[]> {
  const da = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await supabaseAdmin().from('auction_sessions')
    .select('id').eq('status', 'closed').is('leghe_riportata_il', null).gte('auction_at', da);
  const esiti: EsitoRiporto[] = [];
  for (const s of data ?? []) esiti.push(await riportaAstaSullaLega(s.id as string));
  return esiti;
}
