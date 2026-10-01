/**
 * Il changelog dell'app, letto dal CHANGELOG.md del progetto.
 *
 * Un pezzetto di markdown tradotto in blocchi, senza librerie: il file lo
 * scrivo io a ogni consegna e usa cinque cose — titoli, elenchi, grassetto,
 * `codice` e paragrafi. Tirarsi dentro un parser completo per cinque cose
 * vorrebbe dire aggiungere una dipendenza che poi va tenuta aggiornata, e un
 * changelog che non si apre più perché il parser ha cambiato API è un
 * changelog inutile.
 *
 * Quello che il file contiene di più — tabelle, citazioni, link — non si
 * perde: resta testo, leggibile com'è scritto.
 */

export type Pezzo =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'forte'; testo: string }
  | { tipo: 'codice'; testo: string };

export type Blocco =
  | { tipo: 'titolo'; livello: 1 | 2 | 3; pezzi: Pezzo[] }
  | { tipo: 'paragrafo'; pezzi: Pezzo[] }
  | { tipo: 'elenco'; voci: Pezzo[][] };

/**
 * Spezza una riga in testo, grassetto e codice.
 *
 * `**` e i backtick si trattano in un giro solo, perché annidarli sarebbe
 * l'unico modo di sbagliare: in un changelog non serve il grassetto dentro il
 * codice, e il primo delimitatore che si apre decide fino a dove arriva.
 */
export function inLinea(riga: string): Pezzo[] {
  const pezzi: Pezzo[] = [];
  let resto = riga;

  while (resto.length > 0) {
    const forte = resto.indexOf('**');
    const codice = resto.indexOf('`');
    // nessuno dei due: il resto è testo e si chiude qui
    if (forte === -1 && codice === -1) {
      pezzi.push({ tipo: 'testo', testo: resto });
      break;
    }

    const primo = forte === -1 ? codice : codice === -1 ? forte : Math.min(forte, codice);
    const delimitatore = primo === forte ? '**' : '`';
    const tipo = delimitatore === '**' ? 'forte' as const : 'codice' as const;

    const chiusura = resto.indexOf(delimitatore, primo + delimitatore.length);
    // delimitatore aperto e mai chiuso: è testo, non una marcatura
    if (chiusura === -1) {
      pezzi.push({ tipo: 'testo', testo: resto });
      break;
    }

    if (primo > 0) pezzi.push({ tipo: 'testo', testo: resto.slice(0, primo) });
    const dentro = resto.slice(primo + delimitatore.length, chiusura);
    if (dentro) pezzi.push({ tipo, testo: dentro });
    resto = resto.slice(chiusura + delimitatore.length);
  }

  // nessun filtro sui pezzi vuoti: non se ne producono. I due `if` qui sopra
  // — `primo > 0` e `dentro` — sono esattamente ciò che li evita, e un filtro
  // in fondo sarebbe una rete che non prende niente, cioè una riga che fa
  // credere che quel caso esista.
  return pezzi;
}

/**
 * Il markdown in blocchi.
 *
 * Le righe di un paragrafo si uniscono con uno spazio: nel file sono mandate
 * a capo a 80 colonne, e lasciarle spezzate darebbe un paragrafo a scalini.
 */
export function inBlocchi(md: string): Blocco[] {
  const blocchi: Blocco[] = [];
  const righe = md.replace(/\r\n/g, '\n').split('\n');

  let paragrafo: string[] = [];
  let elenco: string[] = [];

  const chiudiParagrafo = () => {
    if (paragrafo.length) {
      blocchi.push({ tipo: 'paragrafo', pezzi: inLinea(paragrafo.join(' ').trim()) });
      paragrafo = [];
    }
  };
  const chiudiElenco = () => {
    if (elenco.length) {
      blocchi.push({ tipo: 'elenco', voci: elenco.map((v) => inLinea(v)) });
      elenco = [];
    }
  };
  const chiudiTutto = () => { chiudiParagrafo(); chiudiElenco(); };

  for (const riga of righe) {
    const pulita = riga.trimEnd();

    if (pulita.trim() === '') { chiudiTutto(); continue; }

    const titolo = /^(#{1,3})\s+(.*)$/.exec(pulita);
    if (titolo) {
      chiudiTutto();
      blocchi.push({
        tipo: 'titolo',
        livello: titolo[1].length as 1 | 2 | 3,
        pezzi: inLinea(titolo[2].trim()),
      });
      continue;
    }

    const voce = /^\s*[-*]\s+(.*)$/.exec(pulita);
    if (voce) {
      chiudiParagrafo();
      elenco.push(voce[1].trim());
      continue;
    }

    // continuazione di una voce d'elenco: rientrata, e un elenco è aperto
    if (elenco.length && /^\s{2,}\S/.test(pulita)) {
      elenco[elenco.length - 1] += ` ${pulita.trim()}`;
      continue;
    }

    chiudiElenco();
    paragrafo.push(pulita.trim());
  }

  chiudiTutto();
  return blocchi;
}
