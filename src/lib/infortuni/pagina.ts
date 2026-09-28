/**
 * Gli indisponibili di Serie A — la lettura della pagina.
 *
 * Stessa scelta del tabellino della Redazione: si parte dal **testo
 * renderizzato**, non dall'HTML e non da un'API interna. La pagina di
 * fantacalcio.it cambia impaginazione con una certa regolarità, ma il testo
 * che un lettore vede resta quello: squadra, etichetta della sezione, nome,
 * descrizione. Un parser su questa forma si rompe molto più di rado.
 *
 * Funzioni pure, nessuna rete e nessun database: chi va a prendere la pagina
 * è `infortuniServer.ts`.
 */

export type Categoria = 'infortunato' | 'squalificato' | 'in_dubbio' | 'diffidato';

export interface Indisponibile {
  club: string;
  nome: string;
  categoria: Categoria;
  descrizione: string;
  /** la frase da cui è stata dedotta la data, quando c'è */
  rientroTesto: string | null;
  /** la data dedotta, quando la prosa ne contiene una */
  rientroStimato: string | null;
}

const ETICHETTE: Record<string, Categoria> = {
  'infortunati': 'infortunato',
  'squalificati': 'squalificato',
  'in dubbio': 'in_dubbio',
  'diffidati': 'diffidato',
};

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * Da «rientro dalla fine di novembre» a una data.
 *
 * La fonte non dà mai date precise: dà frasi. Si traducono in un giorno solo
 * per poterci fare un confronto («più di due mesi?»), e quel giorno è una
 * **stima**, non un fatto — per questo `rientroTesto` conserva sempre la
 * frase originale e l'interfaccia mostra tutte e due. Senza la frase
 * accanto, una stima sbagliata diventerebbe indistinguibile da una giusta.
 *
 * L'anno si sceglie in avanti: un mese già passato rispetto a `oggi` si
 * riferisce alla stagione che viene, non a quella finita.
 */
export function stimaRientro(
  descrizione: string, oggi: Date,
): { data: string; testo: string } | null {
  const t = descrizione.toLowerCase();

  // il mese va cercato vicino a una parola che parli di rientro, altrimenti
  // si prende la data dell'infortunio («KO il 7 settembre») per quella del
  // ritorno, che è l'errore più facile e più grave di tutto il parser
  const re = new RegExp(
    `(rientr\\w*|torn\\w*|recuperabil\\w*|arruolabil\\w*|disponibil\\w*|convocabil\\w*`
    + `|rivederlo|riverderlo|fino a|fino al|fino alla)`
    + `[^.;]{0,80}?`
    + `(inizio|metà|meta|fine|prima metà|seconda metà)?\\s*(?:di\\s+|del\\s+)?`
    + `(${MESI.join('|')})`,
    'i',
  );
  const m = t.match(re);
  if (!m) return null;

  const quando = (m[2] ?? '').replace('meta', 'metà');
  const mese = MESI.indexOf(m[3]);
  const giorno = quando.includes('seconda metà') ? 20
    : quando === 'fine' ? 25
      : quando === 'metà' ? 15
        : quando === 'prima metà' ? 8
          : quando === 'inizio' ? 5
            : 15; // senza indicazione, il centro del mese

  let anno = oggi.getFullYear();
  const candidata = new Date(Date.UTC(anno, mese, giorno));
  if (candidata.getTime() < oggi.getTime()) anno += 1;

  const data = new Date(Date.UTC(anno, mese, giorno));
  return {
    data: data.toISOString().slice(0, 10),
    testo: m[0].trim(),
  };
}

/** Quanti giorni mancano al rientro stimato. Null quando non c'è una stima. */
export function giorniDiStop(rientro: string | null, oggi: Date): number | null {
  if (!rientro) return null;
  const d = new Date(`${rientro}T00:00:00Z`);
  return Math.round((d.getTime() - oggi.getTime()) / 86_400_000);
}

/** Una riga è il nome di un giocatore o la prosa che lo descrive? */
function sembraUnNome(riga: string): boolean {
  // i nomi sono corti e senza punteggiatura di frase; le descrizioni sono
  // periodi interi. L'abbreviazione del nome proprio («Sulemana K.») finisce
  // con un punto, quindi il punto da solo non basta a distinguere.
  if (riga.length > 34) return false;
  if (/[,;:]/.test(riga)) return false;
  const puntiVeri = riga.replace(/\b[A-Z]\./g, '').includes('.');
  return !puntiVeri;
}

/**
 * Dal testo della pagina all'elenco degli indisponibili.
 *
 * `club` è il vocabolario delle squadre di Serie A, che arriva da fuori (dai
 * nostri `players.club`): riconoscere le squadre da un elenco noto invece che
 * dalla forma della riga è ciò che rende il parser insensibile a come la
 * pagina è impaginata.
 */
export function leggiIndisponibili(
  testo: string, club: string[], oggi: Date = new Date(),
): Indisponibile[] {
  const vocabolario = new Map(club.map((c) => [c.toLowerCase().trim(), c]));
  const righe = testo.split('\n').map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const esito: Indisponibile[] = [];
  let clubCorrente: string | null = null;
  let categoria: Categoria | null = null;
  let nome: string | null = null;
  let descrizione: string[] = [];

  const chiudi = () => {
    if (!clubCorrente || !categoria || !nome) { nome = null; descrizione = []; return; }
    const testoDesc = descrizione.join(' ').trim();
    const stima = testoDesc ? stimaRientro(testoDesc, oggi) : null;
    esito.push({
      club: clubCorrente,
      nome,
      categoria,
      descrizione: testoDesc,
      rientroTesto: stima?.testo ?? null,
      rientroStimato: stima?.data ?? null,
    });
    nome = null;
    descrizione = [];
  };

  for (const riga of righe) {
    const pulita = riga.replace(/^[-*•\s]+/, '').replace(/\*\*/g, '').trim();
    if (!pulita) continue;

    const comeClub = vocabolario.get(pulita.toLowerCase());
    if (comeClub) { chiudi(); clubCorrente = comeClub; categoria = null; continue; }

    const comeEtichetta = ETICHETTE[pulita.toLowerCase().replace(/^-+\s*/, '')];
    if (comeEtichetta) { chiudi(); categoria = comeEtichetta; continue; }

    if (/^nessuno$/i.test(pulita)) { chiudi(); continue; }
    if (!clubCorrente || !categoria) continue;

    if (sembraUnNome(pulita)) { chiudi(); nome = pulita; }
    else if (nome) descrizione.push(pulita);
  }
  chiudi();

  return esito;
}

/**
 * Il testo di una pagina HTML.
 *
 * Volutamente grezzo: via script e stili, i tag diventano a capo, le entità
 * più comuni tornano caratteri. Non serve di meglio, perché il parser sopra
 * guarda righe e vocabolario, non struttura.
 */
export function testoDiHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é')
    .replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .split('\n').map((r) => r.trim()).filter(Boolean).join('\n');
}

/**
 * Chi si è fatto male da quando abbiamo guardato l'ultima volta.
 *
 * Confronta due fotografie e torna solo gli **infortunati nuovi**: chi
 * nell'elenco di prima non c'era, o c'era ma in un'altra veste (era in dubbio,
 * adesso è infortunato). Non torna chi è guarito, e non torna chi è ancora
 * fermo: l'admin va avvisato quando succede qualcosa, non ogni mercoledì per
 * lo stesso crociato.
 *
 * L'identità è il `player_id` quando c'è e il nome della fonte quando manca:
 * un giocatore non agganciato al nostro listone è comunque un giocatore, e
 * segnalarlo due volte è meglio che non segnalarlo mai.
 */
export function nuoviInfortunati<T extends {
  playerId?: string | null; nome: string; categoria: Categoria;
}>(prima: T[], adesso: T[]): T[] {
  const identita = (r: T) => r.playerId ?? `nome:${r.nome.toUpperCase()}`;
  const eraFermo = new Set(
    prima.filter((r) => r.categoria === 'infortunato').map(identita),
  );
  return adesso.filter((r) => r.categoria === 'infortunato' && !eraFermo.has(identita(r)));
}

/**
 * «fino a fine novembre, circa due mesi» — la durata detta come la direbbe una
 * persona, non in giorni secchi.
 *
 * I giorni li abbiamo (`giorniDiStop`) ma da soli dicono poco: «61 giorni» fa
 * pensare a una precisione che una frase come «rientro da marzo» non ha.
 */
export function durataLeggibile(giorni: number | null): string {
  if (giorni == null) return 'durata non dichiarata dalla fonte';
  if (giorni <= 0) return 'rientro imminente';
  if (giorni < 14) return `una decina di giorni (${giorni})`;
  const mesi = Math.round(giorni / 30);
  if (mesi <= 1) return `circa un mese (${giorni} giorni)`;
  return `circa ${mesi} mesi (${giorni} giorni)`;
}
