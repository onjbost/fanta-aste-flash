import { describe, it, expect } from 'vitest';
import { parseListone, findHeader, checkRosters } from './listone';
import { parseCsv } from './csv';

/** Le colonne dell'export vero di Leghe Fantacalcio. */
const HEADER = ['#', 'Nome', 'Fuori lista', 'Sq.', 'Under', 'R.', 'R.MANTRA', 'PGv', 'MV', 'FM', 'FVM/1000', 'QUOT.', 'FantaSquadra', 'Costo'];

const row = (over: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    '#': '2764', 'Nome': 'Martinez L.', 'Fuori lista': '', 'Sq.': 'Inter', 'Under': '29',
    'R.': 'A', 'R.MANTRA': 'Pc', 'PGv': '1', 'MV': '5.5', 'FM': '5', 'FVM/1000': '184',
    'QUOT.': '34', 'FantaSquadra': 'DEPORTIVO APERITIVO', 'Costo': '160',
  };
  return HEADER.map((h) => (over[h] !== undefined ? over[h]! : base[h]));
};

const grid = (...rows: string[][]) => [HEADER, ...rows];

describe('lettura del listone ufficiale', () => {
  it('legge una riga in rosa con costo e proprietario', () => {
    const { players } = parseListone(grid(row()));
    expect(players[0]).toEqual({
      extId: '2764', name: 'MARTINEZ L.', role: 'A', club: 'Inter',
      quotation: 34, outOfList: false, teamName: 'DEPORTIVO APERITIVO', price: 160,
    });
  });

  it('riconosce lo svincolato dalla fantasquadra vuota', () => {
    const { players } = parseListone(grid(row({ 'FantaSquadra': '', 'Costo': '' })));
    expect(players[0].teamName).toBeNull();
    expect(players[0].price).toBeNull();
  });

  it('legge il flag "fuori lista"', () => {
    const { players } = parseListone(grid(row({ 'Fuori lista': '*' })));
    expect(players[0].outOfList).toBe(true);
  });

  it('trova l\'intestazione anche con righe di titolo sopra', () => {
    const g = [['Lista calciatori Fanta Mansarda'], [], HEADER, row()];
    expect(findHeader(g).index).toBe(2);
    expect(parseListone(g).players).toHaveLength(1);
  });

  it('regge le colonne in ordine diverso', () => {
    const h = ['Nome', 'R.', 'Sq.', 'QUOT.', 'FantaSquadra', 'Costo'];
    const { players } = parseListone([h, ['Dimarco', 'D', 'Inter', '31', 'FC NTONIA', '62']]);
    expect(players[0]).toMatchObject({ name: 'DIMARCO', role: 'D', quotation: 31, price: 62 });
  });

  it('accetta anche il CSV con il punto e virgola', () => {
    const csv = 'Nome;R.;Sq.;QUOT.;FantaSquadra;Costo\nDimarco;D;Inter;31;FC NTONIA;62\n';
    const { players } = parseListone(parseCsv(csv));
    expect(players[0].price).toBe(62);
  });

  it('salta le righe senza ruolo valido invece di rompersi', () => {
    const { players, skipped } = parseListone(grid(row(), row({ 'Nome': 'Boh', 'R.': 'Z' })));
    expect(players).toHaveLength(1);
    expect(skipped[0]).toContain('Boh');
  });

  it('non perde un giocatore senza id: se lo costruisce dal nome', () => {
    const { players } = parseListone(grid(row({ '#': '' })));
    expect(players[0].extId).toContain('MARTINEZ');
  });

  it('un costo mancante in rosa vale zero, non NaN', () => {
    const { players } = parseListone(grid(row({ 'Costo': '' })));
    expect(players[0].price).toBe(0);
  });
});

describe('controllo delle rose prima di importare', () => {
  const roster = (team: string, comp: Record<string, number>, price: number) => {
    const out: string[][] = [];
    (['P', 'D', 'C', 'A'] as const).forEach((r) => {
      for (let i = 0; i < (comp[r] ?? 0); i++) {
        out.push(row({ '#': `${r}${i}${team}`, 'Nome': `${r}${i}`, 'R.': r, 'FantaSquadra': team, 'Costo': String(price) }));
      }
    });
    return out;
  };

  it('promuove una rosa 3-8-8-6 dentro il budget', () => {
    const g = grid(...roster('Montester United', { P: 3, D: 8, C: 8, A: 6 }, 19));
    const [c] = checkRosters(parseListone(g).players);
    expect(c.ok).toBe(true);
    expect(c.count).toBe(25);
    expect(c.spent).toBe(475);
    expect(c.left).toBe(25);
  });

  it('segnala una composizione sbagliata', () => {
    const g = grid(...roster('Real Sballo', { P: 2, D: 8, C: 8, A: 6 }, 10));
    const [c] = checkRosters(parseListone(g).players);
    expect(c.ok).toBe(false);
    expect(c.problems.join(' ')).toContain('2 P invece di 3');
  });

  it('segnala chi ha speso più di 500', () => {
    const g = grid(...roster('Spendaccioni', { P: 3, D: 8, C: 8, A: 6 }, 40));
    const [c] = checkRosters(parseListone(g).players);
    expect(c.ok).toBe(false);
    expect(c.problems.join(' ')).toContain('ha speso 1000');
  });
});
