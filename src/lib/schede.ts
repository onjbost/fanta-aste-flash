/**
 * La scheda di un giocatore: se è fermo e i suoi numeri di stagione.
 *
 * Solo tipi e conti puri, così li usano sia il server che li legge sia i
 * componenti nel browser che li mostrano.
 */

export type CategoriaIndisponibile = 'infortunato' | 'squalificato' | 'in_dubbio' | 'diffidato';

/** L'ultima raccolta degli indisponibili di fantacalcio.it, per un giocatore. */
export interface Indisponibile {
  categoria: CategoriaIndisponibile;
  /** la didascalia della fonte: «lesione al flessore, out tre settimane» */
  descrizione: string;
  /** la stima di rientro dell'app, `yyyy-mm-dd` */
  rientroStimato: string | null;
}

/** I numeri della stagione in corso. Null = la fonte non lo dice. */
export interface Statistiche {
  /** partite a voto */
  presenze: number | null;
  mediaVoto: number | null;
  fantamedia: number | null;
  gol: number | null;
  assist: number | null;
  rigoriSegnati: number | null;
  rigoriCalciati: number | null;
  /** per i portieri */
  golSubiti: number | null;
  rigoriParati: number | null;
  ammonizioni: number | null;
  espulsioni: number | null;
  /** dai tabellini della lega: la pagina delle statistiche non li ha */
  autogol: number | null;
}

export interface Scheda {
  indisponibile: Indisponibile | null;
  statistiche: Statistiche | null;
}

/** Un giocatore che compare due volte (infortunato e diffidato): vince la più grave. */
export const GRAVITA: CategoriaIndisponibile[] = ['infortunato', 'squalificato', 'in_dubbio', 'diffidato'];

export function piuGrave(a: Indisponibile | null | undefined, b: Indisponibile): Indisponibile {
  if (!a) return b;
  return GRAVITA.indexOf(b.categoria) < GRAVITA.indexOf(a.categoria) ? b : a;
}

/**
 * Gli autogol per giocatore dalle righe dei tabellini della lega.
 *
 * Lo stesso giocatore può stare in più tabellini della stessa giornata di
 * Serie A (campionato e coppa): la giornata conta una volta sola.
 */
export function contaAutogol(righe: { playerId: string; serieA: number | null; autogol: number }[]): Map<string, number> {
  const perGiornata = new Map<string, number>();
  for (const r of righe) {
    if (!r.autogol || r.serieA == null) continue;
    const k = `${r.playerId}:${r.serieA}`;
    perGiornata.set(k, Math.max(perGiornata.get(k) ?? 0, r.autogol));
  }
  const esito = new Map<string, number>();
  for (const [k, n] of perGiornata) {
    const id = k.slice(0, k.lastIndexOf(':'));
    esito.set(id, (esito.get(id) ?? 0) + n);
  }
  return esito;
}
