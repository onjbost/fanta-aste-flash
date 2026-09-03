import 'server-only';
import { supabaseAdmin } from './supabase';
import {
  forzaClub, stimaSquadra, quoteSfida, risolviSchedina,
  type ContestoClub, type GiocatoreTipster, type Mercato, type StimaSquadra,
} from './tipster';

/**
 * Torneo dei Tipster, lato server: generazione delle quote e chiusura di una
 * giornata. La matematica sta tutta in `tipster.ts`, qui c'è solo il traffico
 * col database.
 *
 * Le rose **non sono mai copiate**: le quote si generano leggendo `v_roster`
 * nel momento in cui le generi. Un'asta flash, un'asta di riparazione o un
 * import nuovo cambiano i contratti, e la generazione successiva ne tiene
 * conto da sola — non c'è nessuna sincronizzazione da ricordarsi di fare.
 * Le quote già pubblicate restano come sono, e quelle già giocate restano
 * congelate nella schedina: è la stessa regola del prezzo d'acquisto.
 */

export interface Sfida {
  id: string;
  competition: 'campionato' | 'coppa';
  phase: 'regular' | 'gruppi' | 'semifinale' | 'finale';
  groupName: string | null;
  slot: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface Giornata {
  id: string;
  serieA: number;
  fanta: number | null;
  matchDate: string;
  firstKickoffAt: string;
  lockAt: string;
  oddsPublishedAt: string | null;
  status: 'scheduled' | 'open' | 'locked' | 'waiting' | 'settled';
}

export function giornataDaRiga(r: Record<string, unknown>): Giornata {
  return {
    id: String(r.id), serieA: Number(r.serie_a),
    fanta: r.fanta == null ? null : Number(r.fanta),
    matchDate: String(r.match_date),
    firstKickoffAt: String(r.first_kickoff_at),
    lockAt: String(r.lock_at),
    oddsPublishedAt: r.odds_published_at ? String(r.odds_published_at) : null,
    status: String(r.status) as Giornata['status'],
  };
}

/**
 * La giornata da mostrare: la prima non ancora chiusa. Se sono tutte chiuse
 * si mostra l'ultima, così la pagina non resta mai vuota.
 */
export async function giornataCorrente(leagueId: string): Promise<Giornata | null> {
  const db = supabaseAdmin();
  const oggi = new Date().toISOString().slice(0, 10);

  // la prossima da giocare: non ancora chiusa e non già passata. Il campionato
  // può essere partito da un pezzo, quindi le giornate vecchie non contano.
  const { data: prossime } = await db.from('matchdays')
    .select('*').eq('league_id', leagueId).neq('status', 'settled')
    .not('fanta', 'is', null).gte('match_date', oggi).order('serie_a').limit(1);
  if (prossime?.length) return giornataDaRiga(prossime[0]);

  // nessuna futura: resta quella più recente ancora aperta (un recupero, o i
  // risultati non ancora inseriti)
  const { data: aperte } = await db.from('matchdays')
    .select('*').eq('league_id', leagueId).neq('status', 'settled')
    .not('fanta', 'is', null).order('serie_a', { ascending: false }).limit(1);
  if (aperte?.length) return giornataDaRiga(aperte[0]);

  const { data: ultime } = await db.from('matchdays')
    .select('*').eq('league_id', leagueId).not('fanta', 'is', null)
    .order('serie_a', { ascending: false }).limit(1);
  return ultime?.length ? giornataDaRiga(ultime[0]) : null;
}

/** Le sfide di una giornata, con i nomi delle squadre già risolti. */
export async function sfideDiGiornata(matchdayId: string): Promise<Sfida[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('fixtures')
    .select('id, competition, phase, group_name, slot, home_team_id, away_team_id, home_goals, away_goals, casa:home_team_id(name), ospite:away_team_id(name)')
    .eq('matchday_id', matchdayId)
    .order('competition').order('slot');

  type Row = {
    id: string; competition: string; phase: string; group_name: string | null; slot: number;
    home_team_id: string | null; away_team_id: string | null;
    home_goals: number | null; away_goals: number | null;
    casa: { name: string } | null; ospite: { name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    competition: r.competition as Sfida['competition'],
    phase: r.phase as Sfida['phase'],
    groupName: r.group_name,
    slot: r.slot,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    homeName: r.casa?.name ?? 'da definire',
    awayName: r.ospite?.name ?? 'da definire',
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
  }));
}

/** Le rose vive, lette adesso: la sincronia con il mercato è automatica. */
async function roseVive(leagueId: string): Promise<Map<string, GiocatoreTipster[]>> {
  const db = supabaseAdmin();
  const { data } = await db.from('v_roster')
    .select('team_id, player_id, role, club, quotation, status').eq('league_id', leagueId);

  const rose = new Map<string, GiocatoreTipster[]>();
  (data ?? []).forEach((r) => {
    const l = rose.get(r.team_id as string) ?? [];
    l.push({
      playerId: r.player_id as string,
      role: r.role as GiocatoreTipster['role'],
      club: String(r.club),
      quotazione: Number(r.quotation ?? 1),
      // chi ha lasciato la Serie A non gioca: fuori dall'undici
      disponibile: r.status !== 'out_of_serie_a',
    });
    rose.set(r.team_id as string, l);
  });
  return rose;
}

/** Chi affronta chi in Serie A quella giornata, con i rinvii già applicati. */
async function contestiDiGiornata(matchdayId: string): Promise<Record<string, ContestoClub>> {
  const db = supabaseAdmin();
  const { data } = await db.from('serie_a_fixtures')
    .select('home_club, away_club, status, policy').eq('matchday_id', matchdayId);

  const ctx: Record<string, ContestoClub> = {};
  (data ?? []).forEach((p) => {
    const rinviata = p.status === 'postponed';
    const seiPolitico = rinviata && p.policy === 'six';
    ctx[String(p.home_club)] = { avversario: String(p.away_club), inCasa: true, rinviata, seiPolitico };
    ctx[String(p.away_club)] = { avversario: String(p.home_club), inCasa: false, rinviata, seiPolitico };
  });
  return ctx;
}

export interface QuoteGenerate {
  sfide: number;
  esiti: number;
  stime: { teamId: string; mu: number; sd: number }[];
}

/**
 * Genera (o rigenera) le quote di una giornata. Le sfide senza squadre —
 * semifinali e finale di coppa in attesa degli accoppiamenti — vengono saltate.
 */
export async function generaQuote(leagueId: string, matchdayId: string): Promise<QuoteGenerate> {
  const db = supabaseAdmin();
  const [rose, contesti, sfide, { data: listone }] = await Promise.all([
    roseVive(leagueId),
    contestiDiGiornata(matchdayId),
    sfideDiGiornata(matchdayId),
    db.from('players').select('club, quotation').eq('league_id', leagueId),
  ]);

  const { data: lega } = await db.from('leagues')
    .select('tipster_correzione_media').eq('id', leagueId).maybeSingle();
  const correzioneMedia = Number((lega as { tipster_correzione_media?: number } | null)
    ?.tipster_correzione_media ?? 0);

  const forza = forzaClub((listone ?? []).map((p) => ({
    club: String(p.club), quotazione: Number(p.quotation ?? 1),
  })));

  const stime = new Map<string, StimaSquadra>();
  for (const [teamId, rosa] of rose) {
    stime.set(teamId, stimaSquadra(rosa, contesti, { forzaClub: forza, correzioneMedia }));
  }

  const righe: Record<string, unknown>[] = [];
  let quotate = 0;
  for (const s of sfide) {
    const casa = s.homeTeamId ? stime.get(s.homeTeamId) : undefined;
    const ospite = s.awayTeamId ? stime.get(s.awayTeamId) : undefined;
    if (!casa || !ospite) continue;      // accoppiamento non ancora deciso
    quotate++;
    for (const e of quoteSfida(casa, ospite)) {
      righe.push({
        fixture_id: s.id, market: e.market, selection: e.selection,
        probability: Number(e.probability.toFixed(6)), price: e.price,
        generated_at: new Date().toISOString(),
      });
    }
  }

  // le quote di questa giornata si rifanno da zero: le vecchie non servono più
  const ids = sfide.map((s) => s.id);
  if (ids.length) await db.from('odds').delete().in('fixture_id', ids);
  if (righe.length) {
    const { error } = await db.from('odds').insert(righe);
    if (error) throw new Error(error.message);
  }

  return {
    sfide: quotate,
    esiti: righe.length,
    stime: [...stime].map(([teamId, s]) => ({ teamId, mu: s.mu, sd: s.sd })),
  };
}

export interface EsitoChiusura {
  schedine: number;
  giocate: number;
  azzeccate: number;
  inAttesa: number;
}

/**
 * Chiude una giornata: risolve ogni giocata, applica il 10/n, scrive i punti.
 * È idempotente — si può rilanciare dopo aver corretto un risultato, e le
 * sfide ancora senza risultato restano in sospeso senza dare punti.
 */
export async function chiudiGiornata(matchdayId: string): Promise<EsitoChiusura> {
  const db = supabaseAdmin();
  const [{ data: lega }, sfide, { data: slips }] = await Promise.all([
    db.from('leagues').select('id, tipster_multiplier').limit(1).single(),
    sfideDiGiornata(matchdayId),
    db.from('slips').select('id, team_id').eq('matchday_id', matchdayId),
  ]);
  const moltiplicatore = Number((lega as { tipster_multiplier?: number } | null)?.tipster_multiplier ?? 10);

  const risultati = sfide
    .filter((s) => s.homeGoals != null && s.awayGoals != null)
    .map((s) => ({ fixtureId: s.id, golCasa: s.homeGoals!, golOspite: s.awayGoals! }));

  let giocate = 0; let azzeccate = 0; let inAttesa = 0;

  for (const slip of slips ?? []) {
    const { data: picks } = await db.from('picks')
      .select('id, fixture_id, market, selection, price').eq('slip_id', slip.id);

    const risolte = risolviSchedina(
      (picks ?? []).map((p) => ({
        fixtureId: p.fixture_id as string,
        market: p.market as Mercato,
        selection: String(p.selection),
        price: Number(p.price),
      })),
      risultati,
      moltiplicatore,
    );

    for (let i = 0; i < risolte.giocate.length; i++) {
      const r = risolte.giocate[i];
      const id = (picks ?? [])[i].id as string;
      await db.from('picks').update({
        outcome: r.outcome, multiplier: r.multiplier, points: r.points,
      }).eq('id', id);
      giocate++;
      if (r.outcome === 'won') azzeccate++;
      if (r.outcome === 'void') inAttesa++;
    }
    await db.from('slips').update({ points: risolte.punti }).eq('id', slip.id);
  }

  // se manca ancora un risultato la giornata aspetta il recupero
  const tutte = sfide.filter((s) => s.homeTeamId && s.awayTeamId);
  const complete = tutte.every((s) => s.homeGoals != null);
  await db.from('matchdays')
    .update({ status: complete ? 'settled' : 'waiting' })
    .eq('id', matchdayId);

  return { schedine: (slips ?? []).length, giocate, azzeccate, inAttesa };
}

// =====================================================================
// Storico delle schedine
// =====================================================================
// Una sola andata al database per vista: le giocate se le porta dietro la
// schedina, e ogni giocata si porta dietro la sfida con il suo risultato.
// Prima erano tre interrogazioni in fila — schedine, giocate, sfide — e in
// fila le attese si sommano.

export interface GiocataStorico {
  sfida: string;
  competizione: 'campionato' | 'coppa';
  market: Mercato;
  selection: string;
  price: number;
  outcome: 'won' | 'lost' | 'void' | null;
  points: number | null;
  risultato: string | null;
}

export interface SchedinaStorico {
  slipId: string;
  giornata: number | null;
  serieA: number;
  dataGiornata: string;
  inviataIl: string;
  punti: number | null;
  conclusa: boolean;
  condivisa: boolean;
  giocate: GiocataStorico[];
}

const SELECT_SCHEDINA = `
  id, submitted_at, points, shared,
  matchdays(id, fanta, serie_a, match_date, status),
  picks(
    fixture_id, market, selection, price, outcome, points,
    fixtures(competition, home_goals, away_goals,
             casa:home_team_id(name), ospite:away_team_id(name))
  )
`;

type PickRow = {
  market: string; selection: string; price: number;
  outcome: string | null; points: number | null;
  fixtures: {
    competition: string; home_goals: number | null; away_goals: number | null;
    casa: { name: string } | null; ospite: { name: string } | null;
  } | null;
};

function giocateDaRighe(picks: PickRow[] | null | undefined): GiocataStorico[] {
  return (picks ?? []).map((p) => {
    const f = p.fixtures;
    return {
      sfida: f ? `${f.casa?.name ?? '?'} – ${f.ospite?.name ?? '?'}` : 'sfida rimossa',
      competizione: (f?.competition as 'campionato' | 'coppa') ?? 'campionato',
      market: p.market as Mercato,
      selection: String(p.selection),
      price: Number(p.price),
      outcome: (p.outcome as GiocataStorico['outcome']) ?? null,
      points: p.points == null ? null : Number(p.points),
      risultato: f && f.home_goals != null ? `${f.home_goals}-${f.away_goals}` : null,
    };
  });
}

/**
 * Tutte le schedine di una squadra, dalla più recente, con dentro le giocate.
 *
 * Se la lettura fallisce lo dice, invece di restituire una lista vuota: una
 * schedina che non c'è e una schedina che non si riesce a leggere sono due
 * cose diverse, e confonderle costa un pomeriggio.
 */
export async function storicoSchedine(
  teamId: string,
): Promise<{ schedine: SchedinaStorico[]; errore: string | null }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('slips')
    .select(SELECT_SCHEDINA)
    .eq('team_id', teamId)
    .order('submitted_at', { ascending: false });

  if (error) return { schedine: [], errore: error.message };

  type Row = {
    id: string; submitted_at: string; points: number | null; shared: boolean;
    matchdays: { fanta: number | null; serie_a: number; match_date: string; status: string } | null;
    picks: PickRow[] | null;
  };

  const schedine = ((data ?? []) as unknown as Row[]).map((s) => ({
    slipId: s.id,
    giornata: s.matchdays?.fanta ?? null,
    serieA: Number(s.matchdays?.serie_a ?? 0),
    dataGiornata: String(s.matchdays?.match_date ?? ''),
    inviataIl: s.submitted_at,
    punti: s.points == null ? null : Number(s.points),
    conclusa: s.matchdays?.status === 'settled',
    condivisa: !!s.shared,
    giocate: giocateDaRighe(s.picks),
  }));
  return { schedine, errore: null };
}

export interface SchedinaAltrui {
  slipId: string;
  squadra: string;
  punti: number | null;
  giocate: GiocataStorico[];
}
export interface GiornataAltrui {
  giornata: number | null;
  serieA: number;
  data: string;
  conclusa: boolean;
  squadre: SchedinaAltrui[];
}

/**
 * Le schedine che gli altri hanno deciso di condividere, raggruppate per
 * giornata. Chi non condivide non compare: è una scelta sua, non un buco.
 */
export async function schedineCondivise(
  leagueId: string, escludiTeamId: string,
): Promise<{ giornate: GiornataAltrui[]; errore: string | null }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('slips')
    .select(`${SELECT_SCHEDINA}, teams(name)`)
    .eq('league_id', leagueId).eq('shared', true).neq('team_id', escludiTeamId);

  if (error) return { giornate: [], errore: error.message };

  type Row = {
    id: string; points: number | null;
    teams: { name: string } | null;
    matchdays: { fanta: number | null; serie_a: number; match_date: string; status: string } | null;
    picks: PickRow[] | null;
  };

  const perGiornata = new Map<number, GiornataAltrui>();
  ((data ?? []) as unknown as Row[]).forEach((r) => {
    const sa = Number(r.matchdays?.serie_a ?? 0);
    const g = perGiornata.get(sa) ?? {
      giornata: r.matchdays?.fanta ?? null,
      serieA: sa,
      data: String(r.matchdays?.match_date ?? ''),
      conclusa: r.matchdays?.status === 'settled',
      squadre: [],
    };
    g.squadre.push({
      slipId: r.id,
      squadra: r.teams?.name ?? '?',
      punti: r.points == null ? null : Number(r.points),
      giocate: giocateDaRighe(r.picks),
    });
    perGiornata.set(sa, g);
  });

  const giornate = [...perGiornata.values()]
    .sort((a, b) => b.serieA - a.serieA)
    .map((g) => ({ ...g, squadre: g.squadre.sort((a, b) => Number(b.punti ?? 0) - Number(a.punti ?? 0)) }));
  return { giornate, errore: null };
}
