/**
 * Import dal listone ufficiale di Leghe Fantacalcio.
 *
 *   npm run import -- --file dati/lista_calciatori.xlsx --dry-run
 *   npm run import -- --file dati/lista_calciatori.xlsx
 *   npm run import -- --file dati/lista.csv --reset --admin "Montester United"
 *
 * Il file esportato dalla lega contiene già tutto: anagrafica, quotazioni,
 * la fantasquadra proprietaria e il costo pagato all'asta. Le righe senza
 * fantasquadra sono gli svincolati. Da qui l'app ricava squadre, rose,
 * crediti residui e listone in un colpo solo.
 *
 * Colonne riconosciute (xlsx o csv, in qualsiasi ordine):
 *   #            id del giocatore nel listone
 *   Nome         cognome
 *   Sq.          club di Serie A
 *   R.           ruolo classic (P/D/C/A)
 *   QUOT.        quotazione attuale
 *   Fuori lista  "*" per chi è fuori dalla lista della sua società
 *   FantaSquadra proprietario, vuoto = svincolato
 *   Costo        crediti pagati all'asta
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { parseCsv, nameKey } from '../src/lib/csv';
import { parseListone, checkRosters, type ListonePlayer } from '../src/lib/listone';
import { CALENDAR } from './calendar';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = args.includes('--dry-run');
const RESET = args.includes('--reset');

// Con --dry-run non si tocca il database, quindi le chiavi possono mancare:
// il client viene creato ma non contatta nessuno finché non parte una query.
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dry-run',
  { auth: { persistSession: false } },
);

function requireCredentials() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
}

// ------------------------------------------------------------- lettura

/** Legge xlsx o csv e restituisce una matrice di celle come stringhe. */
async function readGrid(path: string): Promise<string[][]> {
  if (extname(path).toLowerCase() === '.csv' || extname(path).toLowerCase() === '.txt') {
    return parseCsv(readFileSync(path, 'utf8'));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cell.value == null ? '' : String(
        typeof cell.value === 'object' && 'result' in cell.value
          ? (cell.value as { result: unknown }).result ?? ''
          : cell.value,
      ).trim();
    });
    grid.push(Array.from(cells, (c) => c ?? ''));
  });
  return grid;
}

// -------------------------------------------------------------- import

async function ensureLeague() {
  const { data } = await db.from('leagues').select('*').limit(1).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db.from('leagues')
    .insert({ name: 'Fanta Mansarda', season: '2026/2027' }).select().single();
  if (error) throw error;
  await db.from('auction_sessions').insert(CALENDAR.map((c) => ({
    league_id: created.id, number: c.number, auction_at: c.at,
    excludes_new_signings: c.winterWindow, status: 'scheduled',
  })));
  console.log('· Lega creata e calendario delle 15 aste caricato.');
  return created;
}

async function main() {
  const file = arg('file') ?? arg('listone');
  if (!file) {
    console.log('Uso: npm run import -- --file dati/lista_calciatori.xlsx [--dry-run] [--reset] [--admin "Nome Squadra"]');
    process.exit(1);
  }

  const grid = await readGrid(file);
  const { players, skipped } = parseListone(grid);

  const teamNames = [...new Set(players.map((p) => p.teamName).filter(Boolean))] as string[];
  const rostered = players.filter((p) => p.teamName);
  const free = players.filter((p) => !p.teamName);

  console.log(`\nLetto ${file}`);
  console.log(`· ${players.length} giocatori (${rostered.length} in rosa, ${free.length} svincolati)`);
  console.log(`· ${teamNames.length} squadre: ${teamNames.join(', ')}`);
  console.log(`· ${players.filter((p) => p.outOfList).length} segnati fuori lista`);
  if (skipped.length) console.log(`· ${skipped.length} righe saltate`);
  skipped.slice(0, 10).forEach((s) => console.log('  ⚠ ' + s));

  // controllo di sanità: composizione e spesa di ogni rosa
  console.log('\nRose:');
  const checks = checkRosters(players);
  for (const c of checks) {
    console.log(
      `  ${c.ok ? '✓' : '⚠'} ${c.teamName.padEnd(24)} ${c.count} giocatori ` +
      `(${c.composition.P}P ${c.composition.D}D ${c.composition.C}C ${c.composition.A}A) ` +
      `· spesi ${c.spent} · residui ${c.left}` +
      (c.ok ? '' : `  → ${c.problems.join('; ')}`),
    );
  }
  const anomalie = checks.filter((c) => !c.ok).length;
  if (anomalie) console.log(`\n  ⚠ ${anomalie} rose da controllare prima di importare.`);

  if (DRY) {
    console.log('\n(dry run: niente è stato scritto)');
    return;
  }

  requireCredentials();
  const league = await ensureLeague();

  if (RESET) {
    console.log('\n· --reset: cancello contratti e movimenti esistenti');
    await db.from('credit_movements').delete().eq('league_id', league.id);
    await db.from('contracts').delete().eq('league_id', league.id);
  } else {
    const { count } = await db.from('contracts')
      .select('id', { count: 'exact', head: true }).eq('league_id', league.id);
    if ((count ?? 0) > 0) {
      console.log(`\n⚠ Ci sono già ${count} contratti. Aggiorno solo il listone.`);
      console.log('  Per ricaricare anche le rose da zero: aggiungi --reset');
      await upsertPlayers(league.id, players);
      console.log('· Listone aggiornato.');
      return;
    }
  }

  // 1 · squadre
  const adminTeam = arg('admin');
  const { data: teams, error: tErr } = await db.from('teams').upsert(
    teamNames.map((name) => ({
      league_id: league.id, name, manager_name: name,
      is_admin: adminTeam ? nameKey(name) === nameKey(adminTeam) : false,
    })),
    { onConflict: 'league_id,name' },
  ).select();
  if (tErr) throw tErr;
  const teamId = new Map((teams ?? []).map((t) => [nameKey(t.name), t.id]));
  console.log(`\n· ${teams?.length} squadre pronte`);

  // 2 · listone
  await upsertPlayers(league.id, players);
  const { data: saved } = await db.from('players')
    .select('id, ext_id').eq('league_id', league.id);
  const playerId = new Map((saved ?? []).map((p) => [p.ext_id, p.id]));
  console.log(`· ${saved?.length} giocatori nel listone`);

  // 3 · contratti e crediti
  const contracts = rostered.map((p) => ({
    league_id: league.id,
    team_id: teamId.get(nameKey(p.teamName!))!,
    player_id: playerId.get(p.extId)!,
    price: p.price ?? 0,
    acquisition_type: 'initial_auction' as const,
  })).filter((c) => c.team_id && c.player_id);

  for (let i = 0; i < contracts.length; i += 500) {
    const { error } = await db.from('contracts').insert(contracts.slice(i, i + 500));
    if (error) throw error;
  }

  const spent = new Map<string, number>();
  contracts.forEach((c) => spent.set(c.team_id, (spent.get(c.team_id) ?? 0) + c.price));
  const movements = [...spent.entries()].flatMap(([team, amount]) => ([
    { league_id: league.id, team_id: team, amount: league.initial_credits, reason: 'initial', note: 'Budget iniziale' },
    { league_id: league.id, team_id: team, amount: -amount, reason: 'purchase', note: 'Asta iniziale' },
  ]));
  const { error: mErr } = await db.from('credit_movements').insert(movements);
  if (mErr) throw mErr;

  console.log(`· ${contracts.length} contratti e i crediti residui di ogni squadra\n`);
  console.log('Fatto. Adesso collega ogni allenatore alla sua squadra:');
  console.log("  update teams set user_id = (select id from auth.users where email = 'x@y.it'),");
  console.log("         email = 'x@y.it' where name = 'Nome Squadra';");
}

async function upsertPlayers(leagueId: string, players: ListonePlayer[]) {
  const rows = players.map((p) => ({
    league_id: leagueId, ext_id: p.extId, name: p.name, role: p.role,
    club: p.club, quotation: p.quotation, out_of_list: p.outOfList,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('players')
      .upsert(rows.slice(i, i + 500), { onConflict: 'league_id,ext_id' });
    if (error) throw error;
  }
}

main().catch((e) => { console.error('\n✗', e.message ?? e); process.exit(1); });
