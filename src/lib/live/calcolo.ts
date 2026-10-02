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
  /** la fascia: capitano o vicecapitano */
  fascia?: 'C' | 'V' | null;
  /**
   * I voti già archiviati, per una partita giocata: quelli del tabellino della
   * lega (fantavoto con le nostre regole) o, in mancanza, le pagelle di Serie A.
   * Quando c'è, comanda lui: il live di una giornata vecchia può non esserci più.
   */
  archivio?: { voto: number | null; fantavoto: number | null; eventi?: string[] } | null;
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
  /** i due bonus di squadra, com'è adesso e nella simulazione */
  modificatore: BonusSquadra;
  modificatoreSimulato: BonusSquadra;
  capitano: BonusSquadra;
  capitanoSimulato: BonusSquadra;
}

export interface BonusSquadra {
  punti: number;
  /** come ci si è arrivati, in una riga: «media 6,38 (P 6,5 · D 7, 6,5, 6)» */
  spiegazione: string;
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
  if (s.archivio) {
    const { voto, fantavoto } = s.archivio;
    const conVoto = fantavoto != null;
    return {
      ...s, stato: conVoto ? 'voto' : 'sv', voto, fantavoto,
      bonus: conVoto && voto != null ? Math.round((fantavoto - voto) * 100) / 100 : 0,
      simulato: fantavoto,
      eventi: s.archivio.eventi ?? [],
      conta: false, contaSimulato: false,
      partita: 'finita',
      _eventi: [],
    };
  }
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

// =====================================================================
// modificatore della difesa e fattore capitano
// =====================================================================

/**
 * Il modificatore della difesa, con le fasce della lega: la media dei voti
 * puri (niente bonus né malus) del portiere e dei tre difensori migliori.
 * Ogni voce è «sotto questa soglia, questi punti».
 */
export const FASCE_DIFESA: [number, number][] = [
  [6, 0], [6.25, 0.5], [6.5, 1], [6.75, 1.5], [7, 2], [7.25, 2.5], [7.5, 3.5], [Infinity, 4],
];
/** Serve una difesa schierata almeno a quattro: a tre il modificatore non c'è. */
export const DIFENSORI_MINIMI = 4;

/** Il fattore capitano sul voto puro del capitano: «da questo voto in su, questi punti». */
export const FASCE_CAPITANO: [number, number][] = [[7.5, 1.5], [7, 1], [6.5, 0.5]];

export function puntiModificatore(media: number): number {
  for (const [soglia, punti] of FASCE_DIFESA) if (media < soglia) return punti;
  return 0;
}

export function puntiCapitano(voto: number): number {
  for (const [soglia, punti] of FASCE_CAPITANO) if (voto >= soglia) return punti;
  return 0;
}

const virgola = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Il modificatore della difesa su una formazione già risolta (chi conta).
 *
 * La difesa a quattro si guarda sui titolari schierati: è il modulo che
 * l'allenatore ha scelto. I voti invece sono di chi conta davvero, riserve
 * entrate comprese. Finché portiere e tre difensori non hanno un voto, il
 * modificatore resta in attesa e vale zero.
 */
export function modificatoreDifesa(
  righe: RigaLive[], conta: (r: RigaLive) => boolean, voto: (r: RigaLive) => number | null,
): BonusSquadra {
  const schierati = righe.filter((r) => r.titolare && r.ruolo === 'D').length;
  if (schierati < DIFENSORI_MINIMI) {
    return { punti: 0, spiegazione: `difesa a ${schierati}: serve almeno a ${DIFENSORI_MINIMI}` };
  }
  const portiere = righe.find((r) => conta(r) && r.ruolo === 'P' && voto(r) != null);
  const difensori = righe
    .filter((r) => conta(r) && r.ruolo === 'D' && voto(r) != null)
    .map((r) => voto(r) as number)
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (!portiere || difensori.length < 3) {
    return { punti: 0, spiegazione: 'in attesa dei voti di portiere e difensori' };
  }
  const vp = voto(portiere) as number;
  const media = (vp + difensori.reduce((a, b) => a + b, 0)) / 4;
  return {
    punti: puntiModificatore(media),
    spiegazione: `media ${virgola(media)} (P ${virgola(vp)} · D ${difensori.map(virgola).join(', ')})`,
  };
}

/**
 * Il fattore capitano: il voto puro del capitano, o del vicecapitano se il
 * capitano resta senza voto. Finché il capitano può ancora prenderlo, si
 * aspetta lui.
 */
export function fattoreCapitano(righe: RigaLive[], voto: (r: RigaLive) => number | null, simulata: boolean): BonusSquadra {
  const c = righe.find((r) => r.fascia === 'C');
  const v = righe.find((r) => r.fascia === 'V');
  if (!c) return { punti: 0, spiegazione: 'nessun capitano indicato' };
  const vc = voto(c);
  if (vc != null) return { punti: puntiCapitano(vc), spiegazione: `${c.nome}, voto ${virgola(vc)}` };
  // il capitano non ha (ancora) voto: passa al vice solo se il capitano è
  // fuori dai giochi — nella simulazione anche se è in panchina a partita in corso
  const fuori = c.stato === 'sv' || (simulata && c.stato === 'fuori');
  if (!fuori) return { punti: 0, spiegazione: `${c.nome}: in attesa del voto` };
  const vv = v ? voto(v) : null;
  if (!v || vv == null) return { punti: 0, spiegazione: `${c.nome} senza voto, e nessun vice con voto` };
  return { punti: puntiCapitano(vv), spiegazione: `${c.nome} senza voto: vale il vice ${v.nome}, voto ${virgola(vv)}` };
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

  // il voto puro della simulazione: quello vero, o il 6 d'ufficio a chi
  // prende il simulato (chi è in campo o deve ancora giocare)
  const votoSim = (r: RigaLive) => r.voto ?? (r.simulato != null ? VOTO_SIMULATO : null);
  const modificatore = modificatoreDifesa(pulite, (r) => r.conta, (r) => r.voto);
  const modificatoreSimulato = modificatoreDifesa(pulite, (r) => r.contaSimulato, votoSim);
  const capitano = fattoreCapitano(pulite, (r) => r.voto, false);
  const capitanoSimulato = fattoreCapitano(pulite, votoSim, true);
  totale += modificatore.punti + capitano.punti;
  totaleSimulato += modificatoreSimulato.punti + capitanoSimulato.punti;

  return {
    righe: pulite,
    totale: Math.round(totale * 100) / 100,
    totaleSimulato: Math.round(totaleSimulato * 100) / 100,
    gol: golDaFantapunti(totale),
    golSimulati: golDaFantapunti(totaleSimulato),
    modificatore, modificatoreSimulato, capitano, capitanoSimulato,
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
