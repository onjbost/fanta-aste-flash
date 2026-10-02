/**
 * Torneo dei Tipster — le quote col metodo Monte Carlo.
 *
 * Funzioni pure, nessun database. Il modello analitico di `tipster.ts`
 * tratta i fantapunti di una squadra come una normale: comodo, ma il fanta
 * non è normale. Un gol vale tre punti tutti insieme, un attaccante o segna
 * o non segna, chi non gioca lascia un buco che la riserva tappa solo se
 * c'è, e due fantasquadre che schierano giocatori della stessa squadra di
 * Serie A salgono e scendono insieme. Qui la giornata si gioca davvero, per
 * ventimila volte, giocatore per giocatore:
 *
 *  1. ogni club di Serie A pesca la sua «giornata» (bene o male), che
 *     sposta voti, gol e assist di tutti i suoi giocatori — anche quelli
 *     schierati da squadre diverse, ed è così che nasce la correlazione;
 *  2. ogni titolare gioca o no (la titolarità dai voti delle ultime
 *     giornate); chi non gioca lascia il posto alla prima riserva dello
 *     stesso ruolo che gioca, fino a tre cambi;
 *  3. chi gioca pesca voto, gol, assist e cartellini; il portiere pesca i
 *     gol subiti dall'attacco che ha davanti, con la porta inviolata;
 *  4. la somma diventa gol con la scala del fanta, e le due squadre di una
 *     sfida riempiono la griglia dei risultati.
 *
 * Dalla griglia escono i mercati con lo stesso codice del modello analitico
 * (`mercatiDaGriglia`): le quote restano coerenti fra loro per costruzione.
 *
 * Il **livello** delle medie resta quello tarato di `stimaSquadra` (listone,
 * forma, avversario, storico della squadra, correzione di lega): il Monte
 * Carlo aggiunge la **forma** della distribuzione e le dipendenze, non
 * inventa un livello suo. L'unica cosa che sposta la media di una squadra
 * rispetto alle altre è il rischio di formazione: chi ha titolari incerti e
 * panchina corta perde in media più punti di chi no.
 *
 * Il generatore di numeri casuali ha un seme: rigenerare le quote della
 * stessa giornata con gli stessi dati dà le stesse quote.
 */

import type { Role } from './rules';
import {
  MAX_GOL, fantavotoAtteso, golDaFantapunti, griglia, mercatiDaGriglia, priorita,
  stimaSquadra, type ContestoClub, type Esito, type GiocatoreTipster, type OpzioniStima,
  type StimaSquadra,
} from './tipster';

// =====================================================================
// il caso, con un seme
// =====================================================================

/** mulberry32: piccolo, veloce e più che buono per questo. */
export function generatore(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un seme da una stringa: l'id della giornata. */
export function semeDa(testo: string): number {
  let h = 2166136261;
  for (let i = 0; i < testo.length; i++) h = Math.imul(h ^ testo.charCodeAt(i), 16777619);
  return h >>> 0;
}

function normale(r: () => number): number {
  // Box-Muller
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function poisson(r: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  const l = Math.exp(-lambda);
  let k = 0;
  let p = r();
  while (p > l) { k++; p *= r(); }
  return k;
}

// =====================================================================
// il giocatore
// =====================================================================

/** Quanto del bonus atteso arriva dai gol, per ruolo; il resto sono assist. */
const QUOTA_GOL: Record<Role, number> = { P: 0, D: 0.5, C: 0.55, A: 0.8 };
const P_AMMONIZIONE = 0.18;
const P_ESPULSIONE = 0.01;
/** dispersione del voto puro di un giocatore, a parità di giornata del club */
const SD_VOTO = 0.55;
/** quanto la giornata del club sposta il voto e moltiplica gol e assist */
const PESO_CLUB_VOTO = 0.25;
const PESO_CLUB_GOL = 0.25;
/** gol subiti attesi da un portiere contro un attacco medio */
const GOL_SUBITI_MEDI = 1.25;
/** chi non ha ancora una titolarità misurata gioca quasi sempre */
const P_GIOCA_DEFAULT = 0.92;
/** una riserva entra e prende voto meno spesso di un titolare */
const P_GIOCA_RISERVA = 0.55;
const MAX_CAMBI = 3;

export interface Pesca {
  playerId: string;
  role: Role;
  club: string;
  /** il fantavoto medio che il giocatore deve avere in questa giornata */
  media: number;
  pGioca: number;
  /** partita rinviata col 6 politico */
  seiPolitico: boolean;
  /** il club avversario, per i gol subiti del portiere */
  avversario: string | null;
}

/**
 * Un fantavoto pescato. Il voto puro e i bonus sono tarati perché la media
 * venga `media`: chi ha un fantavoto atteso alto ce l'ha soprattutto per i
 * gol, non per un voto in pagella più alto di due punti.
 */
export function pescaFantavoto(
  g: Pesca, r: () => number, zClub: number, zAvversario: number, forzaAvversario: number,
  portaInviolata = 1,
): number {
  if (g.seiPolitico) return 6;
  const amm = (r() < P_AMMONIZIONE ? -0.5 : 0) + (r() < P_ESPULSIONE ? -1 : 0);
  const mediaMalus = -0.5 * P_AMMONIZIONE - P_ESPULSIONE;

  if (g.role === 'P') {
    const lambdaMedia = GOL_SUBITI_MEDI * Math.exp(0.25 * forzaAvversario);
    const votoMedio = g.media + lambdaMedia - Math.exp(-lambdaMedia) * portaInviolata - mediaMalus;
    const lambda = lambdaMedia * Math.exp(PESO_CLUB_GOL * zAvversario - 0.15 * zClub);
    const gs = poisson(r, lambda);
    const voto = votoMedio + PESO_CLUB_VOTO * zClub + SD_VOTO * normale(r);
    return Math.round(voto * 2) / 2 - gs + (gs === 0 ? portaInviolata : 0) + amm;
  }

  let votoMedio = 6 + 0.3 * (g.media - 6);
  let bonus = g.media - votoMedio - mediaMalus;
  if (bonus < 0) { votoMedio += bonus; bonus = 0; }
  const molt = Math.exp(PESO_CLUB_GOL * zClub);
  const gol = poisson(r, (QUOTA_GOL[g.role] * bonus / 3) * molt);
  const assist = poisson(r, ((1 - QUOTA_GOL[g.role]) * bonus) * molt);
  const voto = votoMedio + PESO_CLUB_VOTO * zClub + SD_VOTO * normale(r);
  return Math.round(voto * 2) / 2 + 3 * gol + assist + amm;
}

// =====================================================================
// la squadra
// =====================================================================

export interface FormazioneMC {
  titolari: Pesca[];
  panchina: Pesca[];
  stima: StimaSquadra;
}

/**
 * Titolari e panchina di una fantasquadra per la simulazione, con la media
 * di ogni giocatore corretta per l'avversario e il campo esattamente come
 * fa `stimaSquadra`.
 */
export function formazioneMC(
  rosa: GiocatoreTipster[], contesti: Record<string, ContestoClub | undefined>, opt: OpzioniStima = {},
): FormazioneMC {
  const stima = stimaSquadra(rosa, contesti, opt);
  const peso = opt.pesoAvversario ?? 0.30;
  const bonusCasa = opt.bonusCasa ?? 0.15;
  const forza = opt.forzaClub ?? {};

  const pesca = (p: GiocatoreTipster, riserva: boolean): Pesca => {
    const ctx = contesti[p.club];
    const zAvv = ctx ? (forza[ctx.avversario] ?? 0) : 0;
    const t = p.forma?.titolarita;
    return {
      playerId: p.playerId,
      role: p.role,
      club: p.club,
      media: ctx?.seiPolitico ? 6 : fantavotoAtteso(p) - peso * zAvv + (ctx?.inCasa ? bonusCasa : 0),
      pGioca: Math.min(riserva ? P_GIOCA_RISERVA : 1, t == null ? P_GIOCA_DEFAULT : Math.max(0.05, t)),
      seiPolitico: Boolean(ctx?.seiPolitico),
      avversario: ctx?.avversario ?? null,
    };
  };

  const dentro = new Set(stima.undici.map((p) => p.playerId));
  const panchina = rosa
    .filter((p) => p.disponibile !== false && !dentro.has(p.playerId))
    .sort((a, b) => priorita(b) - priorita(a));
  return {
    titolari: stima.undici.map((p) => pesca(p, false)),
    panchina: panchina.map((p) => pesca(p, true)),
    stima,
  };
}

/** Una giornata simulata di una squadra: i fantapunti, prima del livello. */
function giocaSquadra(
  f: FormazioneMC, r: () => number, z: Map<string, number>, forza: Record<string, number>,
): { totale: number; previsto: number } {
  let totale = 0;
  let previsto = 0;
  let cambi = 0;
  const usate = new Set<number>();
  const zDi = (c: string | null) => (c ? z.get(c) ?? 0 : 0);

  const gioca = (g: Pesca) => g.seiPolitico || r() < g.pGioca;
  const fv = (g: Pesca) => pescaFantavoto(g, r, zDi(g.club), zDi(g.avversario), g.avversario ? forza[g.avversario] ?? 0 : 0);

  for (const t of f.titolari) {
    previsto += t.media;
    if (gioca(t)) { totale += fv(t); continue; }
    if (cambi >= MAX_CAMBI) continue;
    // la prima riserva dello stesso ruolo che prende voto
    for (let i = 0; i < f.panchina.length; i++) {
      const p = f.panchina[i];
      if (usate.has(i) || p.role !== t.role) continue;
      usate.add(i);
      if (gioca(p)) { totale += fv(p); cambi++; break; }
    }
  }
  return { totale, previsto };
}

export interface OpzioniMC {
  /** quante giornate simulare */
  n?: number;
  seme?: number;
  forzaClub?: Record<string, number>;
  /** incertezza del modello sul livello di ogni squadra, in fantapunti */
  sdModello?: number;
  /** quanto pesa la simulazione contro il modello analitico nelle caselle rare */
  lisciatura?: number;
}

export const SIMULAZIONI = 20_000;

export interface SimulazioneGiornata {
  /** i fantapunti simulati di ogni squadra, una riga per simulazione */
  punti: Map<string, Float64Array>;
  n: number;
  /** media e deviazione dei fantapunti simulati, per squadra */
  riepilogo: Map<string, { media: number; sd: number }>;
}

/**
 * Gioca la giornata `n` volte per tutte le squadre insieme: è insieme che
 * devono giocarla, perché la giornata di un club di Serie A è la stessa per
 * tutti quelli che ne schierano un giocatore.
 */
export function simulaGiornata(
  squadre: Map<string, FormazioneMC>, opt: OpzioniMC = {},
): SimulazioneGiornata {
  const n = opt.n ?? SIMULAZIONI;
  const r = generatore(opt.seme ?? 1);
  const forza = opt.forzaClub ?? {};
  const sdModello = opt.sdModello ?? 5;

  const club = new Set<string>();
  for (const f of squadre.values()) {
    for (const g of [...f.titolari, ...f.panchina]) {
      club.add(g.club);
      if (g.avversario) club.add(g.avversario);
    }
  }
  const elencoClub = [...club];

  const grezzi = new Map<string, Float64Array>();
  const previsti = new Map<string, number>();
  for (const id of squadre.keys()) grezzi.set(id, new Float64Array(n));

  const z = new Map<string, number>();
  for (let s = 0; s < n; s++) {
    for (const c of elencoClub) z.set(c, normale(r));
    for (const [id, f] of squadre) {
      const { totale, previsto } = giocaSquadra(f, r, z, forza);
      grezzi.get(id)![s] = totale;
      if (s === 0) previsti.set(id, previsto);
    }
  }

  /*
   * Il livello. Ogni squadra viene riportata alla media tarata della sua
   * stima, meno quello che perde per i titolari che non giocano. La
   * perdita media di tutta la lega però si restituisce: è già dentro i
   * fantapunti veri da cui la stima è tarata, e toglierla due volte
   * abbasserebbe tutti i punteggi. Resta solo la differenza fra chi rischia
   * più degli altri e chi meno.
   */
  const perdite = new Map<string, number>();
  for (const [id, xs] of grezzi) {
    perdite.set(id, previsti.get(id)! - media(xs));
  }
  const perditaMedia = media(Float64Array.from(perdite.values()));

  const punti = new Map<string, Float64Array>();
  const riepilogo = new Map<string, { media: number; sd: number }>();
  for (const [id, xs] of grezzi) {
    const f = squadre.get(id)!;
    const spostamento = f.stima.mu - previsti.get(id)! + perditaMedia;
    const out = new Float64Array(n);
    // l'incertezza del modello: una per squadra e per simulazione
    for (let s = 0; s < n; s++) out[s] = xs[s] + spostamento + sdModello * normale(r);
    punti.set(id, out);
    const m = media(out);
    riepilogo.set(id, {
      media: Math.round(m * 100) / 100,
      sd: Math.round(Math.sqrt(media(out.map((x) => (x - m) ** 2))) * 100) / 100,
    });
  }
  return { punti, n, riepilogo };
}

function media(xs: Float64Array): number {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}

/**
 * La griglia dei risultati di una sfida dalle due serie simulate.
 *
 * Le caselle rare (un 5-4) in ventimila giornate possono restare vuote, e
 * una casella vuota non si può quotare. Si mescola allora un pizzico del
 * modello analitico — come se ci fossero `lisciatura` giornate in più
 * giocate con quello — così ogni risultato resta giocabile e la somma
 * resta uno.
 */
export function grigliaMC(
  casa: Float64Array, ospite: Float64Array, analitica: number[][], lisciatura = 200,
): number[][] {
  const n = Math.min(casa.length, ospite.length);
  const g = Array.from({ length: MAX_GOL + 1 }, () => new Array<number>(MAX_GOL + 1).fill(0));
  for (let s = 0; s < n; s++) {
    const a = Math.min(MAX_GOL, golDaFantapunti(casa[s]));
    const b = Math.min(MAX_GOL, golDaFantapunti(ospite[s]));
    g[a][b] += 1;
  }
  const tot = n + lisciatura;
  return g.map((riga, a) => riga.map((c, b) => (c + lisciatura * (analitica[a]?.[b] ?? 0)) / tot));
}

/** Le quote di una sfida dalla simulazione. */
export function quoteSfidaMC(
  sim: SimulazioneGiornata, casa: FormazioneMC & { teamId: string }, ospite: FormazioneMC & { teamId: string },
  opt: OpzioniMC = {},
): Esito[] {
  const analitica = griglia(casa.stima, ospite.stima);
  return mercatiDaGriglia(grigliaMC(
    sim.punti.get(casa.teamId)!, sim.punti.get(ospite.teamId)!, analitica, opt.lisciatura,
  ));
}
