import 'server-only';

/**
 * Quotazioni e voti di Serie A — dalle pagine al database, e ritorno.
 *
 * Stesso schema degli indisponibili: il parser sta in `pagine.ts`, puro e
 * con i suoi test; qui ci sono la rete, l'aggancio ai nostri giocatori e la
 * scrittura. Nessuna funzione di raccolta solleva mai: tornano i problemi,
 * perché le chiama il cron e un cron che esplode per una pagina esterna si
 * porta dietro tutto il resto del giro.
 */

import { supabaseAdmin } from '@/lib/supabase';
import {
  formaGiocatore, fondiVoti, type Forma, type VotoGiornata,
} from '@/lib/forma';
import {
  agganciatore, leggiQuotazioni, leggiStatistiche, leggiVoti, type GiocatoreNostro,
} from './pagine';

const QUOTAZIONI = 'https://www.fantacalcio.it/quotazioni-fantacalcio';
const VOTI = 'https://www.fantacalcio.it/voti-fantacalcio-serie-a';
const STATISTICHE = 'https://www.fantacalcio.it/statistiche-serie-a';

/** Quante giornate arretrate recuperare a ogni giro, al massimo. */
const RECUPERO_PER_GIRO = 3;

export interface EsitoFonte {
  righe: number;
  agganciate: number;
  problemi: string[];
}

/**
 * Va a prendere una pagina.
 *
 * `FANTACALCIO_COOKIE` è facoltativo: alcune parti delle pagine (i voti, in
 * certi periodi) fantacalcio.it le mostra solo a chi è collegato. Se un
 * giorno la raccolta dei voti torna vuota, si copia il cookie di una
 * sessione del browser in quella variabile e si riprova.
 */
async function scarica(url: string): Promise<{ html: string } | { errore: string }> {
  try {
    const headers: Record<string, string> = {
      'user-agent': 'Mozilla/5.0 (compatible; FantaMansarda/1.0)',
      'accept-language': 'it-IT,it;q=0.9',
    };
    if (process.env.FANTACALCIO_COOKIE) headers.cookie = process.env.FANTACALCIO_COOKIE;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    if (!res.ok) return { errore: `${url} ha risposto ${res.status}` };
    return { html: await res.text() };
  } catch (e) {
    return { errore: `non sono riuscito a leggere ${url}: ${(e as Error).message}` };
  }
}

/** Tutte le righe di una lettura, oltre il tetto delle mille di Supabase. */
async function tutte<T>(
  pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const esito: T[] = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await pagina(da, da + 999);
    if (error) throw new Error(error.message);
    esito.push(...(data ?? []));
    if (!data || data.length < 1000) return esito;
  }
}

async function nostriGiocatori(): Promise<GiocatoreNostro[]> {
  const db = supabaseAdmin();
  const righe = await tutte<{ id: string; ext_id: string; name: string; club: string }>(
    (da, a) => db.from('players').select('id, ext_id, name, club').range(da, a),
  );
  return righe.map((p) => ({ id: p.id, extId: String(p.ext_id), name: p.name, club: p.club }));
}

async function registra(fonte: 'quotazioni' | 'voti' | 'statistiche', e: EsitoFonte, nota?: string) {
  await supabaseAdmin().from('source_runs').insert({
    fonte, righe: e.righe, agganciate: e.agganciate,
    nota: [nota, ...e.problemi].filter(Boolean).join(' · ') || null,
  });
}

/** La stagione in corso come la scrive la fonte: «2026/27». */
export function stagioneCorrente(oggi = new Date()): string {
  const y = oggi.getUTCFullYear();
  const da = oggi.getUTCMonth() >= 6 ? y : y - 1;
  return `${da}/${String((da + 1) % 100).padStart(2, '0')}`;
}

// =====================================================================
// le quotazioni
// =====================================================================

export async function raccogliQuotazioni(): Promise<EsitoFonte> {
  const pagina = await scarica(QUOTAZIONI);
  if ('errore' in pagina) {
    const e = { righe: 0, agganciate: 0, problemi: [pagina.errore] };
    await registra('quotazioni', e);
    return e;
  }

  const righe = leggiQuotazioni(pagina.html);
  if (!righe.length) {
    const e = { righe: 0, agganciate: 0, problemi: ['la pagina delle quotazioni non ha prodotto righe: probabilmente è cambiata'] };
    await registra('quotazioni', e);
    return e;
  }

  const aggancia = agganciatore(await nostriGiocatori());
  const adesso = new Date().toISOString();
  const daScrivere = righe.map((r) => ({
    ext_id: r.extId,
    player_id: aggancia(r),
    nome_fonte: r.nome,
    club_fonte: r.club,
    ruolo: r.ruolo,
    qt_iniziale: r.qtIniziale,
    qt_attuale: r.qtAttuale,
    fvm: r.fvm,
    updated_at: adesso,
  }));
  const agganciate = daScrivere.filter((r) => r.player_id).length;

  const problemi: string[] = [];
  for (let i = 0; i < daScrivere.length; i += 500) {
    const { error } = await supabaseAdmin().from('player_prices')
      .upsert(daScrivere.slice(i, i + 500), { onConflict: 'ext_id' });
    if (error) { problemi.push(error.message); break; }
  }
  if (agganciate / righe.length < 0.5) {
    problemi.push(`agganciate solo ${agganciate} quotazioni su ${righe.length}: controlla gli id del listone`);
  }

  const e = { righe: righe.length, agganciate, problemi };
  await registra('quotazioni', e);
  return e;
}

// =====================================================================
// le statistiche di stagione
// =====================================================================

/**
 * Fantamedia, partite a voto, gol, assist, rigori e cartellini della
 * stagione, dalla pagina «Statistiche Serie A». Si sovrascrive tutto a ogni
 * giro: della stagione serve l'ultima fotografia.
 */
export async function raccogliStatistiche(): Promise<EsitoFonte> {
  const pagina = await scarica(STATISTICHE);
  if ('errore' in pagina) {
    const e = { righe: 0, agganciate: 0, problemi: [pagina.errore] };
    await registra('statistiche', e);
    return e;
  }

  const righe = leggiStatistiche(pagina.html);
  if (!righe.length) {
    const e = { righe: 0, agganciate: 0, problemi: ['la pagina delle statistiche non ha prodotto righe: probabilmente è cambiata'] };
    await registra('statistiche', e);
    return e;
  }

  const aggancia = agganciatore(await nostriGiocatori());
  const stagione = stagioneCorrente();
  const adesso = new Date().toISOString();
  const daScrivere = righe.map((r) => ({
    ext_id: r.extId,
    player_id: aggancia(r),
    stagione,
    nome_fonte: r.nome,
    club_fonte: r.club,
    ruolo: r.ruolo,
    presenze: r.presenze,
    media_voto: r.mediaVoto,
    fantamedia: r.fantamedia,
    gol: r.gol,
    gol_subiti: r.golSubiti,
    rigori_segnati: r.rigoriSegnati,
    rigori_calciati: r.rigoriCalciati,
    rigori_parati: r.rigoriParati,
    assist: r.assist,
    ammonizioni: r.ammonizioni,
    espulsioni: r.espulsioni,
    updated_at: adesso,
  }));
  const agganciate = daScrivere.filter((r) => r.player_id).length;

  const problemi: string[] = [];
  for (let i = 0; i < daScrivere.length; i += 500) {
    const { error } = await supabaseAdmin().from('player_stats')
      .upsert(daScrivere.slice(i, i + 500), { onConflict: 'ext_id' });
    if (error) { problemi.push(error.message); break; }
  }
  if (agganciate / righe.length < 0.5) {
    problemi.push(`agganciate solo ${agganciate} statistiche su ${righe.length}: controlla gli id del listone`);
  }

  const e = { righe: righe.length, agganciate, problemi };
  await registra('statistiche', e);
  return e;
}

export interface Quotazione {
  qtAttuale: number;
  qtIniziale: number | null;
  fvm: number | null;
}

/** Le quotazioni aggiornate dei nostri giocatori, per id. */
export async function quotazioniAggiornate(): Promise<Map<string, Quotazione>> {
  const db = supabaseAdmin();
  const righe = await tutte<{ player_id: string; qt_attuale: number; qt_iniziale: number | null; fvm: number | null }>(
    (da, a) => db.from('player_prices')
      .select('player_id, qt_attuale, qt_iniziale, fvm').not('player_id', 'is', null).range(da, a),
  ).catch(() => []);
  return new Map(righe.map((r) => [r.player_id, {
    qtAttuale: Number(r.qt_attuale),
    qtIniziale: r.qt_iniziale == null ? null : Number(r.qt_iniziale),
    fvm: r.fvm == null ? null : Number(r.fvm),
  }]));
}

// =====================================================================
// i voti
// =====================================================================

export interface EsitoVoti extends EsitoFonte {
  giornate: number[];
}

/** Legge una pagina di voti e la scrive. */
async function raccogliGiornata(
  url: string, aggancia: ReturnType<typeof agganciatore>,
): Promise<{ giornata: number | null; stagione: string | null } & EsitoFonte> {
  const pagina = await scarica(url);
  if ('errore' in pagina) return { giornata: null, stagione: null, righe: 0, agganciate: 0, problemi: [pagina.errore] };

  const { giornata, stagione, righe } = leggiVoti(pagina.html);
  if (!giornata || !stagione) {
    return { giornata, stagione, righe: 0, agganciate: 0, problemi: [`${url}: non capisco di che giornata sia`] };
  }
  if (!righe.length) {
    return { giornata, stagione, righe: 0, agganciate: 0, problemi: [`giornata ${giornata}: nessun voto letto, la pagina è cambiata?`] };
  }
  // la pagina di una giornata non ancora giocata ha le righe ma non i voti;
  // e senza essere collegati la pagina può mostrarli vuoti. In entrambi i
  // casi non si scrive niente: una giornata di soli «senza voto» farebbe
  // sembrare panchinari tutti quanti
  const conVoto = righe.filter((r) => r.voto != null || r.fantavoto != null).length;
  if (conVoto < righe.length * 0.3) {
    return {
      giornata, stagione, righe: righe.length, agganciate: 0,
      problemi: [`giornata ${giornata}: solo ${conVoto} voti su ${righe.length} righe — non ancora giocata, o la pagina li nasconde a chi non è collegato (vedi FANTACALCIO_COOKIE)`],
    };
  }

  const adesso = new Date().toISOString();
  const daScrivere = righe.map((r) => ({
    stagione, giornata,
    ext_id: r.extId,
    player_id: aggancia(r),
    nome_fonte: r.nome,
    club_fonte: r.club,
    ruolo: r.ruolo,
    voto: r.voto,
    fantavoto: r.fantavoto,
    updated_at: adesso,
  }));
  const { error } = await supabaseAdmin().from('player_votes')
    .upsert(daScrivere, { onConflict: 'stagione,giornata,ext_id' });
  return {
    giornata, stagione, righe: righe.length,
    agganciate: daScrivere.filter((r) => r.player_id).length,
    problemi: error ? [error.message] : [],
  };
}

/**
 * L'ultima giornata, e qualche arretrata che ancora manca.
 *
 * La pagina senza indirizzo mostra l'ultima giornata giocata; quelle prima
 * hanno l'indirizzo `/<stagione>/<giornata>`. Si recuperano poche giornate
 * per volta, così un primo giro a stagione inoltrata non sfora il tempo del
 * cron: il resto arriva nei giorni dopo.
 */
export async function raccogliVoti(): Promise<EsitoVoti> {
  const aggancia = agganciatore(await nostriGiocatori());
  const ultima = await raccogliGiornata(VOTI, aggancia);
  const esito: EsitoVoti = {
    righe: ultima.righe, agganciate: ultima.agganciate,
    problemi: [...ultima.problemi], giornate: [],
  };
  if (ultima.giornata && ultima.righe && !ultima.problemi.length) esito.giornate.push(ultima.giornata);

  if (ultima.giornata && ultima.stagione) {
    const presenti = await giornateCoperte(ultima.stagione);
    const mancanti = Array.from({ length: ultima.giornata - 1 }, (_, i) => i + 1)
      .filter((g) => !presenti.includes(g))
      .reverse()
      .slice(0, RECUPERO_PER_GIRO);
    const slug = ultima.stagione.replace('/', '-');
    for (const g of mancanti) {
      const r = await raccogliGiornata(`${VOTI}/${slug}/${g}`, aggancia);
      esito.righe += r.righe;
      esito.agganciate += r.agganciate;
      esito.problemi.push(...r.problemi);
      if (r.righe && !r.problemi.length) esito.giornate.push(g);
    }
  }

  if (esito.righe && esito.agganciate / esito.righe < 0.5) {
    esito.problemi.push(`agganciati solo ${esito.agganciate} voti su ${esito.righe}: controlla gli id del listone`);
  }
  await registra('voti', esito, esito.giornate.length ? `giornate ${esito.giornate.join(', ')}` : undefined);
  return esito;
}

/**
 * Le giornate di cui abbiamo i voti di tutta la Serie A. Una giornata con
 * poche righe (un recupero letto a metà) non conta come coperta.
 */
export async function giornateCoperte(stagione = stagioneCorrente()): Promise<number[]> {
  const db = supabaseAdmin();
  // trentotto conteggi senza righe costano meno che leggere ventimila voti
  const conti = await Promise.all(Array.from({ length: 38 }, (_, i) => i + 1).map(async (g) => {
    const { count } = await db.from('player_votes')
      .select('ext_id', { count: 'exact', head: true })
      .eq('stagione', stagione).eq('giornata', g).not('voto', 'is', null);
    return { g, n: count ?? 0 };
  }));
  return conti.filter((c) => c.n >= 100).map((c) => c.g);
}

/**
 * La forma dei giocatori alla vigilia della giornata `prossima` di Serie A.
 *
 * Fonde le pagelle di Serie A con i tabellini della lega: per chi è stato
 * schierato vale il fantavoto della lega, calcolato con le nostre regole.
 * Senza `prossima` si guarda alla giornata dopo l'ultima con i voti.
 */
export async function formaGiocatori(
  leagueId: string, prossima?: number,
): Promise<{ forma: Map<string, Forma>; prossima: number | null }> {
  const db = supabaseAdmin();
  const stagione = stagioneCorrente();
  const coperte = await giornateCoperte(stagione).catch(() => [] as number[]);

  const lega = await tutte<{
    player_id: string; voto: number | null; fantavoto: number | null;
    fixtures: { competition: string; matchdays: { serie_a: number } | null } | null;
  }>((da, a) => db.from('lineup_entries')
    .select('player_id, voto, fantavoto, fixtures!inner(competition, matchdays(serie_a))')
    .eq('league_id', leagueId).not('player_id', 'is', null).range(da, a) as never,
  ).catch(() => []);

  const giornataLega = lega
    .map((r) => r.fixtures?.matchdays?.serie_a ?? null)
    .filter((g): g is number => g != null);
  const ultima = Math.max(0, ...coperte, ...giornataLega);
  const vigilia = prossima ?? (ultima ? ultima + 1 : null);
  if (!vigilia) return { forma: new Map(), prossima: null };

  const da = Math.max(1, vigilia - 6);
  const serieA = await tutte<{ player_id: string; giornata: number; voto: number | null; fantavoto: number | null }>(
    (x, y) => db.from('player_votes')
      .select('player_id, giornata, voto, fantavoto')
      .eq('stagione', stagione).not('player_id', 'is', null)
      .gte('giornata', da).lt('giornata', vigilia).range(x, y),
  ).catch(() => []);

  const per = new Map<string, { a: VotoGiornata[]; l: VotoGiornata[] }>();
  const di = (id: string) => {
    const x = per.get(id) ?? { a: [], l: [] };
    per.set(id, x);
    return x;
  };
  for (const r of serieA) {
    di(r.player_id).a.push({
      giornata: Number(r.giornata),
      voto: r.voto == null ? null : Number(r.voto),
      fantavoto: r.fantavoto == null ? null : Number(r.fantavoto),
    });
  }
  for (const r of lega) {
    const g = r.fixtures?.matchdays?.serie_a;
    // la coppa ripete gli stessi voti della domenica: basta il campionato
    if (g == null || g < da || g >= vigilia || r.fixtures?.competition !== 'campionato') continue;
    di(r.player_id).l.push({
      giornata: g,
      voto: r.voto == null ? null : Number(r.voto),
      fantavoto: r.fantavoto == null ? null : Number(r.fantavoto),
    });
  }

  const forma = new Map<string, Forma>();
  for (const [id, { a, l }] of per) {
    forma.set(id, formaGiocatore(fondiVoti(a, l), vigilia, coperte));
  }
  return { forma, prossima: vigilia };
}

export interface UltimaRaccolta {
  fetchedAt: string;
  righe: number;
  agganciate: number;
  nota: string | null;
}

/** Quando è stata letta l'ultima volta ciascuna pagina. */
export async function ultimeRaccolte(): Promise<Record<'quotazioni' | 'voti' | 'statistiche', UltimaRaccolta | null>> {
  const db = supabaseAdmin();
  const leggi = async (fonte: string) => {
    const { data } = await db.from('source_runs')
      .select('fetched_at, righe, agganciate, nota').eq('fonte', fonte)
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
    return data ? {
      fetchedAt: String(data.fetched_at), righe: Number(data.righe),
      agganciate: Number(data.agganciate), nota: (data.nota as string | null) ?? null,
    } : null;
  };
  const [quotazioni, voti, statistiche] = await Promise.all([leggi('quotazioni'), leggi('voti'), leggi('statistiche')]);
  return { quotazioni, voti, statistiche };
}
