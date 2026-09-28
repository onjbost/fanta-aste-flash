/**
 * Come il listone scrive i nomi, e come li scrive un cronista.
 *
 * Fantacalcio.it disambigua gli omonimi con l'iniziale del nome puntata:
 * «TAVARES N.», «MARTINEZ L.», «RODRIGUEZ JE.». È una convenzione da
 * tabella: in un pezzo nessuno scrive «Tavares N. si prende la fascia», si
 * scrive «Tavares».
 *
 * Due parti del progetto devono saperlo — la verifica dello scambio, che
 * controlla se il pezzo nomina i giocatori scambiati, e la ricerca della
 * foto, che cerca il cognome nei titoli delle news — e nessuna delle due è
 * il posto giusto dove tenere la regola.
 */

/**
 * Solo il cognome, da come il listone scrive i nomi.
 *
 * Il cognome è la prima parola, e l'iniziale puntata in fondo è il nome: va
 * tolta, perché fuori dalle tabelle non la scrive nessuno.
 */
export function cognomeDaListone(nome: string): string {
  return nome.replace(/\b[A-Z]{1,2}\.\s*$/i, '').trim().split(/\s+/)[0] ?? nome;
}

/**
 * Il testo nomina questo giocatore?
 *
 * Vale il nome per intero («TAVARES N.») **oppure** il solo cognome
 * («Tavares»), perché è quello che un pezzo scritto in italiano contiene.
 * Pretendere la forma del listone voleva dire bocciare ogni pezzo che
 * parlasse di un giocatore con l'iniziale puntata — cioè, in pratica,
 * bocciarli tutti.
 */
export function nominato(testo: string, nome: string): boolean {
  const dentro = testo.toUpperCase();

  // Il confine di parola vale per tutte e due le forme. Senza, «KEAN»
  // risulterebbe nominato da una frase che parla di «KEANU»: un semplice
  // `includes` accetta qualunque pezzo di parola più lunga.
  const compare = (x: string) => {
    if (x.length < 3) return false;    // sotto le tre lettere capita per caso
    const scappato = x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${scappato}([^\\p{L}\\p{N}]|$)`, 'u').test(dentro);
  };

  return compare(nome.toUpperCase()) || compare(cognomeDaListone(nome).toUpperCase());
}
