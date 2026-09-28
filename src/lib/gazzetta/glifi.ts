/**
 * La Gazzetta — i caratteri che i font sanno disegnare.
 *
 * La prima pagina è un'immagine: se un carattere manca al font, non esce un
 * ripiego elegante come nel browser, esce un **quadratino**. E un quadratino
 * in mezzo al nome di un giocatore, su una pagina che finisce nel gruppo, è
 * l'errore più visibile che questa funzionalità possa fare.
 *
 * Quindi invece di sperare che il font basti, si italianizza: ogni carattere
 * fuori dall'insieme sicuro diventa la lettera italiana che gli somiglia.
 * «Milinković-Savić» diventa «Milinkovic-Savic», che è poi esattamente come
 * lo scrive il listone di Fantacalcio.it.
 *
 * Le vocali accentate italiane — à è é ì ò ù, e le maiuscole — restano come
 * sono: quelle i font ce le hanno tutte (verificato), e toglierle
 * trasformerebbe BERNABÈ in BERNABE, che è un errore, non una semplificazione.
 */

/**
 * L'insieme sicuro: ASCII stampabile più gli accenti italiani.
 *
 * Deliberatamente più stretto di quello che i font sanno fare. Un carattere
 * italianizzato di troppo non si vede; un quadratino sì.
 */
const ACCENTI_ITALIANI = 'àèéìíòóùúÀÈÉÌÍÒÓÙÚ';

/**
 * I segni non alfabetici che tutti i font in uso hanno (verificato sul
 * cmap): il pallino della sottotestata, il punto in mezzo che separa le
 * parti del numero d'edizione, il grado delle posizioni.
 */
const SEPARATORI = '\u2022\u00b7\u00b0';

export function nellInsiemeSicuro(c: string): boolean {
  const n = c.codePointAt(0)!;
  if (n >= 0x20 && n <= 0x7e) return true;      // ASCII stampabile
  return ACCENTI_ITALIANI.includes(c) || SEPARATORI.includes(c);
}

/**
 * I casi che la scomposizione Unicode non risolve da sola.
 *
 * Per la maggior parte dei caratteri accentati basta scomporre e buttare via
 * i segni (ć → c + ´ → c). Questi invece sono lettere a sé, non lettere con
 * un segno sopra: la ø danese, la đ croata, la ł polacca, la ı turca senza
 * punto. Vanno mappate a mano, una per una.
 */
const A_MANO: Record<string, string> = {
  'ø': 'o', 'Ø': 'O', 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D',
  'ł': 'l', 'Ł': 'L', 'ı': 'i', 'İ': 'I', 'ŉ': 'n',
  // gli indicatori ordinali ce li ha solo il font dei titoli: nei corpi
  // uscirebbero come quadratini
  'ª': 'a', 'º': 'o',
  'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
  'þ': 'th', 'Þ': 'TH', 'ħ': 'h', 'Ħ': 'H', 'ŧ': 't', 'Ŧ': 'T',
  // la stella della sottotestata: nessuno dei font in uso ha U+2605, e il
  // pallino è il separatore che la Gazzetta usa davvero
  '★': '•', '☆': '•',
  // punteggiatura tipografica che i font potrebbero non avere
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...', ' ': ' ',
};

/**
 * Italianizza un testo, lasciando intatto tutto ciò che è già sicuro.
 *
 * Torna anche l'elenco di cosa ha sostituito: serve a dirlo all'admin
 * nell'editor, perché veda che il nome sulla pagina non è identico a quello
 * del listone e non pensi a un errore di battitura.
 */
export function italianizza(testo: string): { testo: string; sostituiti: string[] } {
  const sostituiti: string[] = [];
  let esito = '';

  for (const c of testo) {
    if (nellInsiemeSicuro(c)) { esito += c; continue; }

    const aMano = A_MANO[c];
    if (aMano !== undefined) {
      esito += aMano;
      sostituiti.push(`${c}→${aMano}`);
      continue;
    }

    // scomposizione: la lettera più i segni diacritici, di cui si tiene solo
    // la lettera. Copre ć č š ž ğ ş ń ā ō e tutta la famiglia
    const scomposto = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (scomposto !== c && [...scomposto].every(nellInsiemeSicuro) && scomposto.length > 0) {
      esito += scomposto;
      sostituiti.push(`${c}→${scomposto}`);
      continue;
    }

    // non traducibile: meglio togliere che stampare un quadratino
    sostituiti.push(`${c}→(tolto)`);
  }

  return { testo: esito, sostituiti };
}

/** Comodo quando le sostituzioni non interessano. */
export const soloTesto = (t: string): string => italianizza(t).testo;
