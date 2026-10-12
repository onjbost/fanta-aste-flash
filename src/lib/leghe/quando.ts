/**
 * Quando una giornata è pronta per essere letta da Leghe Fantacalcio.
 *
 * Funzioni pure. La lega calcola la giornata dopo l'ultima partita di Serie A
 * del turno: la regola è aspettare **il giorno dopo** quella partita, nel
 * fuso di Roma. L'ultima partita si guarda sul calendario aggiornato
 * (anticipi e posticipi spostati, rinvii): una partita rinviata a data da
 * destinarsi non conta, perché la lega calcola la giornata senza aspettarla.
 *
 * Il calendario è sempre quello **intero**: le dieci partite nostre, con
 * sopra quello che sa il live. Il live di fantacalcio.it elenca solo le
 * partite già cominciate — il sabato mattina non ha quelle della domenica,
 * la domenica non ha i posticipi del lunedì. Fidarsi della sua lista voleva
 * dire trovare «tutte finite» le tre partite del sabato e calcolare la
 * giornata a metà (è successo l'11 ottobre 2026).
 */

export interface PartitaCalendario {
  /** calcio d'inizio in millisecondi, null se non si sa */
  kickoff: number | null;
  rinviata: boolean;
  /** finita secondo il live o il nostro calendario; assente = non si sa */
  finita?: boolean;
  /** «Torino-Udinese», per i messaggi */
  nome?: string;
}

/** Una partita del nostro `serie_a_fixtures`. */
export interface PartitaNostra {
  casa: string;
  ospite: string;
  kickoff: number | null;
  stato: 'scheduled' | 'postponed' | 'played' | string;
}

/** Una partita del live: status 4 finita, 6 rinviata; matchDate 0 se non si sa. */
export interface PartitaDalLive {
  teamHome: string;
  teamAway: string;
  status: number;
  matchDate: number;
}

/**
 * Le partite della giornata: le nostre, ognuna aggiornata col live se il live
 * la conosce; quelle che il live non elenca restano come le sappiamo noi
 * (di solito: non ancora cominciate). Le partite del live che da noi non
 * ci sono si aggiungono in fondo.
 */
export function unisciCalendario(
  nostre: PartitaNostra[],
  live: PartitaDalLive[],
  stessoClub: (nostro: string, fonte: string) => boolean,
): PartitaCalendario[] {
  const usate = new Set<PartitaDalLive>();
  const unite: PartitaCalendario[] = nostre.map((n) => {
    const l = live.find((p) => !usate.has(p) && stessoClub(n.casa, p.teamHome) && stessoClub(n.ospite, p.teamAway));
    const nome = `${n.casa}-${n.ospite}`;
    if (!l) {
      return { kickoff: n.kickoff, rinviata: n.stato === 'postponed', finita: n.stato === 'played', nome };
    }
    usate.add(l);
    return { kickoff: l.matchDate || n.kickoff, rinviata: l.status === 6, finita: l.status === 4, nome };
  });
  for (const l of live) {
    if (usate.has(l)) continue;
    unite.push({ kickoff: l.matchDate || null, rinviata: l.status === 6, finita: l.status === 4, nome: `${l.teamHome}-${l.teamAway}` });
  }
  return unite;
}

/** Le partite non rinviate e non ancora finite. */
export function partiteAperte(partite: PartitaCalendario[]): PartitaCalendario[] {
  return partite.filter((p) => !p.rinviata && p.finita !== true);
}

/** La data «2026-10-05» di un istante, nel fuso di Roma. */
export function dataRoma(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

/** Il giorno dopo una data «aaaa-mm-gg». */
export function giornoDopo(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Il giorno in cui leggere i risultati: quello dopo l'ultima partita giocata
 * del turno. Null se il calendario non dice abbastanza: nessuna data, oppure
 * una partita ancora da giocare di cui non si sa l'orario — potrebbe essere
 * proprio l'ultima.
 */
export function giornoDelCalcolo(partite: PartitaCalendario[]): string | null {
  const daGiocare = partite.filter((p) => !p.rinviata);
  if (daGiocare.some((p) => p.kickoff == null && p.finita !== true)) return null;
  const date = daGiocare.filter((p) => p.kickoff != null).map((p) => p.kickoff as number);
  if (!date.length) return null;
  return giornoDopo(dataRoma(Math.max(...date)));
}

/**
 * È arrivato il giorno? Dal mattino dopo l'ultima partita, e solo se nessuna
 * partita già cominciata risulta ancora in corso (un recupero spostato in
 * avanti, un live in ritardo): meglio un giorno di ritardo che una giornata
 * calcolata a metà.
 */
export function giornataPronta(partite: PartitaCalendario[], ora: number): boolean {
  const giorno = giornoDelCalcolo(partite);
  if (giorno == null || dataRoma(ora) < giorno) return false;
  // una partita che sappiamo non finita, e già cominciata, ferma tutto
  return !partite.some((p) => !p.rinviata && p.finita === false && p.kickoff != null && p.kickoff <= ora);
}
