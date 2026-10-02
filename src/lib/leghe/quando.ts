/**
 * Quando una giornata è pronta per essere letta da Leghe Fantacalcio.
 *
 * Funzioni pure. La lega calcola la giornata dopo l'ultima partita di Serie A
 * del turno: la regola è aspettare **il giorno dopo** quella partita, nel
 * fuso di Roma. L'ultima partita si guarda sul calendario aggiornato
 * (anticipi e posticipi spostati, rinvii): una partita rinviata a data da
 * destinarsi non conta, perché la lega calcola la giornata senza aspettarla.
 */

export interface PartitaCalendario {
  /** calcio d'inizio in millisecondi, null se non si sa */
  kickoff: number | null;
  rinviata: boolean;
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
 * del turno. Null se il calendario non dice abbastanza (nessuna data).
 */
export function giornoDelCalcolo(partite: PartitaCalendario[]): string | null {
  const date = partite.filter((p) => !p.rinviata && p.kickoff != null).map((p) => p.kickoff as number);
  if (!date.length) return null;
  return giornoDopo(dataRoma(Math.max(...date)));
}

/** È arrivato il giorno? */
export function giornataPronta(partite: PartitaCalendario[], ora: number): boolean {
  const giorno = giornoDelCalcolo(partite);
  return giorno != null && dataRoma(ora) >= giorno;
}
