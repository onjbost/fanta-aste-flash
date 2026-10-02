import 'server-only';

/**
 * Leghe Fantacalcio senza preferito — rete, token e scrittura.
 *
 * L'app parla con `apileague.fantacalcio.it` come fa il sito: due
 * intestazioni, la `app_key` (pubblica, è nel codice del sito) e il token di
 * sessione di un account della lega, che l'admin incolla in /admin/redazione.
 *
 * Tre cose, tutte senza intervento:
 *  - **le formazioni** della giornata in corso, per la diretta: si leggono
 *    quando qualcuno apre una partita e quelle vere non ci sono ancora;
 *  - **la giornata conclusa**: appena la lega l'ha calcolata, il cron la
 *    importa con lo stesso `importaGiornata` del preferito (stessi controlli,
 *    stessa chiusura delle schedine);
 *  - **le classifiche**, dentro lo stesso import.
 *
 * Il preferito resta dov'è, come ripiego: se l'API cambia o il token scade,
 * si torna a lui finché non si sistema.
 *
 * Il token non finisce mai in un messaggio d'errore né in un log.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { importaGiornata, type EsitoImport } from '@/lib/redazione/importaServer';
import type { PayloadImport, SfidaGrezza, TipoCompetizione } from '@/lib/redazione/tabellino';
import { liveGiornata } from '@/lib/live/liveServer';
import { allineaCalendario } from '@/lib/live/calendarioServer';
import { giornataPronta, giornoDelCalcolo, type PartitaCalendario } from './quando';
import {
  capitaniApi, classificaApi, risultatoApi, squadraApi, tipoApi, votoApi,
  type Anagrafica, type CompetizioneApi, type DettaglioApi, type TurnoApi,
} from './traduci';

const BASE = 'https://apileague.fantacalcio.it';
/**
 * Pubblica e uguale per tutti: sta nel codice del sito. Se un giorno cambia,
 * `LEGHE_APP_KEY` la sostituisce senza rilasciare l'app.
 */
const APP_KEY_SITO = 'ICiELOObd5DF5uJEATi77CRvHiiRuMU0';
/** Giornate concluse da importare per giro, al massimo: il cron ha un minuto. */
const GIORNATE_PER_GIRO = 2;

export class LegheNonCollegata extends Error {}

// =====================================================================
// il token
// =====================================================================

export interface InfoToken {
  legaId: number | null;
  scadeIl: string | null;
}

/** Cosa dice il token di sé: lega e scadenza. Senza verificarne la firma, che non è nostra. */
export function leggiToken(token: string): InfoToken {
  try {
    const parti = token.split('.');
    const json = JSON.parse(Buffer.from(parti[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return {
      legaId: json.l_id != null ? Number(json.l_id) : null,
      scadeIl: json.exp ? new Date(Number(json.exp) * 1000).toISOString() : null,
    };
  } catch {
    return { legaId: null, scadeIl: null };
  }
}

async function tokenAttuale(): Promise<string> {
  const { data } = await supabaseAdmin().from('leghe_accesso').select('token').eq('id', 1).maybeSingle();
  const token = (data?.token as string | undefined) ?? process.env.LEGHE_TOKEN;
  if (!token) throw new LegheNonCollegata('Leghe Fantacalcio non è collegata: incolla il token in /admin/redazione.');
  return token;
}

/** Lo stato del collegamento, per la pagina dell'admin. Mai il token. */
export async function statoCollegamento(): Promise<(InfoToken & { aggiornatoIl: string | null; daEnv: boolean }) | null> {
  const { data } = await supabaseAdmin().from('leghe_accesso')
    .select('lega_id, scade_il, aggiornato_il').eq('id', 1).maybeSingle();
  if (data) {
    return {
      legaId: data.lega_id == null ? null : Number(data.lega_id),
      scadeIl: (data.scade_il as string | null) ?? null,
      aggiornatoIl: data.aggiornato_il as string,
      daEnv: false,
    };
  }
  if (process.env.LEGHE_TOKEN) return { ...leggiToken(process.env.LEGHE_TOKEN), aggiornatoIl: null, daEnv: true };
  return null;
}

/** Salva un token nuovo, dopo averlo provato con una lettura vera. */
export async function salvaToken(grezzo: string): Promise<{ ok: true; info: InfoToken; competizioni: string[] } | { ok: false; errore: string }> {
  const token = grezzo.trim().replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '');
  if (token.split('.').length !== 3) return { ok: false, errore: 'non sembra un token: dovrebbe essere tre pezzi separati da punti' };
  const info = leggiToken(token);
  if (info.scadeIl && Date.parse(info.scadeIl) < Date.now()) return { ok: false, errore: `questo token è già scaduto (${info.scadeIl.slice(0, 10)})` };

  let competizioni: CompetizioneApi[];
  try {
    competizioni = await chiedi<CompetizioneApi[]>('/onboarding/v1/league/competitions', token);
  } catch (e) {
    return { ok: false, errore: (e as Error).message };
  }
  const { error } = await supabaseAdmin().from('leghe_accesso').upsert({
    id: 1, token, lega_id: info.legaId, scade_il: info.scadeIl, aggiornato_il: new Date().toISOString(),
  });
  if (error) return { ok: false, errore: error.message };
  return { ok: true, info, competizioni: (competizioni ?? []).filter((c) => !c.del).map((c) => c.name) };
}

// =====================================================================
// la rete
// =====================================================================

async function chiedi<T>(percorso: string, token?: string, invio?: { metodo: 'POST'; corpo: unknown }): Promise<T> {
  const t = token ?? await tokenAttuale();
  let res: Response;
  try {
    res = await fetch(`${BASE}${percorso}`, {
      method: invio?.metodo ?? 'GET',
      headers: {
        app_key: process.env.LEGHE_APP_KEY || APP_KEY_SITO,
        authorization: `Bearer ${t}`,
        accept: 'application/json',
        ...(invio ? { 'content-type': 'application/json' } : {}),
      },
      body: invio ? JSON.stringify(invio.corpo) : undefined,
      // il calcolo di una giornata può prendersi qualche secondo in più
      signal: AbortSignal.timeout(invio ? 40_000 : 15_000),
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(`Leghe Fantacalcio non risponde (${(e as Error).name})`);
  }
  if (res.status === 401) {
    const codice = await res.json().then((b) => (b as { code?: string })?.code).catch(() => undefined);
    throw new Error(codice === 'ATH007'
      ? 'Leghe Fantacalcio ha rifiutato la app_key: è cambiata, va aggiornata (LEGHE_APP_KEY)'
      : 'Leghe Fantacalcio ha rifiutato il token: è scaduto o non è più valido, incollane uno nuovo in /admin/redazione');
  }
  if (!res.ok) throw new Error(`Leghe Fantacalcio ha risposto ${res.status} a ${percorso.split('/').slice(0, 4).join('/')}`);
  return await res.json() as T;
}

// =====================================================================
// il calcolo della giornata
// =====================================================================

/**
 * Preme «Calcola giornata» su Leghe Fantacalcio, come fa il sito:
 * `POST /gaming/v1/calcola` con la competizione e la giornata della lega.
 * Serve il token di un amministratore della lega.
 *
 * La lega risponde `CALOK` quando ha finito. Se un giorno rispondesse in
 * modo asincrono (`asyn` con un `jobId`) lo si dice: la giornata si leggerà
 * al giro dopo, quando risulterà calcolata.
 */
export async function calcolaGiornata(compId: number, giornata: number): Promise<{ ok: boolean; messaggio: string }> {
  const r = await chiedi<{ asyn?: boolean; jobId?: unknown; res?: { code?: string; message?: string } }>(
    '/gaming/v1/calcola', undefined,
    { metodo: 'POST', corpo: { idcomp: compId, mday: giornata, tmids: [], bonus: [] } },
  );
  if (r.res?.code === 'CALOK') return { ok: true, messaggio: 'calcolata' };
  if (r.asyn) return { ok: false, messaggio: 'il calcolo è partito in differita: la leggo al prossimo giro' };
  return { ok: false, messaggio: `la lega ha risposto ${r.res?.code ?? '?'}: ${r.res?.message ?? 'senza spiegazioni'}` };
}

/**
 * Si può calcolare? Solo se il live dice che tutte le partite della giornata
 * di Serie A sono finite (le rinviate non si aspettano). Senza live non si
 * calcola: meglio un giorno di ritardo che una giornata calcolata a metà.
 */
async function partiteFinite(serieA: number): Promise<{ ok: boolean; perche: string }> {
  const live = await liveGiornata(serieA);
  if (!('partite' in live) || !live.partite.length) {
    return { ok: false, perche: 'non riesco a leggere il live per sapere se le partite sono finite' };
  }
  const aperte = live.partite.filter((p) => p.status !== 4 && p.status !== 6);
  if (aperte.length) {
    return { ok: false, perche: `ci sono ancora ${aperte.length} partite non finite (${aperte.map((p) => `${p.teamHome}-${p.teamAway}`).join(', ')})` };
  }
  return { ok: true, perche: '' };
}

/** Il calcolo automatico si spegne con LEGHE_CALCOLO_AUTOMATICO=no. */
export function calcoloAutomaticoAcceso(): boolean {
  return !/^(no|off|false|0)$/i.test(process.env.LEGHE_CALCOLO_AUTOMATICO ?? '');
}

interface SquadraLega { id: number; n?: string; nu?: string }

async function squadreLega(): Promise<Map<number, { nome: string; allenatore: string }>> {
  const body = await chiedi<{ data?: SquadraLega[] }>('/onboarding/v1/league/teams?page=1&pageSize=50');
  return new Map((body.data ?? []).map((t) => [Number(t.id), { nome: String(t.n ?? t.id), allenatore: String(t.nu ?? '') }]));
}

async function competizioniLega(): Promise<(CompetizioneApi & { tipo: TipoCompetizione })[]> {
  const lista = await chiedi<CompetizioneApi[]>('/onboarding/v1/league/competitions');
  return (lista ?? []).filter((c) => !c.del).map((c) => ({ ...c, tipo: tipoApi(c) }));
}

async function calendario(compId: number): Promise<TurnoApi[]> {
  const body = await chiedi<TurnoApi[]>(`/onboarding/v1/league/competition/calendar/${compId}`);
  return Array.isArray(body) ? body : [];
}

async function dettaglio(compId: number, mday: number, cmday: number, casa: number, ospite: number): Promise<DettaglioApi> {
  return chiedi<DettaglioApi>(`/gaming/v1/teamLineup/${compId}/${mday}/${cmday}/${casa}/${ospite}`);
}

// =====================================================================
// i nostri dati
// =====================================================================

const normalizza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function lega(): Promise<string> {
  const { data } = await supabaseAdmin().from('leagues').select('id').limit(1).single();
  return data!.id as string;
}

async function anagrafica(leagueId: string): Promise<Map<string, Anagrafica & { id: string }>> {
  const db = supabaseAdmin();
  const esito = new Map<string, Anagrafica & { id: string }>();
  for (let da = 0; ; da += 1000) {
    const { data } = await db.from('players').select('id, ext_id, name, role')
      .eq('league_id', leagueId).range(da, da + 999);
    (data ?? []).forEach((p) => esito.set(String(p.ext_id), { id: p.id as string, nome: p.name as string, ruolo: p.role as Anagrafica['ruolo'] }));
    if (!data || data.length < 1000) return esito;
  }
}

async function registra(fonte: 'formazioni' | 'giornata', righe: number, nota: string | null) {
  await supabaseAdmin().from('source_runs').insert({ fonte, righe, agganciate: righe, nota });
}

// =====================================================================
// le formazioni della giornata in corso
// =====================================================================

export interface EsitoFormazioni { sfide: number; problemi: string[] }

/**
 * Le formazioni vere di una giornata di Serie A, per la diretta.
 *
 * Si scrivono in `lineup_entries` con gli stessi slot del tabellino (titolari
 * 1-11, panchina dal 101), senza voti: quando poi arriva la giornata
 * conclusa, l'import riscrive le stesse righe con tutto il resto. Le righe
 * di una sfida già chiusa non si toccano.
 */
export async function importaFormazioni(serieA: number): Promise<EsitoFormazioni> {
  const db = supabaseAdmin();
  const leagueId = await lega();
  const problemi: string[] = [];

  const [comps, squadre, anag, { data: nostre }, { data: md }] = await Promise.all([
    competizioniLega(), squadreLega(), anagrafica(leagueId),
    db.from('teams').select('id, name').eq('league_id', leagueId),
    db.from('matchdays').select('id').eq('league_id', leagueId).eq('serie_a', serieA).maybeSingle(),
  ]);
  if (!md) return { sfide: 0, problemi: [`la giornata ${serieA} di Serie A non è nel nostro calendario`] };

  const perNome = new Map((nostre ?? []).map((t) => [normalizza(t.name as string), t.id as string]));
  const nostroId = (tid: number) => perNome.get(normalizza(squadre.get(tid)?.nome ?? ''));
  const { data: fixtures } = await db.from('fixtures')
    .select('id, competition, home_team_id, away_team_id, home_goals').eq('matchday_id', md.id);

  let sfide = 0;
  for (const c of comps) {
    const turno = (await calendario(c.id)).find((t) => t.championshipMatchDay === serieA);
    if (!turno) continue;
    for (const p of turno.matches ?? []) {
      const casa = nostroId(p.tIdH);
      const ospite = nostroId(p.tIdA);
      const f = (fixtures ?? []).find((x) => x.competition === c.tipo && x.home_team_id === casa && x.away_team_id === ospite);
      if (!casa || !ospite || !f) {
        problemi.push(`${squadre.get(p.tIdH)?.nome ?? p.tIdH} – ${squadre.get(p.tIdA)?.nome ?? p.tIdA}: non la trovo nel nostro calendario`);
        continue;
      }
      if (f.home_goals != null) continue;          // già chiusa: comanda il tabellino

      let d: DettaglioApi;
      try { d = await dettaglio(c.id, turno.matchDay, serieA, p.tIdH, p.tIdA); }
      catch (e) { problemi.push((e as Error).message); continue; }

      for (const [lato, teamId] of [[d.home, casa], [d.away, ospite]] as const) {
        const starts = lato?.starts ?? [];
        if (starts.length < 11) continue;            // formazione non ancora visibile
        const { c: capo, v: vice } = capitaniApi(lato.capt);
        const righe = [
          ...starts.map((r, i) => ({ r, slot: i + 1, starter: true })),
          ...(lato.bench ?? []).map((r, i) => ({ r, slot: 101 + i, starter: false })),
        ].map(({ r, slot, starter }) => {
          const a = anag.get(String(r.pid));
          return {
            league_id: leagueId, fixture_id: f.id, team_id: teamId, slot,
            player_name: a?.nome ?? `#${r.pid}`, player_id: a?.id ?? null,
            role: a?.ruolo ?? null, starter, entered: false,
            is_captain: starter && r.pid === capo, is_vice: starter && r.pid === vice,
            voto: votoApi(r.scr), fantavoto: null, bonus: {}, counted: false,
          };
        });
        // una formazione cambiata prima della scadenza può avere meno riserve
        await db.from('lineup_entries').delete().eq('fixture_id', f.id).eq('team_id', teamId);
        let { error } = await db.from('lineup_entries').insert(righe);
        if (error && /is_vice/.test(error.message)) {
          ({ error } = await db.from('lineup_entries').insert(righe.map(({ is_vice: _v, ...x }) => { void _v; return x; })));
        }
        if (error) problemi.push(error.message);
      }
      sfide++;
    }
  }
  await registra('formazioni', sfide, problemi.join(' · ') || null);
  return { sfide, problemi };
}

/** Quando sono state lette l'ultima volta le formazioni, per non chiederle a ogni pagina aperta. */
export async function formazioniLetteDaPoco(minuti = 3): Promise<boolean> {
  const { data } = await supabaseAdmin().from('source_runs').select('fetched_at')
    .eq('fonte', 'formazioni').order('fetched_at', { ascending: false }).limit(1).maybeSingle();
  return !!data && Date.now() - Date.parse(data.fetched_at as string) < minuti * 60_000;
}

// =====================================================================
// la giornata conclusa e le classifiche
// =====================================================================

export interface EsitoGiornate {
  importate: { competizione: TipoCompetizione; giornata: number; esito: EsitoImport }[];
  problemi: string[];
  /** giornate ancora da aspettare, con il giorno in cui si leggeranno */
  inAttesa: { serieA: number; giorno: string }[];
  /** giornate che l'app ha calcolato su Leghe Fantacalcio */
  calcolate: { competizione: TipoCompetizione; giornata: number }[];
}

/**
 * Le partite di una giornata di Serie A con le date di adesso.
 *
 * Prima il live di fantacalcio.it, che ha il calendario aggiornato (anticipi,
 * posticipi, rinvii); se non risponde, il nostro `serie_a_fixtures`.
 */
export async function calendarioSerieA(serieA: number): Promise<PartitaCalendario[]> {
  const live = await liveGiornata(serieA);
  if ('partite' in live && live.partite.length) {
    await allineaCalendario(serieA, live.partite).catch(() => null);
    return live.partite.map((p) => ({ kickoff: p.matchDate || null, rinviata: p.status === 6 }));
  }
  const db = supabaseAdmin();
  const { data } = await db.from('serie_a_fixtures')
    .select('kickoff_at, status, matchdays!inner(serie_a)').eq('matchdays.serie_a', serieA);
  return (data ?? []).map((r) => ({
    kickoff: r.kickoff_at ? Date.parse(r.kickoff_at as string) : null,
    rinviata: r.status === 'postponed',
  }));
}

export interface OpzioniImport {
  /**
   * Il giro automatico: una giornata si legge solo dal giorno dopo la sua
   * ultima partita di Serie A. Il pulsante manuale non aspetta.
   */
  aspettaIlCalcolo?: boolean;
  /**
   * Rileggi questa giornata anche se l'abbiamo già: per un ricalcolo fatto
   * dalla lega in un secondo momento.
   */
  forza?: { tipo: TipoCompetizione; giornata: number };
  /**
   * Se la giornata non è ancora calcolata, premi tu «Calcola giornata» su
   * Leghe Fantacalcio (solo a partite finite). Con `forza`, ricalcola anche
   * una giornata già calcolata.
   */
  calcola?: boolean;
}

/**
 * Importa le giornate che la lega ha calcolato e noi non abbiamo ancora.
 *
 * Una giornata è «nostra» quando le sue sfide hanno già un risultato. Le
 * altre, se la lega le dà per calcolate, si traducono nella forma del
 * preferito e passano da `importaGiornata`: è lui che verifica i conti,
 * scrive tabellino e classifiche e chiude le schedine.
 */
export async function importaGiornateConcluse(opt: OpzioniImport = {}): Promise<EsitoGiornate> {
  const db = supabaseAdmin();
  const leagueId = await lega();
  const esito: EsitoGiornate = { importate: [], problemi: [], inAttesa: [], calcolate: [] };
  const pronte = new Map<number, boolean>();
  // le giornate non ancora cominciate non sono pronte: niente rete per saperlo
  const { data: inizi } = await db.from('matchdays').select('serie_a, first_kickoff_at').eq('league_id', leagueId);
  const inizio = new Map((inizi ?? []).map((m) => [Number(m.serie_a), Date.parse(m.first_kickoff_at as string)]));
  const pronta = async (serieA: number) => {
    if ((inizio.get(serieA) ?? Infinity) > Date.now()) return false;
    if (!pronte.has(serieA)) {
      const cal = await calendarioSerieA(serieA);
      const ok = giornataPronta(cal, Date.now());
      pronte.set(serieA, ok);
      const giorno = giornoDelCalcolo(cal);
      if (!ok && giorno) esito.inAttesa.push({ serieA, giorno });
    }
    return pronte.get(serieA)!;
  };

  const [comps, squadre, anag] = await Promise.all([competizioniLega(), squadreLega(), anagrafica(leagueId)]);
  const nomi = new Map([...squadre].map(([id, s]) => [id, s.nome]));

  // i gironi di coppa, dal nostro calendario
  const { data: nostre } = await db.from('teams').select('id, name').eq('league_id', leagueId);
  const { data: gironi } = await db.from('fixtures').select('home_team_id, away_team_id, group_name')
    .eq('league_id', leagueId).eq('competition', 'coppa').not('group_name', 'is', null);
  const nomeNostro = new Map((nostre ?? []).map((t) => [t.id as string, normalizza(t.name as string)]));
  const tidDi = new Map([...squadre].map(([tid, s]) => [normalizza(s.nome), tid]));
  const perGruppo = new Map<string, Set<number>>();
  for (const g of gironi ?? []) {
    for (const id of [g.home_team_id, g.away_team_id]) {
      const tid = tidDi.get(nomeNostro.get(id as string) ?? '');
      if (tid == null) continue;
      const s = perGruppo.get(g.group_name as string) ?? new Set<number>();
      s.add(tid);
      perGruppo.set(g.group_name as string, s);
    }
  }

  for (const c of comps) {
    let turni: TurnoApi[];
    try { turni = await calendario(c.id); }
    catch (e) { esito.problemi.push((e as Error).message); continue; }

    // dal calendario di adesso: dopo un calcolo fatto qui, i punti sono cambiati
    const classifiche = () => (c.tipo === 'coppa' && perGruppo.size
      ? [...perGruppo].map(([nome, sq]) => classificaApi(turni, nomi, { id: c.id, nome: c.name, tipo: c.tipo }, { nome, squadre: sq }))
      : [classificaApi(turni, nomi, { id: c.id, nome: c.name, tipo: c.tipo })]);

    for (let t of [...turni]) {
      const forzata = opt.forza?.tipo === c.tipo && opt.forza.giornata === t.matchDay;
      if (opt.forza && !forzata) continue;
      if (!forzata) {
        if (esito.importate.length >= GIORNATE_PER_GIRO) break;
        if (await giaNostra(leagueId, c.tipo, t)) continue;
        if (opt.aspettaIlCalcolo && !await pronta(t.championshipMatchDay)) continue;
      }
      const quale = c.tipo === 'coppa' ? `il ${t.matchDay}° turno di coppa` : `la giornata ${t.matchDay}`;
      const daCalcolare = opt.calcola && (!t.calculated || forzata);
      if (daCalcolare) {
        // «Calcola giornata» su Leghe Fantacalcio, ma solo a partite finite
        const finite = await partiteFinite(t.championshipMatchDay);
        if (!finite.ok) { esito.problemi.push(`${quale}: non la calcolo, ${finite.perche}`); continue; }
        let calcolo: { ok: boolean; messaggio: string };
        try { calcolo = await calcolaGiornata(c.id, t.matchDay); }
        catch (e) { esito.problemi.push(`${quale}: calcolo non riuscito, ${(e as Error).message}`); continue; }
        if (!calcolo.ok) { esito.problemi.push(`${quale}: ${calcolo.messaggio}`); continue; }
        esito.calcolate.push({ competizione: c.tipo, giornata: t.matchDay });
        // si rilegge il calendario: i punti e i risultati sono cambiati
        const nuovo = (await calendario(c.id)).find((x) => x.matchDay === t.matchDay);
        if (!nuovo?.calculated) { esito.problemi.push(`${quale}: calcolata, ma la lega non la dà ancora per calcolata`); continue; }
        t = nuovo;
        turni = turni.map((x) => (x.matchDay === nuovo.matchDay ? nuovo : x));
      } else if (!t.calculated) {
        // il giorno è arrivato (o l'hai chiesta tu) ma la lega non ha ancora
        // calcolato: lo si dice, e si riprova al giro dopo
        if (forzata || opt.aspettaIlCalcolo) {
          esito.problemi.push(`${quale} (Serie A ${t.championshipMatchDay}) è finita ma su Leghe Fantacalcio non risulta ancora calcolata`);
        }
        continue;
      }

      const sfide: SfidaGrezza[] = [];
      for (const [i, p] of (t.matches ?? []).entries()) {
        try {
          const d = await dettaglio(c.id, t.matchDay, t.championshipMatchDay, p.tIdH, p.tIdA);
          const ris = risultatoApi(p.result ?? d.res) ?? [0, 0];
          const chi = (tid: number) => squadre.get(tid) ?? { nome: String(tid), allenatore: '' };
          sfide.push({
            indice: i,
            dati: {
              casa: squadraApi(d.home, ris[0], chi(p.tIdH), anag),
              ospite: squadraApi(d.away, ris[1], chi(p.tIdA), anag),
            },
          });
        } catch (e) {
          sfide.push({ indice: i, dati: { errore: (e as Error).message } });
        }
      }

      const payload: PayloadImport = {
        lega: `api:${c.id}`,
        competizione: String(c.id),
        competizioneNome: c.name,
        tipo: c.tipo,
        giornata: t.matchDay,
        raccoltoIl: new Date().toISOString(),
        // sopra le versioni del preferito: nell'archivio si distingue da dove viene
        versioneEstrattore: 100,
        classifiche: classifiche(),
        sfide,
      };
      try {
        esito.importate.push({ competizione: c.tipo, giornata: t.matchDay, esito: await importaGiornata(payload) });
      } catch (e) {
        esito.problemi.push(`${c.name}, giornata ${t.matchDay}: ${(e as Error).message}`);
      }
    }
  }
  if (opt.forza && !esito.importate.length && !esito.problemi.length) {
    esito.problemi.push(`${opt.forza.tipo === 'coppa' ? 'turno di coppa' : 'giornata'} ${opt.forza.giornata}: non la trovo nel calendario della lega`);
  }
  await registra('giornata', esito.importate.length, esito.problemi.join(' · ') || null);
  return esito;
}

/** Abbiamo già i risultati di questo turno? */
async function giaNostra(leagueId: string, tipo: TipoCompetizione, t: TurnoApi): Promise<boolean> {
  const db = supabaseAdmin();
  let q = db.from('fixtures').select('home_goals, matchdays!inner(fanta, serie_a)')
    .eq('league_id', leagueId).eq('competition', tipo);
  q = tipo === 'coppa'
    ? q.eq('round_number', t.matchDay)
    : q.eq('matchdays.fanta', t.matchDay);
  const { data } = await q;
  // se il turno non c'è nel nostro calendario non c'è niente da importare
  if (!data?.length) return true;
  return data.every((f) => f.home_goals != null);
}

// =====================================================================
// PROVA DEL CRON — temporaneo, da togliere dopo il collaudo
// =====================================================================

export interface PassoProva { nome: string; esito: 'ok' | 'ko' | 'info'; dettaglio: string }

/**
 * Il giro del cron su una giornata scelta, passo per passo.
 *
 * Fa esattamente quello che fa il cron — controllo delle partite finite,
 * «Calcola giornata» su Leghe Fantacalcio, verifica, import — saltando solo
 * i due filtri che impedirebbero di provarlo su una giornata passata: la
 * data (il giorno dopo l'ultima partita) e il «già importata». Quei due li
 * mostra comunque, come informazione.
 */
export async function provaCron(tipo: TipoCompetizione, giornata: number): Promise<PassoProva[]> {
  const passi: PassoProva[] = [];
  const passo = (nome: string, esito: PassoProva['esito'], dettaglio: string) => passi.push({ nome, esito, dettaglio });

  try {
    const comp = (await competizioniLega()).find((c) => c.tipo === tipo);
    if (!comp) { passo('Competizione', 'ko', `nessuna competizione di tipo ${tipo} sulla lega`); return passi; }
    passo('Competizione', 'ok', `${comp.name} (id ${comp.id})`);

    const turno = (await calendario(comp.id)).find((t) => t.matchDay === giornata);
    if (!turno) { passo('Giornata sulla lega', 'ko', `la giornata ${giornata} non è nel calendario della lega`); return passi; }
    passo('Giornata sulla lega', 'info',
      `giornata ${giornata} = ${turno.championshipMatchDay}ª di Serie A · ${turno.calculated ? 'risulta GIÀ calcolata' : 'NON risulta calcolata'}`);

    const cal = await calendarioSerieA(turno.championshipMatchDay);
    const giorno = giornoDelCalcolo(cal);
    passo('Quando la leggerebbe il cron', 'info', giorno
      ? `dal ${giorno} (giorno dopo l'ultima partita) · oggi ${giornataPronta(cal, Date.now()) ? 'il cron procederebbe' : 'il cron aspetterebbe'}`
      : 'il calendario non ha date: il cron non procederebbe');

    const finite = await partiteFinite(turno.championshipMatchDay);
    if (!finite.ok) { passo('Partite finite (live)', 'ko', finite.perche); return passi; }
    passo('Partite finite (live)', 'ok', 'tutte le partite non rinviate risultano finite');

    if (turno.calculated) {
      passo('Calcolo su Leghe', 'info', 'già calcolata: il cron non la ricalcolerebbe. Annulla il calcolo sulla lega per provare anche questo passo.');
    } else {
      const r = await calcolaGiornata(comp.id, giornata);
      if (!r.ok) { passo('Calcolo su Leghe', 'ko', r.messaggio); return passi; }
      passo('Calcolo su Leghe', 'ok', 'la lega ha risposto CALOK');
      const dopo = (await calendario(comp.id)).find((t) => t.matchDay === giornata);
      if (!dopo?.calculated) { passo('Verifica del calcolo', 'ko', 'la lega non la dà ancora per calcolata'); return passi; }
      passo('Verifica del calcolo', 'ok', 'la giornata ora risulta calcolata');
    }

    const imp = await importaGiornateConcluse({ forza: { tipo, giornata } });
    const fatta = imp.importate[0];
    if (!fatta) { passo('Import nella nostra app', 'ko', imp.problemi.join(' · ') || 'non importata'); return passi; }
    const e = fatta.esito;
    passo('Import nella nostra app', e.problemi.length ? 'info' : 'ok',
      `${e.sfideScritte}/${e.sfideLette} sfide scritte · ${e.giocatori} giocatori (${e.agganciati} agganciati) · `
      + `${e.classificheScritte} classifiche`
      + (e.schedine ? ` · schedine: ${e.schedine.schedine} chiuse` : '')
      + (e.problemi.length ? ` — ${e.problemi.join(' · ')}` : ''));
  } catch (err) {
    passo('Errore', 'ko', (err as Error).message);
  }
  return passi;
}
