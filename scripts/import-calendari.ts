/**
 * Import dei calendari: Serie A, campionato di lega, Coppa Mansarda.
 *
 *   npm run calendari -- --dry-run
 *   npm run calendari
 *
 * Legge i tre file in `dati/` (già verificati, vedi il documento di progetto)
 * e scrive giornate, partite di Serie A e sfide del fanta. È rieseguibile:
 * aggiorna quello che è cambiato e non tocca risultati, quote o schedine.
 *
 * Semifinali e finale di coppa nascono **senza squadre**: sono righe vuote
 * che l'admin riempie dall'app quando si sanno le qualificate.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env';

loadEnv();

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dir = (args.indexOf('--dati') >= 0 ? args[args.indexOf('--dati') + 1] : 'dati').replace(/\/$/, '');

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dry-run',
  { auth: { persistSession: false } },
);

// --------------------------------------------------------------- tipi
type SerieA = {
  offset_fanta: number;
  giornate: {
    serie_a: number; fanta: number | null; data: string;
    prima_partita_stimata: string; chiusura_schedine_stimata: string;
    partite: [string, string][];
  }[];
};
type Campionato = {
  squadre: string[];
  giornate: { fanta: number; serie_a: number; partite: [string, string][] }[];
};
type Coppa = {
  gruppi: Record<'A' | 'B', string[]>;
  giornate: {
    coppa: number; fase: 'gruppi' | 'semifinale' | 'finale'; serie_a: number;
    partite: [string, string][] | null;
  }[];
};

const leggi = <T,>(nome: string): T => JSON.parse(readFileSync(`${dir}/${nome}`, 'utf8')) as T;

// ---------------------------------------------------------------- main
async function main() {
  const serieA = leggi<SerieA>('serie_a_2026_27.json');
  const camp = leggi<Campionato>('fanta_calendario_2026_27.json');
  const coppa = leggi<Coppa>('coppa_mansarda_2026_27.json');

  console.log(`Serie A      ${serieA.giornate.length} giornate`);
  console.log(`Campionato   ${camp.giornate.length} giornate · ${camp.squadre.length} squadre`);
  console.log(`Coppa        ${coppa.giornate.length} giornate (${coppa.giornate.filter((g) => g.partite).length} con accoppiamenti)`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!DRY) throw new Error('Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env.local');
    console.log('\n(--dry-run senza chiavi: controllo solo i file)');
    controlla(serieA, camp, coppa, new Map());
    return;
  }

  const { data: leagues, error: eL } = await db.from('leagues').select('id, name').limit(1);
  if (eL) throw eL;
  if (!leagues?.length) throw new Error('Nessuna lega nel database: importa prima le rose.');
  const leagueId = leagues[0].id as string;

  const { data: teams, error: eT } = await db.from('teams').select('id, name').eq('league_id', leagueId);
  if (eT) throw eT;
  const perNome = new Map((teams ?? []).map((t) => [t.name.trim().toLowerCase(), t.id as string]));

  controlla(serieA, camp, coppa, perNome);
  if (DRY) { console.log('\n--dry-run: niente scritto.'); return; }

  // ------------------------------------------------------- giornate
  const righeMd = serieA.giornate.map((g) => ({
    league_id: leagueId,
    serie_a: g.serie_a,
    fanta: g.fanta,
    match_date: g.data,
    // lock_at lo ricalcola il trigger dalla prima partita
    first_kickoff_at: new Date(g.prima_partita_stimata).toISOString(),
    lock_at: new Date(g.chiusura_schedine_stimata).toISOString(),
  }));
  const { error: eMd } = await db.from('matchdays')
    .upsert(righeMd, { onConflict: 'league_id,serie_a', ignoreDuplicates: false });
  if (eMd) throw eMd;

  const { data: mds, error: eMd2 } = await db.from('matchdays')
    .select('id, serie_a').eq('league_id', leagueId);
  if (eMd2) throw eMd2;
  const mdId = new Map((mds ?? []).map((m) => [m.serie_a as number, m.id as string]));
  console.log(`\n✓ ${righeMd.length} giornate`);

  // ------------------------------------------- partite di Serie A
  const righeSa = serieA.giornate.flatMap((g) =>
    g.partite.map(([casa, ospite]) => ({
      matchday_id: mdId.get(g.serie_a)!, home_club: casa, away_club: ospite,
    })));
  const { error: eSa } = await db.from('serie_a_fixtures')
    .upsert(righeSa, { onConflict: 'matchday_id,home_club,away_club', ignoreDuplicates: true });
  if (eSa) throw eSa;
  console.log(`✓ ${righeSa.length} partite di Serie A`);

  // ------------------------------------------------ sfide del fanta
  const id = (nome: string) => {
    const v = perNome.get(nome.trim().toLowerCase());
    if (!v) throw new Error(`Squadra non trovata nel database: "${nome}"`);
    return v;
  };

  const sfide: Record<string, unknown>[] = [];
  for (const g of camp.giornate) {
    g.partite.forEach(([casa, ospite], i) => sfide.push({
      league_id: leagueId, matchday_id: mdId.get(g.serie_a)!,
      competition: 'campionato', phase: 'regular',
      round_number: g.fanta, slot: i + 1,
      home_team_id: id(casa), away_team_id: id(ospite),
    }));
  }
  for (const g of coppa.giornate) {
    if (g.partite) {
      g.partite.forEach(([casa, ospite], i) => sfide.push({
        league_id: leagueId, matchday_id: mdId.get(g.serie_a)!,
        competition: 'coppa', phase: 'gruppi',
        group_name: i < 2 ? 'A' : 'B',
        round_number: g.coppa, slot: i + 1,
        home_team_id: id(casa), away_team_id: id(ospite),
      }));
    } else {
      // semifinali: due sfide per giornata; finale: una. Squadre da mettere a mano.
      const quante = g.fase === 'finale' ? 1 : 2;
      for (let i = 0; i < quante; i++) sfide.push({
        league_id: leagueId, matchday_id: mdId.get(g.serie_a)!,
        competition: 'coppa', phase: g.fase,
        round_number: g.coppa, slot: i + 1,
        home_team_id: null, away_team_id: null,
      });
    }
  }
  const { error: eF } = await db.from('fixtures')
    .upsert(sfide, { onConflict: 'matchday_id,competition,slot', ignoreDuplicates: false });
  if (eF) throw eF;

  const campN = sfide.filter((s) => s.competition === 'campionato').length;
  console.log(`✓ ${campN} sfide di campionato · ${sfide.length - campN} di coppa`);
  console.log('\nSemifinali e finale sono righe vuote: gli accoppiamenti si mettono da /admin/coppa.');
}

// ------------------------------------------------------- controlli
function controlla(serieA: SerieA, camp: Campionato, coppa: Coppa, perNome: Map<string, string>) {
  const errori: string[] = [];
  const club = new Set<string>();

  for (const g of serieA.giornate) {
    const squadre = g.partite.flat();
    if (g.partite.length !== 10) errori.push(`Serie A ${g.serie_a}: ${g.partite.length} partite`);
    if (new Set(squadre).size !== squadre.length) errori.push(`Serie A ${g.serie_a}: squadra ripetuta`);
    squadre.forEach((c) => club.add(c));
  }
  const sa = new Set(serieA.giornate.map((g) => g.serie_a));
  for (const g of camp.giornate) {
    if (!sa.has(g.serie_a)) errori.push(`Campionato ${g.fanta}: manca la giornata Serie A ${g.serie_a}`);
    const squadre = g.partite.flat();
    if (g.partite.length !== 4) errori.push(`Campionato ${g.fanta}: ${g.partite.length} sfide`);
    if (new Set(squadre).size !== squadre.length) errori.push(`Campionato ${g.fanta}: squadra ripetuta`);
  }
  for (const g of coppa.giornate) {
    if (!sa.has(g.serie_a)) errori.push(`Coppa ${g.coppa}: manca la giornata Serie A ${g.serie_a}`);
  }
  if (perNome.size) {
    const nomi = new Set([
      ...camp.giornate.flatMap((g) => g.partite.flat()),
      ...coppa.giornate.flatMap((g) => g.partite?.flat() ?? []),
    ]);
    for (const n of nomi) {
      if (!perNome.has(n.trim().toLowerCase())) errori.push(`Squadra non nel database: "${n}"`);
    }
  }

  console.log(`\nControlli: ${club.size} club di Serie A, ${errori.length} problemi`);
  errori.forEach((e) => console.log(`  ✗ ${e}`));
  if (errori.length) throw new Error('Calendari incoerenti: niente scritto.');
  console.log('  ✓ tutto coerente');
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message
    : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
    : JSON.stringify(e);
  console.error('\n' + msg);
  process.exit(1);
});
