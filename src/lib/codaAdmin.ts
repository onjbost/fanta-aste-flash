/**
 * La coda operativa dell'admin: due viste, e il lavoro diviso per squadra.
 *
 * Le righe stanno in `admin_tasks` da sempre — è la tabella che raccoglie
 * cosa riportare a mano su Leghe Fantacalcio: ogni aggiudicazione ci scrive
 * dentro una frase, ogni richiesta di svincolo pure. Aveva già `done`, ma
 * niente nell'app lo scriveva: il 1º ottobre in coda c'erano ancora quattro
 * richieste di settembre, decise da un mese. Da lì le due viste.
 *
 * Qui dentro non si parla col database: si decide cosa va in quale vista,
 * in che ordine, sotto quale squadra e con quale frase. Le frasi le ha
 * scritte `applyMovements` quando il movimento è avvenuto, e restano come
 * sono — sono il fatto; questo modulo le accorcia solo quando la squadra è
 * già scritta nel titolo del gruppo.
 */

export type Vista = 'daFare' | 'fatte';

export interface VoceCoda {
  id: string;
  /** la frase scritta quando il movimento è avvenuto */
  corpo: string;
  fatto: boolean;
  fattoIl: string | null;
  creataIl: string;
  /** la squadra la cui rosa va toccata; null per le righe che non ne riguardano una sola */
  squadra: string | null;
  squadraId: string | null;
}

export interface GruppoCoda {
  squadraId: string | null;
  etichetta: string;
  voci: VoceCoda[];
}

export const SENZA_SQUADRA = 'Senza squadra';

/** Quante righe stanno in ciascuna vista. Serve all'interruttore. */
export function conteggi(voci: VoceCoda[]): { daFare: number; fatte: number } {
  let daFare = 0;
  let fatte = 0;
  for (const v of voci) {
    if (v.fatto) fatte += 1;
    else daFare += 1;
  }
  return { daFare, fatte };
}

/**
 * La frase senza il nome della squadra, quando è già il titolo del gruppo.
 *
 * Le due forme che il database contiene davvero:
 *
 *   «Nella rosa FC Joga Benito: svincolare …»        → «svincolare …»
 *   «Svincolo gratuito da decidere · Montester: X»   → «Svincolo gratuito da decidere · X»
 *
 * Il taglio si fa solo se il nome della squadra c'è per davvero dentro la
 * frase: tagliare fino ai due punti alla cieca mangerebbe mezza riga quando
 * la squadra è stata rinominata dopo che la riga era già scritta. In quel
 * caso la frase resta intera, che è brutto ma vero.
 */
export function frasePulita(v: VoceCoda): string {
  if (!v.squadra) return v.corpo;

  const annullato = v.corpo.startsWith('ANNULLATO — ');
  const resto = annullato ? v.corpo.slice('ANNULLATO — '.length) : v.corpo;

  let pulita = resto;
  const inRosa = `Nella rosa ${v.squadra}: `;
  const dopoPunto = `· ${v.squadra}: `;
  if (resto.startsWith(inRosa)) pulita = resto.slice(inRosa.length);
  else if (resto.includes(dopoPunto)) pulita = resto.replace(dopoPunto, '· ');

  return annullato ? `ANNULLATO — ${pulita}` : pulita;
}

/**
 * L'ordine dentro una vista, che non è lo stesso nelle due.
 *
 * Da fare: le più vecchie in cima. Il travaso si fa in ordine, e la riga di
 * un mese fa è quella che rischia di restare lì per sempre — metterla in
 * fondo è il modo di non vederla mai.
 *
 * Fatte: l'ultima spuntata in cima, perché la si guarda per ritrovare quello
 * che si è appena fatto (o per disfarlo). `fattoIl` è nullable e nel
 * database c'è già una riga chiusa prima che esistesse il bottone: lì ricade
 * sulla data di creazione, altrimenti quelle righe si impilerebbero in un
 * ordine qualsiasi.
 */
export function ordinaPerVista(voci: VoceCoda[], vista: Vista): VoceCoda[] {
  const quando = (v: VoceCoda) => (vista === 'fatte' ? v.fattoIl ?? v.creataIl : v.creataIl);
  const verso = vista === 'fatte' ? -1 : 1;
  return [...voci].sort((a, b) => {
    const d = quando(a).localeCompare(quando(b)) * verso;
    // a parità di istante l'id tiene l'ordine fermo: due aggiudicazioni dello
    // stesso secondo non devono ballare fra un caricamento e l'altro
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Le righe raggruppate per squadra, in ordine alfabetico.
 *
 * Diviso per squadra e non per data perché il lavoro si fa così: aprire la
 * rosa di una squadra e fare i suoi movimenti. Saltare avanti e indietro fra
 * due squadre è il modo di svincolare il giocatore sbagliato — è la stessa
 * ragione per cui l'elenco da copiare era già diviso per squadra.
 *
 * Le righe senza squadra stanno in fondo e non in mezzo all'alfabeto: non
 * sono una squadra che comincia per «S».
 */
export function gruppiDellaCoda(voci: VoceCoda[], vista: Vista): GruppoCoda[] {
  const per = new Map<string, VoceCoda[]>();
  for (const v of voci) {
    const chiave = v.squadraId ?? '';
    per.set(chiave, [...(per.get(chiave) ?? []), v]);
  }

  const gruppi: GruppoCoda[] = [...per.entries()].map(([chiave, sue]) => ({
    squadraId: chiave === '' ? null : chiave,
    etichetta: sue[0].squadra ?? SENZA_SQUADRA,
    voci: ordinaPerVista(sue, vista),
  }));

  return gruppi.sort((a, b) => {
    if (a.squadraId === null) return 1;
    if (b.squadraId === null) return -1;
    return a.etichetta.localeCompare(b.etichetta, 'it');
  });
}

/**
 * Gli id selezionati che sono davvero in questa vista.
 *
 * La selezione vive nel browser: cambiando vista, o dopo che un'altra
 * finestra ha spuntato qualcosa, può contenere righe che qui non ci sono
 * più. Mandarle al server non farebbe danni — l'azione filtra per lega — ma
 * il conto sul bottone direbbe un numero che non corrisponde a niente.
 */
export function soloSelezionate(selezionate: string[], voci: VoceCoda[]): string[] {
  const ci = new Set(voci.map((v) => v.id));
  return selezionate.filter((id) => ci.has(id));
}
