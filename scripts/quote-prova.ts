/**
 * Anteprima delle quote di una giornata, senza toccare il database.
 *
 *   npm run quote -- --giornata 1
 *   npm run quote -- --giornata 1 --file dati/lista_calciatori.xlsx
 *
 * Legge il listone (rose e quotazioni), i calendari in `dati/` e stampa le
 * quote che il motore genererebbe. Serve per tarare il modello guardando i
 * numeri prima di pubblicarli in lega.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ExcelJS from 'exceljs';
import { parseCsv } from '../src/lib/csv';
import { parseListone } from '../src/lib/listone';
import {
  forzaClub, stimaSquadra, quoteSfida,
  type GiocatoreTipster, type ContestoClub,
} from '../src/lib/tipster';

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const GIORNATA = Number(arg('giornata') ?? 1);
const FILE = arg('file') ?? 'dati/lista_calciatori.xlsx';
const DIR = (arg('dati') ?? 'dati').replace(/\/$/, '');

async function readGrid(path: string): Promise<string[][]> {
  if (['.csv', '.txt'].includes(extname(path).toLowerCase())) {
    return parseCsv(readFileSync(path, 'utf8'));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const grid: string[][] = [];
  wb.worksheets[0].eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cell.value == null ? '' : String(
        typeof cell.value === 'object' && 'result' in cell.value
          ? (cell.value as { result: unknown }).result ?? '' : cell.value).trim();
    });
    grid.push(Array.from(cells, (c) => c ?? ''));
  });
  return grid;
}

async function main() {
  const { players } = parseListone(await readGrid(FILE));
  const serieA = JSON.parse(readFileSync(`${DIR}/serie_a_2026_27.json`, 'utf8'));
  const camp = JSON.parse(readFileSync(`${DIR}/fanta_calendario_2026_27.json`, 'utf8'));
  const coppa = JSON.parse(readFileSync(`${DIR}/coppa_mansarda_2026_27.json`, 'utf8'));

  const gCamp = camp.giornate.find((g: { fanta: number }) => g.fanta === GIORNATA);
  if (!gCamp) throw new Error(`giornata di campionato ${GIORNATA} inesistente`);
  const gSerieA = serieA.giornate.find((g: { serie_a: number }) => g.serie_a === gCamp.serie_a);
  const gCoppa = coppa.giornate.find((g: { serie_a: number }) => g.serie_a === gCamp.serie_a);

  // chi affronta chi in Serie A quella giornata, dal punto di vista di ogni club
  const contesti: Record<string, ContestoClub> = {};
  for (const [casa, ospite] of gSerieA.partite as [string, string][]) {
    contesti[casa] = { avversario: ospite, inCasa: true };
    contesti[ospite] = { avversario: casa, inCasa: false };
  }

  const forza = forzaClub(players.map((p) => ({ club: p.club, quotazione: p.quotation })));
  const rose = new Map<string, GiocatoreTipster[]>();
  players.filter((p) => p.teamName).forEach((p) => {
    const l = rose.get(p.teamName!) ?? [];
    l.push({ playerId: p.extId, role: p.role, club: p.club, quotazione: p.quotation });
    rose.set(p.teamName!, l);
  });

  const stime = new Map([...rose].map(([nome, rosa]) =>
    [nome, stimaSquadra(rosa, contesti, { forzaClub: forza })]));

  console.log(`\nGiornata di campionato ${GIORNATA} · Serie A ${gCamp.serie_a} · ${gCamp.data}\n`);
  console.log('Fantapunti attesi:');
  [...stime].sort((a, b) => b[1].mu - a[1].mu)
    .forEach(([n, s]) => console.log(`  ${n.padEnd(24)} ${s.mu.toFixed(1)} ± ${s.sd.toFixed(1)}`));

  const sfide: [string, string, string][] = [
    ...(gCamp.partite as [string, string][]).map(([c, o]) => ['campionato', c, o] as [string, string, string]),
    ...((gCoppa?.partite ?? []) as [string, string][]).map(([c, o]) => ['coppa', c, o] as [string, string, string]),
  ];

  for (const [comp, casa, ospite] of sfide) {
    const a = stime.get(casa); const b = stime.get(ospite);
    if (!a || !b) { console.log(`\n  ⚠ rosa mancante per ${!a ? casa : ospite}`); continue; }
    const esiti = quoteSfida(a, b);
    const q = (m: string, s: string) => {
      const e = esiti.find((x) => x.market === m && x.selection === s);
      return e ? e.price.toFixed(2) : '—';
    };
    console.log(`\n${comp.toUpperCase()}  ${casa} – ${ospite}`);
    console.log(`  1 ${q('1x2', '1')}   X ${q('1x2', 'X')}   2 ${q('1x2', '2')}`
      + `   ·   Over 2.5 ${q('ou', 'over_2.5')}  Under 2.5 ${q('ou', 'under_2.5')}`
      + `   ·   GG ${q('gg', 'gg')}  NG ${q('gg', 'ng')}`);
    console.log('  esatti: ' + esiti.filter((e) => e.market === 'exact')
      .sort((x, y) => x.price - y.price).slice(0, 5)
      .map((e) => `${e.selection} @ ${e.price.toFixed(2)}`).join('  ') + '  …');
  }
  console.log();
}

main().catch((e) => { console.error('\n' + (e instanceof Error ? e.message : String(e))); process.exit(1); });
