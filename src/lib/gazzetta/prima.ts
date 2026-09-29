/**
 * La Gazzetta della Mansarda — la prima pagina.
 *
 * Sostituisce il messaggione di fine giornata, che nel gruppo nessuno legge
 * fino in fondo. Quindi non è un riassunto accanto al pezzo: è **il pezzo**,
 * con lo stesso tono velenoso, impaginato perché si capisca in tre secondi.
 *
 * Da questo discende tutto il resto. Poche cose grandi invece di molte
 * piccole: aperta a schermo intero su un telefono da 390 punti, il titolo a
 * 66 diventa 30 e si legge, il corpo a 14 diventa 6 e vuole le dita. Il
 * racconto lungo resta nell'app, per chi lo vuole.
 *
 * Qui stanno i tipi e le poche decisioni calcolabili. Il disegno è in
 * `Prima.tsx`, che è lo **stesso componente** usato per l'anteprima
 * nell'editor e per il PNG: se fossero due, dopo tre modifiche mostrerebbero
 * cose diverse e l'admin manderebbe nel gruppo qualcosa che non ha visto.
 */

export type TipoEdizione = 'settimanale' | 'coppa' | 'fantamercato';

export const ETICHETTA_EDIZIONE: Record<TipoEdizione, string> = {
  settimanale: 'EDIZIONE SETTIMANALE',
  coppa: 'EDIZIONE COPPA',
  fantamercato: 'EDIZIONE FANTAMERCATO',
};

/** I colori del template, presi dal file originale. */
export const COLORI = {
  rosa: '#FFD6E0',
  inchiostro: '#34302e',
  carta: '#fffdfc',
  giallo: '#e1cb09',
  /*
   * L'oro della sottotestata di coppa.
   *
   * Non è il giallo del gancio: quello vive su fondo scuro, dove risalta.
   * Sul rosa della testata il giallo misura 1.25:1 di contrasto — cioè non
   * si legge. Questo oro bruno sta a 3.99:1, che su una riga in grassetto
   * spaziata si legge senza diventare marrone.
   */
  oro: '#8f6410',
} as const;

export interface RigaClassifica { nome: string; punti: number }

/** Un girone di coppa: «A» e «B», quattro squadre ciascuno. */
export interface GironePrima { gruppo: string; righe: RigaClassifica[] }

/** Una riga del tabellone, dalle semifinali in poi. */
export interface VoceTabellone { turno: string; testo: string }
export interface Incontro { casa: string; ospite: string }

export interface BloccoAltra {
  /** «Joga Benito 2-1 Montester» */
  titolo: string;
  /** due righe secche e cattive, non un paragrafo */
  testo: string;
}

/**
 * Il riquadro in fondo alla colonna di sinistra: un numero grosso e una riga.
 *
 * Non è decorazione. In un campionato a otto squadre le partite sono quattro:
 * una è l'apertura e tre stanno in «Le altre», e sotto resta un buco di due
 * dita. Un dato secco — il voto più alto, il flop, i punti di scarto — lo
 * riempie e fa il verso alla Gazzetta vera.
 */
export interface Spalla {
  /** «18» — grosso */
  numero: string;
  /** «i fantapunti di Mastantuono, il massimo di giornata» */
  didascalia: string;
}

export interface FotoPrima {
  /** indirizzo o data-uri */
  src: string;
  larghezza: number;
  altezza: number;
  /** da dove viene, per mostrarlo all'admin accanto all'immagine */
  provenienza: string;
  /** 0-100: dove sta il fuoco verticale del ritaglio */
  fuoco: number;
  /**
   * 0-100: dove sta il fuoco orizzontale. Assente vuol dire centrato, che è
   * come si comportava prima che esistesse — le prime pagine già salvate
   * restano identiche.
   */
  fuocoX?: number;
}

export interface DatiPrima {
  tipo: TipoEdizione;
  numero: string;
  data: string;
  /** «STRURIMENTI ★ SCARAMANZIE ★ BOTTE DI CULO» */
  sottotestata: string;
  occhiello: string;
  /** «Ntonia ne fa quattro» */
  titolo: string;
  /** il gancio, in giallo: «con un Mastantuono da 18» */
  gancio: string;
  /** «FC NTONIA – FC CANEPARDO 4-1» */
  sottotitolo: string;
  cappello: string;
  foto: FotoPrima | null;
  classifica: RigaClassifica[];
  /*
   * I gironi e il tabellone sostituiscono la classifica nell'edizione di
   * coppa. Sono opzionali e non obbligatori apposta: così le prime pagine
   * già salvate continuano a rendersi senza migrare il JSON, e il
   * componente decide guardando cosa c'è invece che il tipo di edizione.
   */
  gironi?: GironePrima[] | null;
  tabellone?: VoceTabellone[] | null;
  prossimi: Incontro[];
  altre: BloccoAltra[];
  /** opzionale: la pagina regge anche senza */
  spalla?: Spalla | null;
  piedeSinistra: string;
  piedeDestra: string;
}

// =====================================================================
// La disposizione, decisa dalle proporzioni dell'immagine
// =====================================================================

export type Disposizione = 'sfondo' | 'affianco' | 'riquadro' | 'senzaFoto';

/**
 * Dove va l'immagine, in base alla forma che ha.
 *
 * Non lo decide un modello: è una misura, quindi è prevedibile e non
 * sorprende l'admin. Le foto degli articoli di fantacalcio.it sono
 * orizzontali e diventano lo sfondo del riquadro con la velatura sopra; una
 * card verticale va affiancata al testo; una quasi quadrata sta in un
 * riquadro in alto.
 *
 * I confini sono larghi apposta: una foto 16:10 e una 16:9 devono comportarsi
 * allo stesso modo, altrimenti la pagina cambia aspetto per due pixel.
 */
export function disposizioneFoto(foto: FotoPrima | null): Disposizione {
  if (!foto || foto.larghezza <= 0 || foto.altezza <= 0) return 'senzaFoto';
  const r = foto.larghezza / foto.altezza;
  if (r >= 1.35) return 'sfondo';       // orizzontale: sfondo del riquadro
  if (r <= 0.85) return 'affianco';     // verticale: colonna accanto al testo
  return 'riquadro';                    // quadrata: riquadro in alto a destra
}

/**
 * Quanto testo ci sta nel cappello, secondo dove finisce la foto.
 *
 * Con la foto di sfondo il testo ci sta sopra e può essere più lungo; con la
 * foto affiancata la colonna è stretta e va tenuto corto. Se il modello
 * scrivesse la stessa lunghezza in tutti e due i casi, in uno dei due
 * sforerebbe — e in un'immagine sforare non si vede, si taglia.
 */
export function paroleDelCappello(d: Disposizione): { min: number; max: number } {
  switch (d) {
    case 'affianco': return { min: 18, max: 34 };
    case 'riquadro': return { min: 22, max: 40 };
    default: return { min: 28, max: 52 };
  }
}

/**
 * Un fuoco entro i limiti, con un valore di riposo sensato.
 *
 * Il verticale riposa a 35 — nelle foto d'azione le facce stanno sopra la
 * metà; l'orizzontale a 50, cioè centrato, che è come si comportava la
 * pagina prima che la manopola esistesse.
 */
export function fuocoValido(v: number | undefined, riposo = 35): number {
  if (!Number.isFinite(v as number)) return riposo;
  return Math.min(100, Math.max(0, Math.round(v as number)));
}

/**
 * Il ritaglio della foto, calcolato invece che delegato.
 *
 * `background-size: cover` nel browser fa la cosa giusta; Satori no — la
 * foto esce **affiancata a mosaico**, e in un'immagine già mandata nel
 * gruppo è un errore che non si recupera. Visto il vincolo, tanto vale
 * calcolarlo: le misure dell'immagine ce le abbiamo (`misuraImmagine` le
 * legge al momento della raccolta) e il riquadro è di dimensione fissa,
 * quindi «copri il riquadro mantenendo le proporzioni» è una
 * moltiplicazione.
 *
 * Il risultato è in pixel e non in percentuale, perché i due motori
 * interpretano le percentuali in modo diverso e l'unico modo di avere
 * anteprima e PNG identici è non lasciare niente da interpretare.
 *
 * L'inquadratura ha due manopole: `fuoco` in verticale (0 tiene la cima, le
 * facce; 100 il fondo) e `fuocoX` in orizzontale (0 il bordo sinistro, 100
 * il destro, assente = centrato).
 *
 * **Fuori dalla foto non si può andare.** Lo spostamento non è un numero di
 * pixel ma una frazione dello scarto fra l'immagine ingrandita e il
 * riquadro: a 0 il bordo dell'immagine coincide col bordo del riquadro, a
 * 100 con quello opposto, e in mezzo si interpola. Siccome l'ingrandimento
 * copre sempre il riquadro, quello scarto non è mai positivo — quindi non
 * esiste una posizione che lasci un bordo vuoto, e non serve tagliare
 * niente dopo. Il ritaglio è il calcolo.
 */
export function coperturaFoto(
  foto: { larghezza: number; altezza: number; fuoco?: number; fuocoX?: number },
  riquadro: { larghezza: number; altezza: number },
): { dimensione: string; posizione: string } {
  const largo = Math.max(1, foto.larghezza);
  const alto = Math.max(1, foto.altezza);
  const scala = Math.max(riquadro.larghezza / largo, riquadro.altezza / alto);
  const w = Math.ceil(largo * scala);
  const h = Math.ceil(alto * scala);
  const x = Math.round((riquadro.larghezza - w) * (fuocoValido(foto.fuocoX, 50) / 100));
  const y = Math.round((riquadro.altezza - h) * (fuocoValido(foto.fuoco) / 100));
  return { dimensione: `${w}px ${h}px`, posizione: `${x}px ${y}px` };
}

export type FaseCoppa = 'gironi' | 'semifinali' | 'finale';

/**
 * A che punto è la coppa, dedotto da quante sfide ha quella giornata.
 *
 * Non c'è una colonna che lo dica, e non serve: otto squadre in due gironi
 * fanno quattro partite a turno, le semifinali ne fanno due, la finale una.
 * È una regola che si legge dai dati, quindi non c'è una configurazione da
 * tenere allineata al calendario — e il calendario lo compila la lega, non
 * noi.
 */
export function faseDiCoppa(partite: number): FaseCoppa {
  if (partite >= 3) return 'gironi';
  if (partite === 2) return 'semifinali';
  return 'finale';
}

/**
 * Il numero dell'edizione: la giornata per la settimanale, il turno per la
 * coppa, la sessione d'asta per il fantamercato.
 *
 * Per la coppa `n` è il **turno di coppa**, non la giornata di
 * fantacampionato: «COPPA · 3ª GIORNATA» dice qualcosa, «COPPA N. 8» no.
 */
export function numeroEdizione(tipo: TipoEdizione, n: number, fase?: FaseCoppa): string {
  if (tipo === 'coppa') {
    if (fase === 'finale') return 'COPPA \u00b7 FINALE';
    if (fase === 'semifinali') return 'COPPA \u00b7 SEMIFINALI';
    // «GIORNATA 3» e non «3\u00aa GIORNATA»: l'indicatore ordinale ce l'ha
    // solo il font dei titoli, e questa riga la disegna quello dei corpi
    return `COPPA \u00b7 GIORNATA ${n}`;
  }
  return tipo === 'settimanale' ? `N. ${n}` : `MERCATO N. ${n}`;
}

/** La data come la stamperebbe un giornale: «28 SETTEMBRE 2026». */
export function dataEstesa(d: Date): string {
  const mesi = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
    'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
  return `${d.getUTCDate()} ${mesi[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
