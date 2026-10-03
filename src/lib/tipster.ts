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
import { fantavotoConForma, type Forma } from './forma';

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

/**
 * La lavagna dei risultati esatti è **fissa**: sempre gli stessi sedici
 * punteggi, più «altro» che raccoglie tutto il resto.
 *
 * Due motivi. Uno di sostanza: così ogni risultato possibile è giocabile e la
 * somma delle probabilità fa esattamente 1, quindi il valore atteso resta
 * dieci punti anche per chi punta sul 5-2. Uno pratico: la lavagna non cambia
 * forma da una sfida all'altra, e l'occhio trova sempre la casella dov'era.
 */
export const ESATTI_FISSI = [
  '1-0', '2-0', '3-0',
  '2-1', '3-1', '3-2',
  '0-1', '0-2', '0-3',
  '1-3', '1-2', '2-3',
  '0-0', '1-1', '2-2', '3-3',
] as const;
export const ALTRO = 'altro';

export interface OpzioniQuote {
  /** soglie Over/Under da quotare */
  soglie?: readonly number[];
}

/** Quota equa, senza margine: nessun banco deve guadagnarci. */
export function quotaDaProbabilita(p: number): number {
  if (p <= 0) throw new Error('probabilità nulla: esito non quotabile');
  return Math.max(1.01, Math.round((1 / p) * 100) / 100);
}

export function mercatiDaGriglia(g: number[][], opt: OpzioniQuote = {}): Esito[] {
  const soglie = opt.soglie ?? SOGLIE_OU;

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

  let coperto = 0;
  for (const sel of ESATTI_FISSI) {
    const [c, o] = sel.split('-').map(Number);
    const p = g[c]?.[o] ?? 0;
    coperto += p;
    aggiungi('exact', sel, p);
  }
  aggiungi('exact', ALTRO, 1 - coperto);

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
      // «altro» vince quando il risultato non è nessuno dei sedici in lavagna
      if (selection === ALTRO) {
        return !(ESATTI_FISSI as readonly string[]).includes(`${golCasa}-${golOspite}`);
      }
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
  /**
   * La forma delle ultime giornate, quando abbiamo i voti. Sposta il
   * fantavoto atteso e, con la titolarità, la scelta dell'undici.
   */
  forma?: Pick<Forma, 'fantamedia' | 'peso' | 'titolarita'> | null;
}

/**
 * Il fantavoto che ci si aspetta da un giocatore, a campo neutro: la stima da
 * quotazione, corretta dalla forma quando c'è.
 */
export function fantavotoAtteso(p: GiocatoreTipster): number {
  return fantavotoConForma(fantamediaAttesa(p.role, p.quotazione), p.forma);
}

/**
 * L'ordine in cui si sceglie l'undici: chi rende di più, pesato per quanto è
 * probabile che giochi. Senza voti è la quotazione, come prima; con i voti,
 * chi non prende voto da tre giornate scivola dietro chi gioca.
 */
export function priorita(p: GiocatoreTipster): number {
  const t = p.forma?.titolarita;
  return fantavotoAtteso(p) * (t == null ? 1 : 0.4 + 0.6 * t);
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

// =====================================================================
// 5 bis · quello che è successo davvero
// =====================================================================

/** Una giornata già archiviata di questa squadra. */
export interface GiornataGiocata {
  fanta: number;
  fantapunti: number;
}

/**
 * Quante giornate «vale» la stima da listone nella fusione.
 *
 * Non è un numero scelto a sentimento. Con i dati delle prime giornate della
 * lega, la differenza vera di forza fra le squadre vale circa 2,8 fantapunti
 * di deviazione, mentre il rumore di una singola giornata ne vale circa 6. Il
 * rapporto fra le due varianze — 36 su 8 — dice quanto peso dare al prior, e
 * viene poco sopra il 4. Rivedibile quando ci saranno più giornate: è per
 * questo che è un'impostazione di lega e non una costante murata nel codice.
 */
export const PESO_LISTONE = 4;

/**
 * Quanto scende il peso di una giornata per ogni giornata di distanza.
 *
 * Serve a far contare l'ultima domenica più della prima, senza inseguirla:
 * con 0,85 la giornata scorsa pesa 1, quella prima 0,85, quella prima ancora
 * 0,72. Una squadra che cambia passo si vede in due o tre giornate.
 */
export const DECADIMENTO = 0.85;

export interface OpzioniFusione {
  pesoListone?: number;
  decadimento?: number;
}

export interface Fusione {
  /** la base dopo la fusione: è questa che finisce nella stima */
  base: number;
  /** la media pesata di quello che la squadra ha fatto davvero, se ha giocato */
  osservata: number | null;
  /** quante giornate sono entrate nel conto */
  giornate: number;
}

/**
 * Fonde la forza stimata dal listone con quella dimostrata sul campo.
 *
 * `base` pesa quanto `pesoListone` giornate; ogni giornata giocata pesa uno.
 * Con quattro giornate in archivio le due contano uguale, con dodici comanda
 * il campo. È lo schema classico dello scostamento verso la media: con pochi
 * dati non si crede a una squadra che ha fatto novanta una volta sola, con
 * tanti dati non si continua a crederle sulla parola del listone.
 *
 * Il decadimento sposta la **stima**, non la **fiducia**: i pesi si
 * rinormalizzano perché la loro somma resti il numero di giornate giocate.
 * Altrimenti la fiducia si fermerebbe a un tetto — con 0,85 non supererebbe
 * mai le 6,7 giornate equivalenti — e il listone non si toglierebbe più di
 * mezzo nemmeno a stagione finita.
 */
export function fondiConLoStorico(
  base: number, storico: GiornataGiocata[], opt: OpzioniFusione = {},
): Fusione {
  const k = opt.pesoListone ?? PESO_LISTONE;
  const decadimento = opt.decadimento ?? DECADIMENTO;
  const giocate = (storico as GiornataGiocata[]).filter((g) => Number.isFinite(g.fantapunti));
  const n = giocate.length;
  if (!n) return { base, osservata: null, giornate: 0 };

  const piuRecente = Math.max(...giocate.map((g) => g.fanta));
  let pesi = 0;
  let somma = 0;
  for (const g of giocate) {
    const w = Math.pow(decadimento, Math.max(0, piuRecente - g.fanta));
    pesi += w;
    somma += w * g.fantapunti;
  }
  const osservata = somma / pesi;

  return {
    base: (n * osservata + k * base) / (n + k),
    osservata: Math.round(osservata * 100) / 100,
    giornate: n,
  };
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
   *
   * Si applica alla base **prima** della fusione con lo storico: dopo
   * sarebbe una correzione su un numero che lo storico ha già corretto, e
   * si conterebbe due volte lo stesso livello.
   */
  correzioneMedia?: number;
  /**
   * Le giornate già giocate da questa squadra, per correggere la stima con
   * quello che è successo davvero. Solo giornate **precedenti** a quella che
   * si sta quotando: mettere dentro la giornata in corso vorrebbe dire
   * quotare sapendo il risultato.
   */
  storico?: GiornataGiocata[];
  /** quante giornate vale il listone nella fusione (default PESO_LISTONE) */
  pesoListone?: number;
  /** quanto scende il peso di una giornata per ogni giornata indietro */
  decadimento?: number;
}

export interface StimaSquadra extends Distribuzione {
  undici: GiocatoreTipster[];
  /** contributo atteso di ogni titolare, per capire da dove viene la media */
  contributi: { playerId: string; fantavoto: number }[];
  /** la forza neutra secondo il solo listone, taratura compresa */
  baseListone: number;
  /** quella usata davvero, dopo la fusione con le giornate giocate */
  base: number;
  /** la media pesata delle giornate giocate, o null se non ne ha giocate */
  osservata: number | null;
  /** quante giornate sono entrate nella fusione */
  giornate: number;
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
 * Sceglie l'undici più forte dentro il modulo — per quotazione e forma,
 * pesando chi gioca davvero (`fantavotoAtteso`, `priorita`) — corregge ogni
 * voto per l'avversario reale del club e per il fattore campo, e somma. La
 * deviazione viene dalla dispersione dei singoli voti più un termine di
 * incertezza del modello: senza quello, le quote sarebbero più sicure di
 * quanto il modello abbia diritto di essere.
 *
 * Con `storico` entra anche quello che la squadra ha fatto davvero, e qui c'è
 * l'unica finezza che conta. La media osservata è mediata su avversari
 * diversi; la correzione di giornata riguarda l'avversario di adesso. Sommare
 * le due sarebbe mescolare una cosa generale con una specifica. Quindi la
 * media si scompone in due pezzi — una **base neutra**, che è la forza della
 * rosa senza avversario né campo, e un **aggiustamento** che vale solo per
 * questa giornata — si fonde con lo storico la sola base, e l'aggiustamento
 * si riapplica sopra. Così una squadra in forma resta in forma anche quando
 * le capita l'avversario duro, che è come deve essere.
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
      .sort((a, b) => priorita(b) - priorita(a) || b.quotazione - a.quotazione)
      .slice(0, MODULO[r]));
  });

  let neutra = 0;                 // la rosa senza avversario né campo
  let aggiustamento = 0;          // quanto la sposta questa giornata
  let varianza = 0;
  const contributi = undici.map((p) => {
    const ctx = contesti[p.club];
    const nudo = fantavotoAtteso(p);
    let fv: number;
    if (ctx?.seiPolitico) {
      fv = 6;                       // niente voto, niente bonus: 6 secco
      varianza += 0;                // e nessuna incertezza
    } else {
      const zAvv = ctx ? (forza[ctx.avversario] ?? 0) : 0;
      const casa = ctx?.inCasa ? bonusCasa : 0;
      fv = nudo - peso * zAvv + casa;
      varianza += ANCORE[p.role].sd ** 2;
    }
    neutra += nudo;
    aggiustamento += fv - nudo;
    return { playerId: p.playerId, fantavoto: Math.round(fv * 100) / 100 };
  });

  const baseListone = neutra + correzione;
  const fusa = fondiConLoStorico(baseListone, opt.storico ?? [], {
    pesoListone: opt.pesoListone, decadimento: opt.decadimento,
  });

  return {
    mu: Math.round((fusa.base + aggiustamento) * 100) / 100,
    sd: Math.round(Math.sqrt(varianza + sdModello ** 2) * 100) / 100,
    undici,
    contributi,
    baseListone: Math.round(baseListone * 100) / 100,
    base: Math.round(fusa.base * 100) / 100,
    osservata: fusa.osservata,
    giornate: fusa.giornate,
  };
}
