import 'server-only';

/**
 * La Redazione — dal database al pezzo pronto.
 *
 * Qui si mette insieme tutto: il tabellino appena importato, lo storico delle
 * giornate passate, le classifiche prima e dopo, il Torneo dei Tipster e le
 * schede delle squadre. Da quel contesto escono gli spunti, dagli spunti
 * esce il pezzo, e il pezzo passa il controllo prima di diventare una bozza.
 *
 * Il ciclo di generazione è: prova · se la verifica boccia, riprova dicendo
 * al modello cosa non andava · se boccia ancora, si manda la versione con i
 * template. Meglio un messaggio asciutto che nessun messaggio, e meglio
 * nessun numero inventato che una battuta in più.
 */

import { supabaseAdmin } from '@/lib/supabase';
import {
  numeriLeciti, trovaSpunti,
  type ContestoGiornata, type GiocatoreInCampo, type GironeCoppa, type PrecedenteSquadra,
  type RigaClassifica, type SfidaInGiornata, type SquadraInSfida, type TipsterGiornata,
} from './spunti';
import {
  ScrittoreTemplate, scegliScrittore,
  type Pezzo, type RichiestaPezzo, type SchedaSquadra, type SfidaDaRaccontare,
} from './scrittore';
import { montaMessaggio, verificaPezzo, type EsitoVerifica } from './verifica';
import type { Bonus, Ruolo } from './tabellino';

const MASSIMI_TENTATIVI = 2;

// =====================================================================
// Il contesto
// =====================================================================

export interface Materiale {
  leagueId: string;
  matchdayId: string;
  contesto: ContestoGiornata;
  richiesta: RichiestaPezzo;
}

export async function costruisciMateriale(matchdayId: string): Promise<Materiale> {
  const db = supabaseAdmin();

  const { data: md } = await db.from('matchdays')
    .select('id, league_id, fanta, serie_a, lock_at').eq('id', matchdayId).single();
  if (!md) throw new Error('giornata inesistente');
  const leagueId = md.league_id as string;
  const fanta = (md.fanta as number | null) ?? 0;

  const [{ data: lega }, { data: squadre }, { data: flavour }] = await Promise.all([
    db.from('leagues')
      .select('redazione_tono, redazione_min_parole, redazione_parole_vietate').eq('id', leagueId).single(),
    db.from('teams').select('id, name, manager_name').eq('league_id', leagueId),
    db.from('team_flavour').select('*').eq('league_id', leagueId),
  ]);

  const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));
  const flavourDi = new Map((flavour ?? []).map((f) => [f.team_id as string, f]));

  // ---- le sfide di questa giornata, col tabellino
  const { data: fx } = await db.from('fixtures')
    .select(`id, competition, home_team_id, away_team_id, home_goals, away_goals,
             home_fp, away_fp, home_modulo, away_modulo,
             home_modificatore, away_modificatore, home_bonus_capitano, away_bonus_capitano,
             home_inviata_at, away_inviata_at, tabellino_at`)
    .eq('matchday_id', matchdayId)
    .not('home_goals', 'is', null);

  const sfideRighe = (fx ?? []).filter((f) => f.home_team_id && f.away_team_id);
  const fixtureIds = sfideRighe.map((f) => f.id as string);

  const { data: righe } = fixtureIds.length
    ? await db.from('lineup_entries')
      .select('fixture_id, team_id, player_id, player_name, role, starter, entered, is_captain, voto, fantavoto, bonus, counted, slot')
      .in('fixture_id', fixtureIds).order('slot')
    : { data: [] as never[] };

  // ---- i prezzi d'asta, per riconoscere il pagato tanto che ha reso poco
  const { data: contratti } = await db.from('contracts')
    .select('player_id, price, acquisition_type').eq('league_id', leagueId).is('released_at', null);
  const prezzoDi = new Map((contratti ?? []).map((c) => [c.player_id as string, {
    prezzo: Number(c.price), flash: c.acquisition_type === 'flash_auction',
  }]));

  const chiusura = (md.lock_at as string | null) ?? null;

  function squadraIn(fixtureId: string, teamId: string, lato: 'home' | 'away', f: Record<string, unknown>): SquadraInSfida {
    const mie = (righe ?? []).filter((r) => r.fixture_id === fixtureId && r.team_id === teamId);
    const giocatori: GiocatoreInCampo[] = mie.map((r) => {
      const c = r.player_id ? prezzoDi.get(r.player_id as string) : undefined;
      return {
        nome: r.player_name as string,
        ruolo: (r.role as Ruolo | null) ?? null,
        voto: r.voto == null ? null : Number(r.voto),
        fantavoto: r.fantavoto == null ? null : Number(r.fantavoto),
        titolare: Boolean(r.starter), entered: Boolean(r.entered),
        isCaptain: Boolean(r.is_captain), counted: Boolean(r.counted),
        bonus: (r.bonus ?? {}) as Bonus,
        prezzoAsta: c?.prezzo ?? null, daAstaFlash: c?.flash ?? false,
      };
    });
    const fl = flavourDi.get(teamId);
    return {
      teamId, nome: nomeDi.get(teamId) ?? '?',
      soprannomi: (fl?.soprannomi as string[] | undefined) ?? [],
      gol: Number(f[`${lato}_goals`] ?? 0),
      fantapunti: Number(f[`${lato}_fp`] ?? 0),
      modulo: (f[`${lato}_modulo`] as string | null) ?? null,
      modificatore: Number(f[`${lato}_modificatore`] ?? 0),
      bonusCapitano: Number(f[`${lato}_bonus_capitano`] ?? 0),
      inviataIl: (f[`${lato}_inviata_at`] as string | null) ?? null,
      chiusuraIl: chiusura,
      giocatori,
    };
  }

  const sfide: SfidaInGiornata[] = sfideRighe.map((f) => {
    const r = f as unknown as Record<string, unknown>;
    const id = r.id as string;
    return {
      fixtureId: id,
      competizione: r.competition as 'campionato' | 'coppa',
      casa: squadraIn(id, r.home_team_id as string, 'home', r),
      ospite: squadraIn(id, r.away_team_id as string, 'away', r),
    };
  });

  // ---- lo storico: tutte le giornate di campionato già archiviate
  const { data: passate } = await db.from('fixtures')
    .select('home_team_id, away_team_id, home_goals, away_goals, home_fp, away_fp, matchdays!inner(fanta)')
    .eq('league_id', leagueId).eq('competition', 'campionato')
    .not('home_goals', 'is', null);

  const precedenti: PrecedenteSquadra[] = [];
  const tutteLeSfide: { fanta: number; casa: string; ospite: string; gc: number; go: number; fpc: number; fpo: number }[] = [];

  for (const p of passate ?? []) {
    const r = p as unknown as Record<string, unknown>;
    const g = (r.matchdays as { fanta: number | null } | null)?.fanta;
    if (g == null) continue;
    const casa = r.home_team_id as string, ospite = r.away_team_id as string;
    if (!casa || !ospite) continue;
    const gc = Number(r.home_goals), go = Number(r.away_goals);
    tutteLeSfide.push({ fanta: g, casa, ospite, gc, go, fpc: Number(r.home_fp ?? 0), fpo: Number(r.away_fp ?? 0) });

    if (g < fanta) {
      precedenti.push({
        fanta: g, teamId: casa, avversarioId: ospite, avversario: nomeDi.get(ospite) ?? '?',
        golFatti: gc, golSubiti: go, fantapunti: Number(r.home_fp ?? 0),
      });
      precedenti.push({
        fanta: g, teamId: ospite, avversarioId: casa, avversario: nomeDi.get(casa) ?? '?',
        golFatti: go, golSubiti: gc, fantapunti: Number(r.away_fp ?? 0),
      });
    }
  }

  /*
   * La classifica: prima quella della lega, la nostra solo se non c'è.
   *
   * La nostra la ricava dai risultati con la regola classica — tre punti,
   * uno, i fantapunti a spareggio — e per una lega senza sorprese coincide.
   * Ma penalità, punti extra e partite a tavolino la lega li applica e noi
   * non li vediamo: quando la fotografia c'è, vince lei, perché è quella che
   * i partecipanti hanno sotto gli occhi mentre leggono il pezzo.
   */
  const ufficiali = await leggiClassificheUfficiali(leagueId, matchdayId, Number(md.serie_a));
  const classificaPrima = ufficiali.prima
    ?? classifica(tutteLeSfide.filter((s) => s.fanta < fanta), nomeDi);
  const classificaDopo = ufficiali.dopo
    ?? classifica(tutteLeSfide.filter((s) => s.fanta <= fanta), nomeDi);

  // ---- il torneo dei tipster
  const tipster = await leggiTipster(matchdayId, sfide, nomeDi);

  const contesto: ContestoGiornata = {
    fanta, serieA: Number(md.serie_a), sfide, precedenti,
    classificaPrima, classificaDopo,
    classificaUfficiale: ufficiali.dopo != null,
    gironiCoppa: ufficiali.gironi,
    gironiCoppaPrima: ufficiali.gironiPrima,
    tipster,
  };

  const spunti = trovaSpunti(contesto);

  const schede: SchedaSquadra[] = (squadre ?? []).map((t) => {
    const fl = flavourDi.get(t.id as string);
    return {
      nome: t.name as string,
      allenatore: (t.manager_name as string | null) ?? null,
      soprannomi: (fl?.soprannomi as string[] | undefined) ?? [],
      tormentoni: (fl?.tormentoni as string | null) ?? null,
      puntiDeboli: (fl?.punti_deboli as string | null) ?? null,
      intoccabile: (fl?.intoccabile as string | null) ?? null,
    };
  });

  const daRaccontare: SfidaDaRaccontare[] = sfide.map((s) => ({
    fixtureId: s.fixtureId, casa: s.casa.nome, ospite: s.ospite.nome,
    golCasa: s.casa.gol, golOspite: s.ospite.gol,
    fpCasa: s.casa.fantapunti, fpOspite: s.ospite.fantapunti,
    moduloCasa: s.casa.modulo, moduloOspite: s.ospite.modulo,
    competizione: s.competizione,
  }));

  const richiesta: RichiestaPezzo = {
    giornata: fanta, serieA: Number(md.serie_a),
    tono: Number(lega?.redazione_tono ?? 4),
    minParole: Number(lega?.redazione_min_parole ?? 150),
    paroleVietate: (lega?.redazione_parole_vietate as string[] | undefined) ?? [],
    squadre: schede, sfide: daRaccontare, spunti,
    classifica: classificaDopo,
    classificaPrima,
    classificaUfficiale: ufficiali.dopo != null,
    gironiCoppa: ufficiali.gironi,
    tipster,
  };

  return { leagueId, matchdayId, contesto, richiesta };
}

/**
 * Le classifiche che la lega scriveva quando abbiamo importato.
 *
 * `dopo` è la fotografia di questa giornata; `prima` è la più recente delle
 * fotografie precedenti — non necessariamente quella della giornata appena
 * passata, perché una giornata può essere stata importata senza classifica o
 * non essere stata importata affatto. Confrontarle è quello che permette di
 * dire «scavalca» senza rifare i conti.
 *
 * Se la fotografia di oggi non c'è, si restituisce null su tutto e chi chiama
 * ricade sulla classifica calcolata: mezza verità ufficiale e mezza nostra
 * sarebbe peggio di entrambe, perché il sorpasso verrebbe da un confronto fra
 * due modi diversi di contare.
 */
async function leggiClassificheUfficiali(
  leagueId: string, matchdayId: string, serieA: number,
): Promise<{
  prima: RigaClassifica[] | null;
  dopo: RigaClassifica[] | null;
  gironi: GironeCoppa[];
  gironiPrima: GironeCoppa[];
}> {
  const vuoto = { prima: null, dopo: null, gironi: [], gironiPrima: [] };
  const db = supabaseAdmin();

  const { data } = await db.from('standings_snapshots')
    .select('matchday_id, competition, group_name, team_name, team_id, posizione, punti, matchdays!inner(serie_a)')
    .eq('league_id', leagueId)
    .lte('matchdays.serie_a', serieA);
  if (!data?.length) return vuoto;

  type Riga = {
    matchdayId: string; serieA: number; competition: string; gruppo: string;
    teamId: string | null; nome: string; posizione: number; punti: number;
  };
  const righe: Riga[] = data.map((r) => {
    const x = r as unknown as Record<string, unknown>;
    return {
      matchdayId: x.matchday_id as string,
      serieA: Number((x.matchdays as { serie_a: number }).serie_a),
      competition: x.competition as string,
      gruppo: (x.group_name as string | null) ?? '',
      teamId: (x.team_id as string | null) ?? null,
      nome: x.team_name as string,
      posizione: Number(x.posizione),
      punti: Number(x.punti ?? 0),
    };
  });

  const inClassifica = (r: Riga): RigaClassifica => ({
    // senza aggancio si tiene il nome come identità: sul pezzo conta quello,
    // e una riga in meno falserebbe le posizioni
    teamId: r.teamId ?? `nome:${r.nome}`,
    nome: r.nome, punti: r.punti, posizione: r.posizione,
  });
  const ordina = (l: Riga[]) => l.sort((a, b) => a.posizione - b.posizione).map(inClassifica);

  const campionatoOggi = righe.filter((r) => r.matchdayId === matchdayId && r.competition === 'campionato');
  if (!campionatoOggi.length) return vuoto;

  const precedenti = righe.filter((r) => r.matchdayId !== matchdayId && r.competition === 'campionato');
  const ultimaPrima = precedenti.length ? Math.max(...precedenti.map((r) => r.serieA)) : null;

  const gironiDi = (dove: (r: Riga) => boolean): GironeCoppa[] => {
    const per = new Map<string, Riga[]>();
    for (const r of righe.filter((x) => x.competition === 'coppa' && dove(x))) {
      const k = r.gruppo || '—';
      const l = per.get(k) ?? [];
      l.push(r);
      per.set(k, l);
    }
    return [...per.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([gruppo, l]) => ({ gruppo: gruppo === '—' ? null : gruppo, righe: ordina(l) }));
  };

  const coppaOggi = righe.filter((r) => r.competition === 'coppa' && r.matchdayId === matchdayId);
  const coppaPrima = righe.filter((r) => r.competition === 'coppa' && r.matchdayId !== matchdayId);
  const ultimaCoppaPrima = coppaPrima.length ? Math.max(...coppaPrima.map((r) => r.serieA)) : null;

  return {
    dopo: ordina(campionatoOggi),
    prima: ultimaPrima == null ? null
      : ordina(precedenti.filter((r) => r.serieA === ultimaPrima)),
    gironi: coppaOggi.length ? gironiDi((r) => r.matchdayId === matchdayId) : [],
    gironiPrima: ultimaCoppaPrima == null ? [] : gironiDi((r) => r.serieA === ultimaCoppaPrima && r.matchdayId !== matchdayId),
  };
}

/** Tre punti a vittoria, uno a pareggio; a parità contano i fantapunti totali. */
function classifica(
  sfide: { casa: string; ospite: string; gc: number; go: number; fpc: number; fpo: number }[],
  nomi: Map<string, string>,
): RigaClassifica[] {
  const tab = new Map<string, { punti: number; fp: number }>();
  const tocca = (id: string) => {
    if (!tab.has(id)) tab.set(id, { punti: 0, fp: 0 });
    return tab.get(id)!;
  };
  for (const s of sfide) {
    const a = tocca(s.casa), b = tocca(s.ospite);
    a.fp += s.fpc; b.fp += s.fpo;
    if (s.gc > s.go) a.punti += 3;
    else if (s.go > s.gc) b.punti += 3;
    else { a.punti += 1; b.punti += 1; }
  }
  return [...tab.entries()]
    .map(([teamId, v]) => ({ teamId, nome: nomi.get(teamId) ?? '?', punti: v.punti, fp: v.fp }))
    .sort((x, y) => y.punti - x.punti || y.fp - x.fp)
    .map((r, i) => ({ teamId: r.teamId, nome: r.nome, punti: r.punti, posizione: i + 1 }));
}

async function leggiTipster(
  matchdayId: string, sfide: SfidaInGiornata[], nomi: Map<string, string>,
): Promise<TipsterGiornata[]> {
  const db = supabaseAdmin();
  const { data: slips } = await db.from('slips')
    .select('id, team_id, points').eq('matchday_id', matchdayId);
  if (!slips?.length) return [];

  const { data: picks } = await db.from('picks')
    .select('slip_id, fixture_id, market, outcome').in('slip_id', slips.map((s) => s.id));

  // chi ha perso la propria sfida, per l'autogol del tipster
  const haPerso = new Map<string, boolean>();
  const suaSfida = new Map<string, string>();
  for (const s of sfide) {
    haPerso.set(s.casa.teamId, s.casa.gol < s.ospite.gol);
    haPerso.set(s.ospite.teamId, s.ospite.gol < s.casa.gol);
    suaSfida.set(s.casa.teamId, s.fixtureId);
    suaSfida.set(s.ospite.teamId, s.fixtureId);
  }

  return slips.map((s) => {
    const mie = (picks ?? []).filter((p) => p.slip_id === s.id);
    const propria = mie.filter((p) => p.fixture_id === suaSfida.get(s.team_id as string));
    const indovinato = propria.some((p) => p.outcome === 'won');
    return {
      teamId: s.team_id as string,
      nome: nomi.get(s.team_id as string) ?? '?',
      punti: Number(s.points ?? 0),
      giocate: mie.length,
      azzeccate: mie.filter((p) => p.outcome === 'won').length,
      esatti: mie.filter((p) => p.market === 'exact' && p.outcome === 'won').length,
      controSeStesso: propria.length
        ? { indovinato, haPerso: haPerso.get(s.team_id as string) ?? false }
        : null,
    };
  });
}

// =====================================================================
// La generazione
// =====================================================================

export interface EsitoGenerazione {
  articoloId: string;
  versione: number;
  provider: 'gemini' | 'template';
  modello: string | null;
  tentativi: number;
  verifica: EsitoVerifica;
  testo: string;
  spunti: number;
}

export async function generaArticolo(
  matchdayId: string, opzioni: { tono?: number } = {},
): Promise<EsitoGenerazione> {
  const db = supabaseAdmin();
  const { leagueId, richiesta, contesto } = await costruisciMateriale(matchdayId);
  if (!richiesta.sfide.length) throw new Error('la giornata non ha sfide con il tabellino');

  if (opzioni.tono != null) richiesta.tono = Math.min(5, Math.max(1, opzioni.tono));
  const leciti = numeriLeciti(contesto, richiesta.spunti);

  const scrittore = scegliScrittore();
  let pezzo: Pezzo | null = null;
  let esito: EsitoVerifica | null = null;
  let usato: 'gemini' | 'template' = scrittore.nome;
  let modello = scrittore.modello;
  let tentativi = 0;

  for (let i = 0; i < MASSIMI_TENTATIVI; i++) {
    tentativi++;
    try {
      const candidato = await scrittore.scrivi(richiesta);
      const v = verificaPezzo(candidato, richiesta, leciti);
      pezzo = candidato; esito = v;
      if (v.ok) break;
      // seconda passata: gli si dice cosa non andava
      richiesta.correzioni = v.problemi;
    } catch (e) {
      esito = { ok: false, problemi: [`il modello non ha risposto: ${(e as Error).message}`], inventati: [], parole: {} };
      pezzo = null;
    }
  }

  // la rete di sicurezza: asciutto ma corretto, e parte sempre
  if (!pezzo || !esito?.ok) {
    const ripiego = await new ScrittoreTemplate().scrivi(richiesta);
    const v = verificaPezzo(ripiego, richiesta, leciti);
    const problemiPrima = esito?.problemi ?? [];
    pezzo = ripiego;
    usato = 'template'; modello = null;
    esito = { ...v, problemi: [...problemiPrima, ...v.problemi] };
  }

  const testo = montaMessaggio(pezzo, richiesta);

  const { data, error } = await db.from('news_articles').insert({
    league_id: leagueId, matchday_id: matchdayId,
    spunti: richiesta.spunti, corpo: pezzo, testo,
    tono: richiesta.tono, provider: usato, model: modello,
    verifica: { ...esito, tentativi },
  }).select('id, versione').single();
  if (error) throw new Error(`non sono riuscito a salvare l'articolo: ${error.message}`);

  return {
    articoloId: data.id as string, versione: data.versione as number,
    provider: usato, modello, tentativi, verifica: esito, testo,
    spunti: richiesta.spunti.length,
  };
}

/** Segna l'articolo come mandato. Chi lo manda è la pagina admin. */
export async function segnaInviato(articoloId: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from('news_articles').update({
    approved_at: new Date().toISOString(), sent_at: new Date().toISOString(),
  }).eq('id', articoloId);
}
