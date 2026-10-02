import 'server-only';

/**
 * La diretta — dal live di fantacalcio.it alla partita del fanta.
 *
 * Il live è un file protobuf per giornata, dietro un indirizzo firmato:
 * prima si chiede la firma a `/api/v1/SignedUri`, poi si scarica il file.
 * È lo stesso giro che fa il sito nel browser, ricostruito da
 * andregri/fantacalcio-voti-live-js. La decodifica sta in `protobuf.ts`, i
 * conti in `calcolo.ts`; qui solo rete, cache e database.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { stessoClub } from '@/lib/fonti/pagine';
import { formazioniProbabili } from '@/lib/tipsterServer';
import { eventiSconosciuti, squadraLive, type Schierato, type SquadraLive } from './calcolo';
import { decodificaLive, type PartitaLive } from './protobuf';

/**
 * L'id di stagione dell'API: 18 era il 2023/24, e sale di uno l'anno.
 * `FANTACALCIO_SEASON_ID` lo forza se un giorno il conto non torna.
 */
export function idStagione(oggi = new Date()): number {
  const forzato = Number(process.env.FANTACALCIO_SEASON_ID);
  if (Number.isInteger(forzato) && forzato > 0) return forzato;
  const inizio = oggi.getUTCMonth() >= 6 ? oggi.getUTCFullYear() : oggi.getUTCFullYear() - 1;
  return inizio - 2005;
}

const UA = 'Mozilla/5.0 (compatible; FantaMansarda/1.0)';

/**
 * Le partite di una giornata, col minuto e i voti di adesso.
 *
 * Una cache di cinquanta secondi per istanza: otto allenatori che guardano
 * la stessa diretta fanno una richiesta al sito, non otto. Il sito stesso
 * aggiorna il live più o meno al minuto.
 */
const cache = new Map<number, { at: number; partite: PartitaLive[] }>();

/**
 * La formazione probabile costa la lettura di tutte le rose e della forma:
 * si tiene dieci minuti, perché la diretta si rilegge ogni minuto e la
 * probabile in dieci minuti non cambia.
 */
const cacheProbabili = new Map<number, { at: number; valore: Awaited<ReturnType<typeof formazioniProbabili>> }>();

export async function liveGiornata(serieA: number): Promise<{ partite: PartitaLive[] } | { errore: string }> {
  const c = cache.get(serieA);
  if (c && Date.now() - c.at < 50_000) return { partite: c.partite };

  const risorsa = `https://api.fantacalcio.it/v1/st/${idStagione()}/matches/live/${serieA}.dat`;
  try {
    const firma = await fetch('https://www.fantacalcio.it/api/v1/SignedUri', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: '*/*',
        origin: 'https://www.fantacalcio.it', 'user-agent': UA,
      },
      body: JSON.stringify({ resourcesUri: [risorsa] }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!firma.ok) return { errore: `la firma del live ha risposto ${firma.status}` };
    const json = await firma.json() as Record<string, {
      errors?: { statusCode: number; message: string }[];
      resources?: { signedUri: string }[];
    }>;
    const voce = Object.values(json)[0];
    if (voce?.errors?.length) return { errore: `il live non è disponibile: ${voce.errors[0].message}` };
    const url = voce?.resources?.[0]?.signedUri;
    if (!url) return { errore: 'il live non ha dato un indirizzo' };

    const file = await fetch(url, {
      headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000), cache: 'no-store',
    });
    if (!file.ok) return { errore: `il file del live ha risposto ${file.status}` };
    const partite = decodificaLive(new Uint8Array(await file.arrayBuffer()));
    cache.set(serieA, { at: Date.now(), partite });
    return { partite };
  } catch (e) {
    return { errore: `non sono riuscito a leggere il live: ${(e as Error).message}` };
  }
}

export interface LatoDiretta {
  teamId: string;
  nome: string;
  stemma: string | null;
  /** «lega»: la formazione vera importata; «probabile»: quella stimata dall'app */
  fonte: 'lega' | 'probabile';
  live: SquadraLive;
}

export interface Diretta {
  fixtureId: string;
  titolo: string;
  serieA: number;
  kickoff: string;
  /** risultato ufficiale, se la giornata è già stata chiusa */
  ufficiale: { casa: number; ospite: number } | null;
  casa: LatoDiretta;
  ospite: LatoDiretta;
  serieAPartite: { casa: string; ospite: string; gol: string; stato: string }[];
  sconosciuti: number[];
  errore: string | null;
  aggiornatoIl: string;
}

const STATO: Record<number, string> = {
  0: 'da giocare', 1: '1° tempo', 2: 'intervallo', 3: '2° tempo', 4: 'finita', 5: 'sospesa', 6: 'rinviata',
};

/** La formazione vera, se la lega l'ha già fatta importare per questa giornata. */
async function formazioneDellaLega(fixtureId: string, matchdayId: string, teamId: string): Promise<Schierato[] | null> {
  const db = supabaseAdmin();
  const leggi = async (ids: string[]) => {
    const campi = 'slot, player_name, player_id, role, starter, is_captain, players(ext_id, club)';
    const conVice = await db.from('lineup_entries')
      .select(`${campi}, is_vice`).in('fixture_id', ids).eq('team_id', teamId).order('slot');
    if (!conVice.error) return (conVice.data ?? []) as Record<string, unknown>[];
    // senza la migrazione 0031 il vice non c'è: si legge il resto
    const { data } = await db.from('lineup_entries')
      .select(campi).in('fixture_id', ids).eq('team_id', teamId).order('slot');
    return (data ?? []) as Record<string, unknown>[];
  };
  let righe = await leggi([fixtureId]);
  if (!righe.length) {
    // in coppa la formazione è la stessa del campionato di quella giornata
    const { data: altre } = await db.from('fixtures').select('id').eq('matchday_id', matchdayId);
    righe = await leggi((altre ?? []).map((f) => f.id as string));
  }
  if (!righe.length) return null;
  // da più sfide della stessa giornata le righe arrivano doppie: una per slot
  const perSlot = new Map(righe.map((r) => [Number(r.slot), r]));
  return [...perSlot.values()]
    .map((r) => {
      const p = r.players as unknown as { ext_id: string; club: string } | null;
      return {
        playerId: (r.player_id as string | null) ?? null,
        extId: p?.ext_id ?? null,
        nome: String(r.player_name),
        ruolo: (r.role ?? 'C') as Schierato['ruolo'],
        club: p?.club ?? '',
        titolare: Boolean(r.starter),
        ordine: Number(r.slot),
        fascia: r.is_captain ? 'C' as const : r.is_vice ? 'V' as const : null,
      };
    });
}

export async function diretta(fixtureId: string, leagueId: string): Promise<Diretta | null> {
  const db = supabaseAdmin();
  const { data: f } = await db.from('fixtures')
    .select('id, league_id, matchday_id, competition, phase, home_team_id, away_team_id, home_goals, away_goals, matchdays(serie_a, fanta, first_kickoff_at), casa:home_team_id(name, logo_url), ospite:away_team_id(name, logo_url)')
    .eq('id', fixtureId).maybeSingle();
  if (!f || f.league_id !== leagueId || !f.home_team_id || !f.away_team_id) return null;

  const md = f.matchdays as unknown as { serie_a: number; fanta: number | null; first_kickoff_at: string };
  const casaT = f.casa as unknown as { name: string; logo_url: string | null };
  const ospiteT = f.ospite as unknown as { name: string; logo_url: string | null };

  const leggiFormazioni = () => Promise.all([
    formazioneDellaLega(fixtureId, f.matchday_id as string, f.home_team_id as string),
    formazioneDellaLega(fixtureId, f.matchday_id as string, f.away_team_id as string),
  ]);
  const [live, prime] = await Promise.all([liveGiornata(md.serie_a), leggiFormazioni()]);
  let [fCasa, fOspite] = prime;

  /*
   * Le formazioni vere, se mancano, si vanno a prendere su Leghe Fantacalcio
   * adesso: a giornata cominciata sono visibili a tutti i membri della lega.
   * Al massimo una volta ogni tre minuti, chiunque apra la pagina; e se la
   * lega non è collegata o non risponde, si resta sulla probabile.
   */
  if ((!fCasa || !fOspite) && Date.parse(md.first_kickoff_at) <= Date.now()) {
    try {
      const { formazioniLetteDaPoco, importaFormazioni } = await import('@/lib/leghe/legheServer');
      if (!await formazioniLetteDaPoco()) {
        await importaFormazioni(md.serie_a);
        [fCasa, fOspite] = await leggiFormazioni();
      }
    } catch { /* niente collegamento: resta la formazione probabile */ }
  }

  // la formazione probabile solo se serve: costa la lettura di tutte le rose
  let probabili: Awaited<ReturnType<typeof formazioniProbabili>> | null = null;
  const probabile = async (teamId: string): Promise<Schierato[]> => {
    if (!probabili) {
      const c = cacheProbabili.get(md.serie_a);
      if (c && Date.now() - c.at < 10 * 60_000) probabili = c.valore;
      else {
        probabili = await formazioniProbabili(leagueId, md.serie_a);
        cacheProbabili.set(md.serie_a, { at: Date.now(), valore: probabili });
      }
    }
    const lista = probabili.get(teamId) ?? [];
    const { data: anag } = await db.from('players')
      .select('id, name, ext_id').in('id', lista.map((p) => p.playerId));
    const per = new Map((anag ?? []).map((p) => [p.id as string, p]));
    return lista.map((p) => ({
      playerId: p.playerId,
      extId: (per.get(p.playerId)?.ext_id as string | undefined) ?? null,
      nome: (per.get(p.playerId)?.name as string | undefined) ?? '?',
      ruolo: p.role,
      club: p.club,
      titolare: p.titolare,
      ordine: p.ordine,
      fascia: p.fascia,
    }));
  };

  const partite = 'partite' in live ? live.partite : [];
  const ctx = { partite, ora: Date.now(), stessoClub: (a: string, b: string) => stessoClub(a, b) };
  const lato = async (teamId: string, t: { name: string; logo_url: string | null }, vera: Schierato[] | null): Promise<LatoDiretta> => ({
    teamId, nome: t.name, stemma: t.logo_url,
    fonte: vera ? 'lega' : 'probabile',
    live: squadraLive(vera ?? await probabile(teamId), ctx),
  });

  const [casa, ospite] = await Promise.all([
    lato(f.home_team_id as string, casaT, fCasa),
    lato(f.away_team_id as string, ospiteT, fOspite),
  ]);

  return {
    fixtureId,
    titolo: f.competition === 'coppa' ? 'Coppa Mansarda' : `Giornata ${md.fanta ?? md.serie_a}`,
    serieA: md.serie_a,
    kickoff: md.first_kickoff_at,
    ufficiale: f.home_goals == null ? null : { casa: Number(f.home_goals), ospite: Number(f.away_goals) },
    casa, ospite,
    serieAPartite: partite.map((p) => ({
      casa: p.teamHome, ospite: p.teamAway,
      gol: p.status >= 1 ? `${p.goalHome}–${p.goalAway}` : '–',
      stato: STATO[p.status] ?? '',
    })),
    sconosciuti: eventiSconosciuti(partite),
    errore: 'errore' in live ? live.errore : null,
    aggiornatoIl: new Date().toISOString(),
  };
}
