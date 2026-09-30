/**
 * Cosa succede quando dal form di chiamata si scegle un giocatore che
 * qualcun altro ha già chiamato.
 *
 * Nel regolamento un lotto è unico per giocatore: la seconda richiesta non è
 * una chiamata, è un'adesione al lotto che esiste già. Il server lo fa da
 * sempre (callPlayer gira su joinLotInternal), ma nel form non si vedeva —
 * uno chiamava e scopriva solo dopo di essere entrato in casa d'altri.
 * Queste funzioni servono a dirlo prima, e sono pure per poterle provare.
 */

/** Un lotto già aperto in questa asta, visto dalla mia squadra. */
export interface Chiamata {
  playerId: string;
  /** la squadra che ha chiamato */
  squadra: string;
  /** sono già dentro questo lotto, come chiamante o come aderente */
  partecipo: boolean;
}

export type EsitoDellaScelta =
  /** nessuno l'ha chiamato: è una chiamata vera */
  | { tipo: 'chiamata' }
  /** l'ha chiamato un altro: la mia richiesta diventa un'adesione */
  | { tipo: 'adesione'; squadra: string; avviso: string }
  /** sono già dentro: da qui non c'è niente da fare */
  | { tipo: 'dentro'; squadra: string; avviso: string };

export function avvisoDiAdesione(giocatore: string, squadra: string): string {
  return `${giocatore} è stato già chiamato da ${squadra}. Conferma per aderire all'asta.`;
}

export function avvisoGiaDentro(giocatore: string): string {
  return `Sei già dentro il lotto di ${giocatore}: modificalo dal riquadro «Lotti chiamati» qui sopra.`;
}

/**
 * Che cosa diventa la richiesta sul giocatore scelto. Senza giocatore scelto
 * vale 'chiamata': il form non ha ancora niente da avvisare.
 */
export function esitoDellaScelta(
  giocatore: { id: string; name: string } | undefined | null,
  chiamate: Chiamata[],
): EsitoDellaScelta {
  if (!giocatore) return { tipo: 'chiamata' };
  const c = chiamate.find((x) => x.playerId === giocatore.id);
  if (!c) return { tipo: 'chiamata' };
  if (c.partecipo) {
    return { tipo: 'dentro', squadra: c.squadra, avviso: avvisoGiaDentro(giocatore.name) };
  }
  return { tipo: 'adesione', squadra: c.squadra, avviso: avvisoDiAdesione(giocatore.name, c.squadra) };
}

/**
 * I giocatori che ha ancora senso mostrare nella tendina: fuori quelli dei
 * lotti in cui sono già dentro, perché sceglierli non potrebbe che dare
 * errore. Quelli chiamati da altri restano — con l'avviso.
 */
export function daMostrare<T extends { id: string }>(giocatori: T[], chiamate: Chiamata[]): T[] {
  const dentro = new Set(chiamate.filter((c) => c.partecipo).map((c) => c.playerId));
  return giocatori.filter((g) => !dentro.has(g.id));
}

/** La squadra che ha chiamato questo giocatore, se qualcuno l'ha chiamato. */
export function chiamatoDa(playerId: string, chiamate: Chiamata[]): string | null {
  return chiamate.find((c) => c.playerId === playerId)?.squadra ?? null;
}

/**
 * Traduce i lotti della pagina /asta in quello che serve al form. I lotti
 * annullati non arrivano fin qui — la query li esclude — ed è giusto così:
 * su un giocatore il cui lotto è stato annullato la chiamata si riapre.
 */
export function chiamateDaiLotti(
  lotti: { id: string; player_id: string; teams: { name: string } | null }[],
  mieiLotti: string[],
): Chiamata[] {
  const miei = new Set(mieiLotti);
  return lotti.map((l) => ({
    playerId: l.player_id,
    squadra: l.teams?.name ?? '?',
    partecipo: miei.has(l.id),
  }));
}
