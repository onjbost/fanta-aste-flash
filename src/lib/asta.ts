/**
 * La matematica minuta dell'Asta, quella che i componenti disegnano e basta:
 * la linea delle fasi, la scadenza che conta adesso, la cifra del rilancio.
 */

import type { SessionStatus } from './rules';

/* ---------------------------------------------------------------------
   La linea delle fasi
   --------------------------------------------------------------------- */

export type StatoFase = 'fatta' | 'adesso' | 'dopo';

export interface FaseAsta {
  chiave: 'calls_open' | 'calls_closed' | 'joins_closed' | 'live';
  etichetta: string;
  stato: StatoFase;
}

const ORDINE: { chiave: FaseAsta['chiave']; etichetta: string }[] = [
  { chiave: 'calls_open', etichetta: 'Chiamate' },
  { chiave: 'calls_closed', etichetta: 'Adesioni' },
  { chiave: 'joins_closed', etichetta: 'Attesa' },
  { chiave: 'live', etichetta: 'Sala' },
];

/**
 * Le quattro tappe di un'asta flash, con quella di adesso in evidenza.
 *
 * «In programma» non è una tappa: un'asta che non ha ancora aperto le
 * chiamate le ha tutte davanti. «Chiusa» le ha tutte dietro.
 */
export function lineaDelleFasi(fase: SessionStatus): FaseAsta[] {
  const i = fase === 'scheduled' ? -1
    : fase === 'closed' ? ORDINE.length
    : ORDINE.findIndex((f) => f.chiave === fase);
  return ORDINE.map((f, j) => ({
    ...f,
    stato: j < i ? 'fatta' : j === i ? 'adesso' : 'dopo',
  }));
}

/**
 * La scadenza che conta in questa fase: una sola, in grande.
 *
 * Le altre si leggono nella linea delle fasi e nelle tessere della Home; qui
 * serve sapere quanto manca alla prossima porta che si chiude.
 */
export function scadenzaDellaFase(
  fase: SessionStatus,
  date: { chiamate: Date; adesioni: Date; asta: Date },
): { etichetta: string; quando: Date } | null {
  switch (fase) {
    case 'scheduled':
    case 'calls_open': return { etichetta: 'Le chiamate chiudono tra', quando: date.chiamate };
    case 'calls_closed': return { etichetta: 'Le adesioni chiudono tra', quando: date.adesioni };
    case 'joins_closed': return { etichetta: 'L\'asta comincia tra', quando: date.asta };
    default: return null;
  }
}

/* ---------------------------------------------------------------------
   La cifra del rilancio
   --------------------------------------------------------------------- */

/** Il rilancio minimo valido: 1 sul lotto senza offerte, sennò un credito sopra. */
export function rilancioMinimo(prezzo: number | null): number {
  return prezzo === null ? 1 : prezzo + 1;
}

/**
 * La cifra che il bottone «Rilancia a X» propone davvero.
 *
 * Chi ha scelto 14 e nel frattempo vede salire l'offerta a 15 non deve
 * trovarsi un bottone che rilancia sotto il minimo — il server lo
 * rifiuterebbe e il secondo buono sarebbe perso. La cifra si riallinea al
 * minimo valido; se l'avevi scelta più alta, resta tua.
 */
export function cifraDiRilancio(scelta: number | null, minimo: number): number {
  return scelta === null ? minimo : Math.max(scelta, minimo);
}

/**
 * Le tre scorciatoie: +1, +5, +10 sopra l'offerta corrente.
 *
 * Sul lotto senza offerte non c'è niente a cui sommare: le scorciatoie
 * diventano direttamente 1, 5 e 10 crediti.
 */
export function scorciatoie(prezzo: number | null): { passo: number; cifra: number }[] {
  return [1, 5, 10].map((passo) => ({ passo, cifra: (prezzo ?? 0) + passo }));
}

/**
 * Quanto si è consumato del countdown, da 0 (appena ripartito) a 1 (finito).
 * Serve all'anello intorno all'offerta: si svuota man mano che il tempo passa.
 */
export function consumoDelTimer(fine: string | null, ora: number, secondi: number): number {
  if (!fine || secondi <= 0) return 0;
  const resta = new Date(fine).getTime() - ora;
  return Math.min(1, Math.max(0, 1 - resta / (secondi * 1000)));
}
