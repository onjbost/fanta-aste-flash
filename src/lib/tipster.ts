/**
 * Torneo dei Tipster — il motore delle quote.
 *
 * Funzioni pure, nessun accesso al database: qui dentro c'è tutta la
 * matematica del torneo, e i test la tengono onesta.
 *
 * L'idea in una riga: i fantapunti di una squadra non sono un numero ma una
 * distribuzione; la scala del fanta (66 = 1 gol, poi uno ogni 6) la trasforma
 * in una distribuzione di gol; la griglia congiunta dei due punteggi dà per
 * costruzione tutti e quattro i mercati. Quotare mercato per mercato, a mano,
 * produrrebbe quote che si contraddicono fra loro: così è impossibile.
 */
import type { Role } from './rules';

// =====================================================================
// 1 · dai fantapunti ai gol
// =====================================================================

/** Fantacalcio classico: sotto 66 zero gol, 66 il primo, poi uno ogni 6. */
export const SOGLIA_PRIMO_GOL = 66;
export const PASSO_GOL = 6;

export function golDaFantapunti(fp: number): number {
  if (fp < SOGLIA_PRIMO_GOL) return 0;
  return Math.floor((fp - SOGLIA_PRIMO_GOL) / PASSO_GOL) + 1;
}

/** Distribuzione normale: probabilità che X ≤ x. */
function phi(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Abramowitz–Stegun 7.1.26: precisione ~1e-7, più che sufficiente qui. */
function erf(x: number): number {
  const segno = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return segno * y;
}

export interface Distribuzione {
  /** media dei fantapunti di squadra */
  mu: number;
  /** deviazione standard */
  sd: number;
}

export const MAX_GOL = 8;

/**
 * Distribuzione dei gol di una squadra: `p[g]` è la probabilità di segnarne g.
 * L'ultima casella raccoglie anche le goleade oltre MAX_GOL, così la somma fa 1.
 */
export function distribuzioneGol(d: Distribuzione, maxGol = MAX_GOL): number[] {
  const p: number[] = [];
  for (let g = 0; g <= maxGol; g++) {
    const sopra = SOGLIA_PRIMO_GOL + PASSO_GOL * (g - 1);   // estremo inferiore
    const sotto = SOGLIA_PRIMO_GOL + PASSO_GOL * g;         // estremo superiore
    if (g === 0) p.push(phi((SOGLIA_PRIMO_GOL - d.mu) / d.sd));
    else if (g === maxGol) p.push(1 - phi((sopra - d.mu) / d.sd));
    else p.push(phi((sotto - d.mu) / d.sd) - phi((sopra - d.mu) / d.sd));
  }
  const somma = p.reduce((s, x) => s + x, 0);
  return p.map((x) => x / somma);
}

/** Griglia congiunta: `g[casa][ospite]`. I due punteggi sono indipendenti. */
export function griglia(casa: Distribuzione, ospite: Distribuzione, maxGol = MAX_GOL): number[][] {
  const a = distribuzioneGol(casa, maxGol);
  const b = distribuzioneGol(ospite, maxGol);
  return a.map((pa) => b.map((pb) => pa * pb));
}

// =====================================================================
// 2 · dai gol ai mercati
// =====================================================================

export type Mercato = '1x2' | 'ou' | 'gg' | 'exact';

export interface Esito {
  market: Mercato;
  selection: string;
  probability: number;
  price: number;
}

export const SOGLIE_OU = [1.5, 2.5, 3.5] as const;

export interface OpzioniQuote {
  /** soglie Over/Under da quotare */
  soglie?: readonly number[];
  /** probabilità minima perché un risultato esatto venga messo in lavagna */
  minProbEsatto?: number;
  /** quante caselle di risultato esatto al massimo */
  maxEsatti?: number;
}

/** Quota equa, senza margine: nessun banco deve guadagnarci. */
export function quotaDaProbabilita(p: number): number {
  if (p <= 0) throw new Error('probabilità nulla: esito non quotabile');
  return Math.max(1.01, Math.round((1 / p) * 100) / 100);
}

export function mercatiDaGriglia(g: number[][], opt: OpzioniQuote = {}): Esito[] {
  const soglie = opt.soglie ?? SOGLIE_OU;
  const minProb = opt.minProbEsatto ?? 0.01;
  const maxEsatti = opt.maxEsatti ?? 12;

  const somma = (test: (c: number, o: number) => boolean) => {
    let s = 0;
    for (let c = 0; c < g.length; c++) for (let o = 0; o < g[c].length; o++) {
      if (test(c, o)) s += g[c][o];
    }
    return s;
  };

  const esiti: Esito[] = [];
  const aggiungi = (market: Mercato, selection: string, p: number) => {
    if (p <= 0 || p >= 1) return;
    esiti.push({ market, selection, probability: p, price: quotaDaProbabilita(p) });
  };

  aggiungi('1x2', '1', somma((c, o) => c > o));
  aggiungi('1x2', 'X', somma((c, o) => c === o));
  aggiungi('1x2', '2', somma((c, o) => c < o));

  for (const s of soglie) {
    const over = somma((c, o) => c + o > s);
    aggiungi('ou', `over_${s}`, over);
    aggiungi('ou', `under_${s}`, 1 - over);
  }

  const gg = somma((c, o) => c > 0 && o > 0);
  aggiungi('gg', 'gg', gg);
  aggiungi('gg', 'ng', 1 - gg);

  const esatti: { sel: string; p: number }[] = [];
  for (let c = 0; c < g.length; c++) for (let o = 0; o < g[c].length; o++) {
    if (g[c][o] >= minProb) esatti.push({ sel: `${c}-${o}`, p: g[c][o] });
  }
  esatti.sort((x, y) => y.p - x.p);
  esatti.slice(0, maxEsatti).forEach((e) => aggiungi('exact', e.sel, e.p));

  return esiti;
}

/** Le quote di una sfida, dalle due distribuzioni. */
export function quoteSfida(casa: Distribuzione, ospite: Distribuzione, opt?: OpzioniQuote): Esito[] {
  return mercatiDaGriglia(griglia(casa, ospite), opt);
}

// =====================================================================
// 3 · risoluzione e punteggio
// =====================================================================

/** Un esito è azzeccato oppure no: qui non esistono rimborsi. */
export function risolvi(market: Mercato, selection: string, golCasa: number, golOspite: number): boolean {
  const tot = golCasa + golOspite;
  switch (market) {
    case '1x2':
      if (selection === '1') return golCasa > golOspite;
      if (selection === 'X') return golCasa === golOspite;
      if (selection === '2') return golCasa < golOspite;
      throw new Error(`esito 1x2 sconosciuto: ${selection}`);
    case 'ou': {
      const m = /^(over|under)_(\d+(?:\.\d+)?)$/.exec(selection);
      if (!m) throw new Error(`esito over/under sconosciuto: ${selection}`);
      const soglia = Number(m[2]);
      return m[1] === 'over' ? tot > soglia : tot < soglia;
    }
    case 'gg':
      if (selection === 'gg') return golCasa > 0 && golOspite > 0;
      if (selection === 'ng') return golCasa === 0 || golOspite === 0;
      throw new Error(`esito goal/nogoal sconosciuto: ${selection}`);
    case 'exact': {
      const m = /^(\d+)-(\d+)$/.exec(selection);
      if (!m) throw new Error(`risultato esatto malformato: ${selection}`);
      return Number(m[1]) === golCasa && Number(m[2]) === golOspite;
    }
  }
}

export const MOLTIPLICATORE = 10;

/**
 * Punti di una giocata azzeccata: moltiplicatore diviso il numero di giocate
 * fatte su quella sfida, per la quota congelata al momento della giocata.
 *
 * Con quote eque il valore atteso è sempre il moltiplicatore, qualunque sia
 * `n`: è la proprietà che tiene in piedi il torneo, ed è verificata nei test.
 */
export function puntiGiocata(price: number, giocateSullaSfida: number, moltiplicatore = MOLTIPLICATORE): number {
  if (giocateSullaSfida < 1) throw new Error('n deve essere almeno 1');
  return Math.round((moltiplicatore / giocateSullaSfida) * price * 100) / 100;
}

export interface GiocataDaRisolvere {
  fixtureId: string;
  market: Mercato;
  selection: string;
  price: number;
}
export interface RisultatoSfida { fixtureId: string; golCasa: number; golOspite: number }
export interface GiocataRisolta extends GiocataDaRisolvere {
  outcome: 'won' | 'lost' | 'void';
  multiplier: number | null;
  points: number;
}

/**
 * Risolve una schedina intera. Le sfide senza risultato restano `void` e non
 * portano punti: è il caso della giornata in attesa di un recupero.
 */
export function risolviSchedina(
  giocate: GiocataDaRisolvere[],
  risultati: RisultatoSfida[],
  moltiplicatore = MOLTIPLICATORE,
): { giocate: GiocataRisolta[]; punti: number } {
  const perSfida = new Map<string, number>();
  giocate.forEach((g) => perSfida.set(g.fixtureId, (perSfida.get(g.fixtureId) ?? 0) + 1));
  const esiti = new Map(risultati.map((r) => [r.fixtureId, r]));

  const risolte = giocate.map((g): GiocataRisolta => {
    const r = esiti.get(g.fixtureId);
    if (!r) return { ...g, outcome: 'void', multiplier: null, points: 0 };
    const n = perSfida.get(g.fixtureId) ?? 1;
    const presa = risolvi(g.market, g.selection, r.golCasa, r.golOspite);
    return {
      ...g,
      outcome: presa ? 'won' : 'lost',
      multiplier: Math.round((moltiplicatore / n) * 1000) / 1000,
      points: presa ? puntiGiocata(g.price, n, moltiplicatore) : 0,
    };
  });

  const punti = Math.round(risolte.reduce((s, g) => s + g.points, 0) * 100) / 100;
  return { giocate: risolte, punti };
}

// =====================================================================
// 4 · dalla rosa alla distribuzione
// =====================================================================

/**
 * Fantamedia attesa di un giocatore in base al ruolo e alla quotazione.
 *
 * Non è un modello raffinato ed è dichiaratamente provvisorio: serve a far
 * partire il torneo prima di avere uno storico nostro. I punti d'appoggio sono
 * il voto medio (6) per l'ultimo della lista e la fantamedia tipica del big di
 * ruolo; in mezzo si interpola. Quando avremo qualche giornata di fantapunti
 * veri, questa funzione viene sostituita dalla stima sui dati.
 */
const ANCORE: Record<Role, { qMax: number; fmMin: number; fmMax: number; sd: number }> = {
  P: { qMax: 20, fmMin: 5.9, fmMax: 6.6, sd: 2.2 },
  D: { qMax: 25, fmMin: 5.8, fmMax: 6.9, sd: 1.9 },
  C: { qMax: 40, fmMin: 5.8, fmMax: 7.4, sd: 2.1 },
  A: { qMax: 60, fmMin: 5.6, fmMax: 8.2, sd: 2.6 },
};

export function fantamediaAttesa(role: Role, quotazione: number): number {
  const a = ANCORE[role];
  const q = Math.max(1, Math.min(a.qMax, quotazione));
  // radice: i primi crediti valgono più degli ultimi
  const t = Math.sqrt((q - 1) / (a.qMax - 1));
  return Math.round((a.fmMin + t * (a.fmMax - a.fmMin)) * 1000) / 1000;
}

export interface GiocatoreTipster {
  playerId: string;
  role: Role;
  club: string;
  quotazione: number;
  /** chi non può giocare non entra nell'undici */
  disponibile?: boolean;
}

/** Modulo di riferimento per la stima: 3-4-3. */
export const MODULO: Record<Role, number> = { P: 1, D: 3, C: 4, A: 3 };

export interface ContestoClub {
  /** avversario di questo club nella giornata */
  avversario: string;
  /** true se il club gioca in casa */
  inCasa: boolean;
  /** partita rinviata con il 6 politico: i suoi giocatori valgono 6 secchi */
  seiPolitico?: boolean;
  /** partita rinviata in attesa di recupero: si gioca comunque, prima o poi */
  rinviata?: boolean;
}

export interface OpzioniStima {
  /** forza di ogni club di Serie A, in z-score (0 = media) */
  forzaClub?: Record<string, number>;
  /** quanto pesa la forza dell'avversario sul voto di un giocatore */
  pesoAvversario?: number;
  /** bonus di fantavoto per chi gioca in casa */
  bonusCasa?: number;
  /** incertezza del modello, sommata in varianza alla dispersione dei voti */
  sdModello?: number;
  /**
   * Correzione della media, in fantapunti, uguale per tutte le squadre.
   * È la manopola di taratura: quando avremo qualche giornata vera, si
   * confronta la media stimata con quella osservata e si sposta di qui.
   * Non cambia chi è favorito, cambia quanti gol ci si aspetta.
   */
  correzioneMedia?: number;
}

export interface StimaSquadra extends Distribuzione {
  undici: GiocatoreTipster[];
  /** contributo atteso di ogni titolare, per capire da dove viene la media */
  contributi: { playerId: string; fantavoto: number }[];
}

/**
 * Forza di un club di Serie A ricavata dal listone: somma delle quotazioni dei
 * suoi undici più cari, normalizzata a z-score. È un indicatore grezzo ma
 * onesto — il mercato del fanta prezza le squadre meglio di quanto farebbe una
 * classifica dell'anno prima.
 */
export function forzaClub(listone: { club: string; quotazione: number }[]): Record<string, number> {
  const perClub = new Map<string, number[]>();
  listone.forEach((p) => {
    const l = perClub.get(p.club) ?? [];
    l.push(p.quotazione);
    perClub.set(p.club, l);
  });
  const totali = [...perClub.entries()].map(([club, qs]) => ({
    club,
    valore: qs.sort((a, b) => b - a).slice(0, 11).reduce((s, q) => s + q, 0),
  }));
  if (!totali.length) return {};
  const media = totali.reduce((s, t) => s + t.valore, 0) / totali.length;
  const varianza = totali.reduce((s, t) => s + (t.valore - media) ** 2, 0) / totali.length;
  const sd = Math.sqrt(varianza) || 1;
  return Object.fromEntries(totali.map((t) => [t.club, (t.valore - media) / sd]));
}

/**
 * Stima la distribuzione dei fantapunti di una fantasquadra in una giornata.
 *
 * Sceglie l'undici più forte per quotazione dentro il modulo, corregge ogni
 * voto per l'avversario reale del club e per il fattore campo, e somma. La
 * deviazione viene dalla dispersione dei singoli voti più un termine di
 * incertezza del modello: senza quello, le quote sarebbero più sicure di
 * quanto il modello abbia diritto di essere.
 */
export function stimaSquadra(
  rosa: GiocatoreTipster[],
  contesti: Record<string, ContestoClub | undefined>,
  opt: OpzioniStima = {},
): StimaSquadra {
  const forza = opt.forzaClub ?? {};
  const peso = opt.pesoAvversario ?? 0.30;
  const bonusCasa = opt.bonusCasa ?? 0.15;
  const sdModello = opt.sdModello ?? 5;
  const correzione = opt.correzioneMedia ?? 0;

  const disponibili = rosa.filter((p) => p.disponibile !== false);
  const undici: GiocatoreTipster[] = [];
  (Object.keys(MODULO) as Role[]).forEach((r) => {
    undici.push(...disponibili
      .filter((p) => p.role === r)
      .sort((a, b) => b.quotazione - a.quotazione)
      .slice(0, MODULO[r]));
  });

  let mu = 0;
  let varianza = 0;
  const contributi = undici.map((p) => {
    const ctx = contesti[p.club];
    let fv: number;
    if (ctx?.seiPolitico) {
      fv = 6;                       // niente voto, niente bonus: 6 secco
      varianza += 0;                // e nessuna incertezza
    } else {
      const zAvv = ctx ? (forza[ctx.avversario] ?? 0) : 0;
      const casa = ctx?.inCasa ? bonusCasa : 0;
      fv = fantamediaAttesa(p.role, p.quotazione) - peso * zAvv + casa;
      varianza += ANCORE[p.role].sd ** 2;
    }
    mu += fv;
    return { playerId: p.playerId, fantavoto: Math.round(fv * 100) / 100 };
  });

  return {
    mu: Math.round((mu + correzione) * 100) / 100,
    sd: Math.round(Math.sqrt(varianza + sdModello ** 2) * 100) / 100,
    undici,
    contributi,
  };
}
