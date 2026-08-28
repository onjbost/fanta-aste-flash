/**
 * Lettura del listone ufficiale di Leghe Fantacalcio.
 *
 * L'export della lega contiene già tutto: anagrafica, quotazioni, la
 * fantasquadra proprietaria e il costo pagato all'asta. Le righe senza
 * fantasquadra sono gli svincolati.
 */
import { normalizeHeader, normalizeRole, nameKey } from './csv';

export interface ListonePlayer {
  extId: string;
  name: string;
  role: 'P' | 'D' | 'C' | 'A';
  club: string;
  quotation: number;
  /** segnato "*" nella colonna "Fuori lista" */
  outOfList: boolean;
  /** null = svincolato */
  teamName: string | null;
  /** crediti pagati all'asta, solo per chi è in rosa */
  price: number | null;
}

/**
 * L'export della lega a volte ha una o due righe di intestazione libera prima
 * di quella vera. Cerco la riga che contiene davvero le colonne.
 */
export function findHeader(grid: string[][]): { index: number; map: Record<string, number> } {
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const norm = grid[i].map(normalizeHeader);
    const hasName = norm.some((h) => h === 'nome' || h === 'calciatore' || h === 'giocatore');
    const hasRole = norm.some((h) => h === 'r' || h === 'ruolo');
    if (hasName && hasRole) {
      const map: Record<string, number> = {};
      norm.forEach((h, c) => {
        // "#" si normalizza a stringa vuota: è la colonna dell'id del listone
        const key = h || (grid[i][c]?.trim() === '#' ? 'id' : '');
        if (key && !(key in map)) map[key] = c;
      });
      return { index: i, map };
    }
  }
  throw new Error('Non trovo la riga di intestazione: mi servono almeno le colonne "Nome" e "R."');
}

function col(map: Record<string, number>, ...aliases: string[]): number | undefined {
  for (const a of aliases) {
    const key = normalizeHeader(a);
    if (map[key] !== undefined) return map[key];
  }
  return undefined;
}

interface Parsed {
  extId: string;
  name: string;
  role: 'P' | 'D' | 'C' | 'A';
  club: string;
  quotation: number;
  outOfList: boolean;
  teamName: string | null;
  price: number | null;
}

export function parseListone(grid: string[][]): { players: ListonePlayer[]; skipped: string[] } {
  const { index, map } = findHeader(grid);
  const cId = col(map, 'Id', 'Codice');
  const cName = col(map, 'Nome', 'Calciatore', 'Giocatore');
  const cClub = col(map, 'Sq.', 'Squadra', 'Club');
  const cRole = col(map, 'R.', 'Ruolo', 'R');
  const cQuot = col(map, 'QUOT.', 'Quotazione', 'Qt.A', 'QtA', 'Qt');
  const cOut = col(map, 'Fuori lista', 'FuoriLista');
  const cTeam = col(map, 'FantaSquadra', 'Fantasquadra', 'Squadra fantacalcio');
  const cCost = col(map, 'Costo', 'Prezzo', 'Crediti');

  if (cName === undefined || cRole === undefined) throw new Error('Colonne Nome/R. mancanti.');

  const players: ListonePlayer[] = [];
  const skipped: string[] = [];

  for (let i = index + 1; i < grid.length; i++) {
    const row = grid[i];
    const name = (row[cName] ?? '').trim();
    const role = normalizeRole(row[cRole] ?? '');
    if (!name || !role) { if (name) skipped.push(`${name}: ruolo non riconosciuto`); continue; }

    const rawCost = cCost !== undefined ? (row[cCost] ?? '').trim() : '';
    const rawTeam = cTeam !== undefined ? (row[cTeam] ?? '').trim() : '';

    players.push({
      extId: (cId !== undefined && row[cId]) ? String(row[cId]).trim() : `n-${nameKey(name)}-${role}`,
      name: name.toUpperCase(),
      role,
      club: (cClub !== undefined ? row[cClub] ?? '' : '').trim() || '—',
      quotation: cQuot !== undefined ? Math.max(1, Number(row[cQuot]) || 1) : 1,
      outOfList: cOut !== undefined && (row[cOut] ?? '').trim() !== '',
      teamName: rawTeam || null,
      price: rawTeam ? (Number(rawCost) || 0) : null,
    });
  }
  return { players, skipped };
}


export interface RosterCheck {
  teamName: string;
  count: number;
  composition: Record<'P' | 'D' | 'C' | 'A', number>;
  spent: number;
  left: number;
  ok: boolean;
  problems: string[];
}

/**
 * Controllo di sanità prima di scrivere: ogni rosa deve essere 3-8-8-6 e non
 * può aver speso più del budget iniziale. Meglio accorgersene qui che a
 * mercato aperto.
 */
export function checkRosters(
  players: ListonePlayer[],
  roster = { P: 3, D: 8, C: 8, A: 6 },
  initialCredits = 500,
): RosterCheck[] {
  const teams = [...new Set(players.map((p) => p.teamName).filter(Boolean))] as string[];
  return teams.map((teamName) => {
    const mine = players.filter((p) => p.teamName === teamName);
    const composition = { P: 0, D: 0, C: 0, A: 0 };
    mine.forEach((p) => { composition[p.role] += 1; });
    const spent = mine.reduce((s, p) => s + (p.price ?? 0), 0);
    const problems: string[] = [];
    (['P', 'D', 'C', 'A'] as const).forEach((r) => {
      if (composition[r] !== roster[r]) {
        problems.push(`${composition[r]} ${r} invece di ${roster[r]}`);
      }
    });
    if (spent > initialCredits) problems.push(`ha speso ${spent} su ${initialCredits}`);
    return {
      teamName, count: mine.length, composition, spent,
      left: initialCredits - spent, ok: problems.length === 0, problems,
    };
  });
}
