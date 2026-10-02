import 'server-only';
import { popolaritaPerSfida, type CasellaPopolare } from './popolarita';
import { nonSchierabili } from './infortuni/infortuniServer';
import { supabaseAdmin } from './supabase';
import {
  forzaClub, stimaSquadra, quoteSfida, risolviSchedina,
  type ContestoClub, type GiocatoreTipster, type GiornataGiocata,
  type Mercato, type StimaSquadra,
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

/**
 * Le rose vive, lette adesso: la sincronia con il mercato è automatica.
 *
 * Gli infortunati e gli squalificati dell'ultima raccolta escono dall'undici.
 * Non vuol dire sottrarre i loro fantapunti: `stimaSquadra` sceglie i
 * migliori per ruolo fra i **disponibili**, quindi al posto di chi manca
 * entra il secondo della rosa. Il danno che ne esce è quello giusto — quanto
 * è peggio chi gioca al suo posto — e non «quanto valeva chi si è fatto
 * male»: chi ha tre attaccanti buoni e ne perde uno non deve essere punito
 * come chi perde l'unico difensore decente.
 */
async function roseVive(leagueId: string): Promise<Map<string, GiocatoreTipster[]>> {
  const db = supabaseAdmin();
  const fuori = await nonSchierabili();
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
      // chi ha lasciato la Serie A non gioca, e nemmeno chi è infortunato o
      // squalificato secondo l'ultima raccolta degli indisponibili
      disponibile: r.status !== 'out_of_serie_a'
        && !fuori.has(r.player_id as string),
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

/**
 * Quello che ogni squadra ha fatto davvero nelle giornate già archiviate,
 * prima di quella che si sta quotando.
 *
 * Due cose su cui è facile sbagliare, e che qui sono decise una volta sola:
 *
 * 1. **Solo campionato.** Nelle giornate di coppa le stesse squadre giocano
 *    due sfide con gli **stessi identici fantapunti**: contarle entrambe
 *    raddoppierebbe il peso di quella domenica senza aggiungere un solo dato.
 * 2. **Solo giornate precedenti.** Se entrasse la giornata in corso, si
 *    quoterebbe sapendo già com'è andata.
 */
async function storicoSquadre(
  leagueId: string, finoAllaGiornataEsclusa: number,
): Promise<Map<string, GiornataGiocata[]>> {
  const db = supabaseAdmin();
  const { data } = await db.from('fixtures')
    .select('home_team_id, away_team_id, home_fp, away_fp, matchdays!inner(fanta)')
    .eq('league_id', leagueId)
    .eq('competition', 'campionato')
    .not('home_fp', 'is', null)
    .lt('matchdays.fanta', finoAllaGiornataEsclusa);

  const per = new Map<string, GiornataGiocata[]>();
  const aggiungi = (teamId: string | null, fanta: number | null, fp: unknown) => {
    if (!teamId || fanta == null || fp == null) return;
    const l = per.get(teamId) ?? [];
    l.push({ fanta, fantapunti: Number(fp) });
    per.set(teamId, l);
  };

  for (const r of data ?? []) {
    const x = r as unknown as Record<string, unknown>;
    const fanta = (x.matchdays as { fanta: number | null } | null)?.fanta ?? null;
    aggiungi(x.home_team_id as string | null, fanta, x.home_fp);
    aggiungi(x.away_team_id as string | null, fanta, x.away_fp);
  }
  return per;
}

export interface StimaPubblicata {
  teamId: string;
  mu: number;
  sd: number;
  /** la forza secondo il solo listone, prima di guardare il campo */
  baseListone: number;
  /** la media pesata delle giornate giocate, null se non ne ha giocate */
  osservata: number | null;
  /** quante giornate sono entrate nel conto */
  giornate: number;
}

export interface QuoteGenerate {
  sfide: number;
  esiti: number;
  stime: StimaPubblicata[];
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

  const [{ data: lega }, { data: md }] = await Promise.all([
    db.from('leagues')
      .select('tipster_correzione_media, tipster_peso_listone').eq('id', leagueId).maybeSingle(),
    db.from('matchdays').select('fanta').eq('id', matchdayId).maybeSingle(),
  ]);
  const impostazioni = lega as
    { tipster_correzione_media?: number; tipster_peso_listone?: number } | null;
  const correzioneMedia = Number(impostazioni?.tipster_correzione_media ?? 0);
  const pesoListone = impostazioni?.tipster_peso_listone == null
    ? undefined : Number(impostazioni.tipster_peso_listone);

  /*
   * Senza il numero di giornata non si sa dove tagliare lo storico, e
   * tagliarlo male vorrebbe dire quotare con dentro il risultato. Meglio
   * quotare col solo listone, come si faceva prima, che quotare sapendo.
   */
  const giornata = (md as { fanta: number | null } | null)?.fanta ?? null;
  const storico = giornata == null
    ? new Map<string, GiornataGiocata[]>()
    : await storicoSquadre(leagueId, giornata);

  const forza = forzaClub((listone ?? []).map((p) => ({
    club: String(p.club), quotazione: Number(p.quotation ?? 1),
  })));

  const stime = new Map<string, StimaSquadra>();
  for (const [teamId, rosa] of rose) {
    stime.set(teamId, stimaSquadra(rosa, contesti, {
      forzaClub: forza, correzioneMedia, pesoListone,
      storico: storico.get(teamId) ?? [],
    }));
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
    stime: [...stime].map(([teamId, s]) => ({
      teamId, mu: s.mu, sd: s.sd,
      baseListone: s.baseListone, osservata: s.osservata, giornate: s.giornate,
    })),
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
  giocate: GiocataStorico[];
}

const SELECT_SCHEDINA = `
  id, submitted_at, points,
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
    id: string; submitted_at: string; points: number | null;
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
 * Le schedine di tutti gli altri, raggruppate per giornata.
 *
 * Non c'è più niente da filtrare: nel Torneo dei Tipster una schedina è
 * pubblica dal momento in cui viene giocata. Chi non compare qui non è uno
 * che si è tenuto le carte coperte — è uno che quella giornata non ha
 * giocato, che è un'informazione diversa e va detta com'è.
 */
export async function schedineDegliAltri(
  leagueId: string, escludiTeamId: string,
): Promise<{ giornate: GiornataAltrui[]; errore: string | null }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('slips')
    .select(`${SELECT_SCHEDINA}, teams(name)`)
    .eq('league_id', leagueId).neq('team_id', escludiTeamId);

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

export interface SfidaPopolare {
  id: string;
  competizione: 'campionato' | 'coppa';
  casa: string;
  ospite: string;
  caselle: (CasellaPopolare & { price: number })[];
}

/**
 * «Cosa gioca la lega» su una giornata: tutte le giocate di tutte le squadre,
 * contate per casella. Le schedine sono pubbliche da quando vengono giocate,
 * quindi qui non c'è niente da nascondere.
 */
export async function cosaGiocaLaLega(
  leagueId: string, giornata: Giornata,
): Promise<{ sfide: SfidaPopolare[]; schedine: number; errore: string | null }> {
  const db = supabaseAdmin();
  const [sfide, { data, error }] = await Promise.all([
    sfideDiGiornata(giornata.id),
    db.from('picks')
      .select('fixture_id, market, selection, price, slip_id, slips!inner(league_id, matchday_id)')
      .eq('slips.league_id', leagueId).eq('slips.matchday_id', giornata.id),
  ]);
  if (error) return { sfide: [], schedine: 0, errore: error.message };

  type Row = { fixture_id: string; market: string; selection: string; price: number; slip_id: string };
  const righe = (data ?? []) as unknown as Row[];
  const prezzo = new Map(righe.map((r) => [`${r.fixture_id}|${r.market}|${r.selection}`, Number(r.price)]));
  const pop = popolaritaPerSfida(righe.map((r) => ({
    fixtureId: r.fixture_id, market: r.market, selection: String(r.selection),
  })));

  return {
    schedine: new Set(righe.map((r) => r.slip_id)).size,
    errore: null,
    sfide: sfide.filter((s) => pop.has(s.id)).map((s) => ({
      id: s.id, competizione: s.competition, casa: s.homeName, ospite: s.awayName,
      caselle: (pop.get(s.id) ?? []).map((c) => ({
        ...c, price: prezzo.get(`${s.id}|${c.market}|${c.selection}`) ?? 0,
      })),
    })),
  };
}
