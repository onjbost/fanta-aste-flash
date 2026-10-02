import 'server-only';
import { supabaseServer } from './supabase';
import type { Competizione, GiornataPerScadenze, Partita } from './home';

/**
 * Le letture della Home e delle classifiche, con le policy della lega:
 * sono tutti dati pubblici fra gli allenatori (sfide, risultati, classifiche).
 */

export interface Squadra { id: string; nome: string; stemma: string | null }

export interface RigaClassifica {
  teamId: string | null;
  nome: string;
  posizione: number;
  giocate: number | null;
  vinte: number | null;
  pari: number | null;
  perse: number | null;
  golFatti: number | null;
  golSubiti: number | null;
  differenza: number | null;
  punti: number | null;
  fantapunti: number | null;
}

export interface Classifiche {
  /** la giornata di Serie A dell'ultima fotografia, per dire «aggiornata alla…» */
  campionato: { giornata: number | null; righe: RigaClassifica[] };
  coppa: { giornata: number | null; gironi: Record<string, RigaClassifica[]> };
}

type RigaSfida = {
  id: string; competition: Competizione; phase: Partita['phase']; group_name: 'A' | 'B' | null;
  round_number: number; home_team_id: string | null; away_team_id: string | null;
  home_goals: number | null; away_goals: number | null;
  matchdays: { serie_a: number; fanta: number | null; first_kickoff_at: string } | null;
};

export async function squadreDellaLega(leagueId: string): Promise<Map<string, Squadra>> {
  const db = await supabaseServer();
  const [{ data: teams }, { data: loghi }] = await Promise.all([
    db.from('teams').select('id, name').eq('league_id', leagueId),
    // a parte: senza la migrazione 0029 fallisce solo questa, e restano le iniziali
    db.from('teams').select('id, logo_url').eq('league_id', leagueId),
  ]);
  const logo = new Map(((loghi ?? []) as { id: string; logo_url: string | null }[]).map((l) => [l.id, l.logo_url]));
  return new Map((teams ?? []).map((t) => [t.id, { id: t.id, nome: t.name, stemma: logo.get(t.id) ?? null }]));
}

/** Tutte le sfide della lega, campionato e coppa, con la data della loro giornata. */
export async function sfideDellaLega(leagueId: string): Promise<Partita[]> {
  const db = await supabaseServer();
  const { data } = await db.from('fixtures')
    .select('id, competition, phase, group_name, round_number, home_team_id, away_team_id, home_goals, away_goals, matchdays(serie_a, fanta, first_kickoff_at)')
    .eq('league_id', leagueId);
  return ((data ?? []) as unknown as RigaSfida[])
    .filter((r) => r.matchdays)
    .map((r) => ({
      id: r.id,
      competition: r.competition,
      phase: r.phase,
      groupName: r.group_name,
      round: r.round_number,
      serieA: r.matchdays!.serie_a,
      fanta: r.matchdays!.fanta,
      kickoff: r.matchdays!.first_kickoff_at,
      homeId: r.home_team_id,
      awayId: r.away_team_id,
      homeGoals: r.home_goals,
      awayGoals: r.away_goals,
    }));
}

export async function giornatePerScadenze(leagueId: string): Promise<GiornataPerScadenze[]> {
  const db = await supabaseServer();
  const { data } = await db.from('matchdays')
    .select('first_kickoff_at, lock_at, fanta')
    .eq('league_id', leagueId)
    .gte('first_kickoff_at', new Date(Date.now() - 86_400_000).toISOString())
    .order('first_kickoff_at')
    .limit(6);
  return (data ?? []).map((g) => ({ firstKickoffAt: g.first_kickoff_at, lockAt: g.lock_at, fanta: g.fanta }));
}

/**
 * Le classifiche come le scrive la lega, dall'ultima fotografia importata.
 *
 * Una fotografia per competizione: la coppa può essere ferma a una giornata
 * prima del campionato, e mostrarle entrambe all'ultima giornata in assoluto
 * lascerebbe la coppa vuota.
 */
export async function ultimeClassifiche(leagueId: string): Promise<Classifiche> {
  const db = await supabaseServer();
  const { data } = await db.from('standings_snapshots')
    .select('competition, group_name, team_id, team_name, posizione, giocate, vinte, pari, perse, gol_fatti, gol_subiti, differenza, punti, fantapunti, matchdays(serie_a)')
    .eq('league_id', leagueId);

  type R = {
    competition: Competizione; group_name: string; team_id: string | null; team_name: string;
    posizione: number; giocate: number | null; vinte: number | null; pari: number | null; perse: number | null;
    gol_fatti: number | null; gol_subiti: number | null; differenza: number | null;
    punti: number | null; fantapunti: number | null; matchdays: { serie_a: number } | null;
  };
  const righe = (data ?? []) as unknown as R[];
  const ultima = (c: Competizione) => {
    const g = righe.filter((r) => r.competition === c && r.matchdays).map((r) => r.matchdays!.serie_a);
    return g.length ? Math.max(...g) : null;
  };
  const verso = (r: R): RigaClassifica => ({
    teamId: r.team_id, nome: r.team_name, posizione: r.posizione,
    giocate: r.giocate, vinte: r.vinte, pari: r.pari, perse: r.perse,
    golFatti: r.gol_fatti, golSubiti: r.gol_subiti, differenza: r.differenza,
    punti: r.punti === null ? null : Number(r.punti),
    fantapunti: r.fantapunti === null ? null : Number(r.fantapunti),
  });

  const gc = ultima('campionato');
  const gk = ultima('coppa');
  const campionato = righe
    .filter((r) => r.competition === 'campionato' && r.matchdays?.serie_a === gc)
    .map(verso).sort((a, b) => a.posizione - b.posizione);
  const gironi: Record<string, RigaClassifica[]> = {};
  for (const r of righe.filter((x) => x.competition === 'coppa' && x.matchdays?.serie_a === gk)) {
    (gironi[r.group_name || '—'] ??= []).push(verso(r));
  }
  Object.values(gironi).forEach((l) => l.sort((a, b) => a.posizione - b.posizione));

  return { campionato: { giornata: gc, righe: campionato }, coppa: { giornata: gk, gironi } };
}
