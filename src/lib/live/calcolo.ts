/**
 * La partita del fanta in diretta — i conti.
 *
 * Funzioni pure: entrano le due formazioni e le partite di Serie A come le
 * manda il live di fantacalcio.it, escono fantavoti, totali e gol. Nessuna
 * rete, nessun database.
 *
 * Due letture della stessa partita:
 *  - **com'è adesso**: contano solo i voti già usciti;
 *  - **simulata**: chi non ha ancora voto prende 6 (più i bonus e i malus
 *    che ha già fatto), così si vede dove sta andando la partita prima che
 *    finisca. Chi è in panchina in una partita già cominciata non prende il
 *    6 regalato: probabilmente non entra, e al suo posto entra la riserva.
 */

import { golDaFantapunti } from '@/lib/tipster';
import type { PartitaLive } from './protobuf';

// =====================================================================
// gli eventi
// =====================================================================

/**
 * I codici degli eventi del live, con il loro valore nel fanta classico.
 *
 * Il sito non li documenta: sono ricavati dal messaggio vero della 4ª
 * giornata 2023/24 (in `fixtures/`), confrontando ogni codice con quello
 * che era successo in campo — il 9 è il rigore di Calhanoglu nel derby, il
 * 10 il rosso diretto a Grassi in Roma-Empoli 7-0, il
 * 4 compare solo sui portieri e tante volte quanti gol hanno preso, il 20-23
 * sono assist di tipi diversi sul minuto esatto di un gol. Quelli mai visti
 * restano a zero e la pagina li elenca, così se ne compare uno nuovo lo si
 * vede invece di sbagliare il conto in silenzio.
 */
export const EVENTI: Record<number, { nome: string; valore: number; certo: boolean }> = {
  1: { nome: 'ammonizione', valore: -0.5, certo: true },
  // il 2 compare su difensori, anche in uno 0-0 al 95': non è un autogol,
  // forse un rigore causato. Finché non si sa, vale zero e si vede
  2: { nome: 'evento 2', valore: 0, certo: false },
  3: { nome: 'gol', valore: 3, certo: true },
  4: { nome: 'gol subito', valore: -1, certo: true },
  9: { nome: 'gol su rigore', valore: 3, certo: true },
  10: { nome: 'espulsione', valore: -1, certo: true },
  11: { nome: 'gol vittoria', valore: 0, certo: true },
  12: { nome: 'gol pareggio', valore: 0, certo: true },
  14: { nome: 'sostituito', valore: 0, certo: true },
  15: { nome: 'entrato', valore: 0, certo: true },
  // entrato e poi sostituito a sua volta
  16: { nome: 'sostituito', valore: 0, certo: true },
  17: { nome: 'uscito per infortunio', valore: 0, certo: true },
  20: { nome: 'assist', valore: 1, certo: true },
  21: { nome: 'assist', valore: 1, certo: true },
  22: { nome: 'assist', valore: 1, certo: true },
  23: { nome: 'assist', valore: 1, certo: true },
};

/** +1 al portiere che finisce la partita senza prendere gol. */
export const PORTA_INVIOLATA = 1;
/** Sostituzioni dalla panchina, al massimo. */
export const MAX_SOSTITUZIONI = 3;
/** Il voto d'ufficio della simulazione. */
export const VOTO_SIMULATO = 6;

export function bonusDaEventi(eventi: number[]): { bonus: number; sconosciuti: number[] } {
  let bonus = 0;
  const sconosciuti: number[] = [];
  for (const e of eventi) {
    const x = EVENTI[e];
    if (x) bonus += x.valore;
    else sconosciuti.push(e);
  }
  return { bonus, sconosciuti };
}

/** Il minuto di gioco, come lo mostra il sito. */
export function minuto(p: Pick<PartitaLive, 'status' | 'fhDate' | 'shDate'>, ora: number): number {
  const primo = Math.ceil((ora - p.fhDate) / 60_000);
  const secondo = 45 + Math.ceil((ora - p.shDate) / 60_000);
  switch (p.status) {
    case 1: return Math.max(0, Math.min(primo, 45));
    case 2: return 45;
    case 3: return Math.max(45, Math.min(secondo, 90));
    case 4: case 6: return 90;
    case 5: return p.shDate ? Math.min(secondo, 90) : Math.min(primo, 45);
    default: return 0;
  }
}

// =====================================================================
// la partita
// =====================================================================

export interface Schierato {
  playerId: string | null;
  /** id di fantacalcio.it, per trovarlo nel live */
  extId: string | null;
  nome: string;
  ruolo: 'P' | 'D' | 'C' | 'A';
  club: string;
  titolare: boolean;
  /** ordine in panchina: la prima riserva entra per prima */
  ordine: number;
}

export type StatoRiga =
  | 'voto'        // ha preso voto: conta quello
  | 'in_campo'    // sta giocando, il voto non c'è ancora
  | 'da_giocare'  // la sua partita non è cominciata
  | 'fuori'       // la sua partita è in corso ma lui non è in campo
  | 'sv';         // partita finita, senza voto: entra una riserva

export interface RigaLive extends Schierato {
  stato: StatoRiga;
  voto: number | null;
  bonus: number;
  /** il fantavoto che conta adesso (null se non ce l'ha) */
  fantavoto: number | null;
  /** quello della simulazione: il fantavoto vero o il 6 d'ufficio */
  simulato: number | null;
  eventi: string[];
  /** entra nel totale: titolare con voto, o riserva entrata al suo posto */
  conta: boolean;
  contaSimulato: boolean;
  /** «45'», «finita», «sab 15:00»: dove sta la sua partita */
  partita: string | null;
}

export interface SquadraLive {
  righe: RigaLive[];
  totale: number;
  totaleSimulato: number;
  gol: number;
  golSimulati: number;
  /** titolari che hanno già un voto, su undici */
  conVoto: number;
  sostituzioni: number;
}

export interface ContestoLive {
  /** partite di Serie A della giornata */
  partite: PartitaLive[];
  ora: number;
  /** il club di una partita e quello del listone sono lo stesso? */
  stessoClub: (nostro: string, fonte: string) => boolean;
}

function statoGiocatore(s: Schierato, ctx: ContestoLive) {
  const idNum = s.extId && /^\d+$/.test(s.extId) ? Number(s.extId) : null;
  for (const p of ctx.partite) {
    const g = idNum == null ? undefined
      : [...p.playersHome, ...p.playersAway].find((x) => x.id === idNum);
    if (g) return { partita: p, g };
  }
  const p = ctx.partite.find((x) => ctx.stessoClub(s.club, x.teamHome) || ctx.stessoClub(s.club, x.teamAway));
  return { partita: p ?? null, g: null };
}

function etichettaPartita(p: PartitaLive | null, ora: number): string | null {
  if (!p) return null;
  if (p.status === 4) return 'finita';
  if (p.status === 6) return 'rinviata';
  if (p.status === 2) return 'intervallo';
  if (p.status === 1 || p.status === 3 || p.status === 5) return `${minuto(p, ora)}'`;
  return new Date(p.matchDate).toLocaleString('it-IT', {
    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });
}

function riga(s: Schierato, ctx: ContestoLive): RigaLive & { _eventi: number[] } {
  const { partita, g } = statoGiocatore(s, ctx);
  const eventi = g?.events ?? [];
  const { bonus } = bonusDaEventi(eventi);
  const finita = partita?.status === 4 || partita?.status === 6;
  const cominciata = partita != null && partita.status >= 1;

  let stato: StatoRiga;
  if (g?.vote != null) stato = 'voto';
  else if (finita) stato = 'sv';
  else if (!cominciata) stato = 'da_giocare';
  else stato = g ? 'in_campo' : 'fuori';

  // porta inviolata: solo a partita finita, solo al portiere con voto
  const inviolata = s.ruolo === 'P' && stato === 'voto' && finita && !eventi.includes(4) ? PORTA_INVIOLATA : 0;
  const fantavoto = g?.vote != null ? g.vote + bonus + inviolata : null;
  const simulato = fantavoto ?? (stato === 'in_campo' || stato === 'da_giocare' ? VOTO_SIMULATO + bonus : null);

  return {
    ...s, stato, voto: g?.vote ?? null, bonus: bonus + inviolata, fantavoto, simulato,
    eventi: eventi.map((e) => EVENTI[e]?.nome ?? `evento ${e}`).filter((n) => n !== 'sostituito' && n !== 'entrato'),
    conta: false, contaSimulato: false,
    partita: etichettaPartita(partita, ctx.ora),
    _eventi: eventi,
  };
}

/**
 * Le sostituzioni: un titolare che resta senza voto lascia il posto alla
 * prima riserva dello stesso ruolo che il voto ce l'ha, fino a tre cambi.
 *
 * `vale` dice chi ha «un voto» in quella lettura: il fantavoto vero per la
 * partita com'è, il simulato per la simulazione.
 */
function applicaCambi(
  righe: RigaLive[], vale: (r: RigaLive) => number | null, serveCambio: (r: RigaLive) => boolean,
): { usate: Set<RigaLive>; cambi: number } {
  const usate = new Set<RigaLive>();
  let cambi = 0;
  const panchina = righe.filter((r) => !r.titolare).sort((a, b) => a.ordine - b.ordine);
  for (const t of righe.filter((r) => r.titolare)) {
    if (vale(t) != null) { usate.add(t); continue; }
    if (!serveCambio(t) || cambi >= MAX_SOSTITUZIONI) continue;
    const dentro = panchina.find((p) => p.ruolo === t.ruolo && !usate.has(p) && vale(p) != null);
    if (dentro) { usate.add(dentro); cambi++; }
  }
  return { usate, cambi };
}

export function squadraLive(formazione: Schierato[], ctx: ContestoLive): SquadraLive {
  const righe = formazione.map((s) => riga(s, ctx));

  // com'è adesso: la riserva entra solo per chi ha finito senza voto
  const ora = applicaCambi(righe, (r) => r.fantavoto, (r) => r.stato === 'sv');
  // simulata: entra anche per chi è fuori in una partita in corso
  const sim = applicaCambi(righe, (r) => r.simulato, (r) => r.stato === 'sv' || r.stato === 'fuori');

  let totale = 0;
  let totaleSimulato = 0;
  for (const r of righe) {
    r.conta = ora.usate.has(r);
    r.contaSimulato = sim.usate.has(r);
    if (r.conta) totale += r.fantavoto ?? 0;
    if (r.contaSimulato) totaleSimulato += r.simulato ?? 0;
  }
  const pulite = righe.map(({ _eventi, ...r }) => { void _eventi; return r; });

  return {
    righe: pulite,
    totale: Math.round(totale * 100) / 100,
    totaleSimulato: Math.round(totaleSimulato * 100) / 100,
    gol: golDaFantapunti(totale),
    golSimulati: golDaFantapunti(totaleSimulato),
    conVoto: righe.filter((r) => r.titolare && r.stato === 'voto').length,
    sostituzioni: ora.cambi,
  };
}

/**
 * I codici evento che il conto non conosce o di cui non è sicuro, per
 * dirlo invece di tacerlo.
 */
export function eventiSconosciuti(partite: PartitaLive[]): number[] {
  const s = new Set<number>();
  for (const p of partite) {
    for (const g of [...p.playersHome, ...p.playersAway]) {
      g.events.filter((e) => !EVENTI[e]?.certo).forEach((e) => s.add(e));
    }
  }
  return [...s].sort((a, b) => a - b);
}
