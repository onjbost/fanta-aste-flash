/**
 * L'edizione del mercato chiuso: quello che è successo davvero.
 *
 * Esce quando la sala d'asta chiude. È il gemello delle indiscrezioni, ma
 * rovesciato: là tutto era al condizionale e i nomi degli svincolandi non
 * potevano comparire, qui invece **sono tutti fatti** — chi ha vinto, a
 * quanto, a discapito di chi, e chi si è preso un giocatore senza che
 * nessuno gli facesse concorrenza.
 *
 * Il registro resta quello del giornale sportivo, ma con una differenza che
 * vale la pena dire per esteso: qui i crediti si nominano. Nelle
 * indiscrezioni «crediti» era una parola vietata perché rompeva l'illusione
 * del mercato vero; qui il prezzo è la notizia — «se l'è preso per
 * trentaquattro» è esattamente quello che il gruppo commenta — e nasconderlo
 * renderebbe la pagina un elenco di nomi senza peso. Restano fuori le parole
 * che sanno di foglio di calcolo: fantamedia, fantapunti, listone.
 */

import { dataEstesa, paroleDelCappello, type DatiPrima, type Disposizione, type FotoPrima } from './prima';
import { nominato } from '../nomi';
import { paroleCheIniziano } from './mercato';

export type Ruolo = 'P' | 'D' | 'C' | 'A';

const NOME_RUOLO: Record<Ruolo, string> = {
  P: 'portiere', D: 'difensore', C: 'centrocampista', A: 'attaccante',
};

/** Un lotto arrivato in fondo: chi l'ha vinto, a quanto, contro chi. */
export interface AstaConclusa {
  lottoId: string;
  giocatore: string;
  ruolo: Ruolo;
  /** il club di Serie A: è quello che àncora il pezzo alla realtà */
  club: string;
  quotazione: number;
  /** la squadra di lega che se l'è preso */
  vincitore: string;
  prezzo: number;
  /** chi aveva chiamato per primo */
  chiamante: string;
  /** le altre squadre di lega che erano nel lotto, vincitore escluso */
  battute: string[];
}

/** Uno scambio già applicato, coi giocatori che hanno cambiato maglia. */
export interface ScambioFatto {
  id: string;
  squadraA: string;
  squadraB: string;
  /** i giocatori che dalla A vanno alla B */
  versoB: string[];
  /** i giocatori che dalla B vanno alla A */
  versoA: string[];
  conguaglio: number;
  /** chi paga il conguaglio, se c'è */
  pagante: 'A' | 'B' | null;
}

export interface RichiestaChiusura {
  tono: number;
  sessione: number;
  /** quando si è giocata l'asta, già scritto per esteso */
  quando: string;
  disposizione: Disposizione;
  aste: AstaConclusa[];
  /** il lotto che va in apertura */
  apertura: string;
  scambi: ScambioFatto[];
  paroleVietate: string[];
  /** i nomi che in pagina non possono comparire */
  nomiVietati: string[];
  correzioni?: string[];
}

export interface TestiChiusura {
  titolo: string;
  gancio: string;
  cappello: string;
  /** un blocco per ogni altra asta contesa */
  blocchi: { lottoId: string; testo: string }[];
  /** il riquadro di chi è passato senza contendenti */
  svincolati: string;
  /** una riga per ogni scambio, legata al suo id */
  scambi: { id: string; testo: string }[];
  spalla: { numero: string; didascalia: string } | null;
}

/** Quello che la pagina mette accanto ai testi. */
export interface PezziDellaChiusura {
  richiesta: RichiestaChiusura;
  foto: FotoPrima | null;
}

// =====================================================================
// Chi è contesa e chi no
// =====================================================================

/**
 * Un'asta è contesa quando il chiamante ha avuto almeno un avversario —
 * cioè quando il lotto aveva almeno due partecipanti. È la riga che divide
 * la pagina in due: sopra le aste vere, nel riquadro chi se l'è portato a
 * casa perché nessuno si è presentato.
 */
export function contesa(a: AstaConclusa): boolean {
  return a.battute.length > 0;
}

export function contese(aste: AstaConclusa[]): AstaConclusa[] {
  return aste.filter(contesa);
}

export function senzaContendenti(aste: AstaConclusa[]): AstaConclusa[] {
  return aste.filter((a) => !contesa(a));
}

/**
 * Quale asta apre la pagina: **la quotazione più alta fra quelle contese**.
 *
 * Qui la regola è diversa da quella delle indiscrezioni, e non per capriccio.
 * Prima dell'asta il duello è tutto quello che c'è, e il nome conta poco;
 * a cose fatte il metro è il giocatore — il più pregiato che si sono
 * conteso — perché è quello di cui si parlerà. A parità di quotazione vince
 * chi è costato di più, e poi l'ordine del lotto, che è stabile.
 *
 * Se nessuna è stata contesa la pagina non può restare senza apertura: si
 * ripiega sulla quotazione più alta in assoluto, e il pezzo lo dirà da sé
 * che è passato senza concorrenza.
 */
export function astaDiApertura(aste: AstaConclusa[]): string | null {
  if (!aste.length) return null;
  const candidate = contese(aste).length ? contese(aste) : aste;
  return candidate.slice().sort((a, b) => {
    if (b.quotazione !== a.quotazione) return b.quotazione - a.quotazione;
    if (b.prezzo !== a.prezzo) return b.prezzo - a.prezzo;
    return a.lottoId.localeCompare(b.lottoId);
  })[0].lottoId;
}

/** «ZHEGROVA (Juventus) · 34» — il titoletto del blocco, scritto da noi. */
export function titoloAsta(a: AstaConclusa): string {
  return `${a.giocatore} (${a.club}) · ${a.prezzo}`;
}

/** «Montester United ⇄ Pirati dei Caracoli» */
export function titoloScambio(s: ScambioFatto): string {
  return `${s.squadraA} - ${s.squadraB}`;
}

/** Chi ha pagato il conguaglio, col suo nome. */
export function paganteDi(s: ScambioFatto): string | null {
  if (!s.conguaglio || !s.pagante) return null;
  return s.pagante === 'A' ? s.squadraA : s.squadraB;
}

// =====================================================================
// Il prompt
// =====================================================================

function rigaAsta(a: AstaConclusa): string {
  const righe = [
    `### ${a.giocatore}, ${NOME_RUOLO[a.ruolo]} del ${a.club}`,
    `lottoId: ${a.lottoId}`,
    `se l'è preso: ${a.vincitore}, per ${a.prezzo}`,
    `aveva chiamato per primo: ${a.chiamante}`,
  ];
  righe.push(a.battute.length
    ? `è rimasto a mani vuote: ${a.battute.join(', ')}`
    : 'nessuno si è presentato contro: è passato alla base');
  return righe.join('\n');
}

function rigaScambio(s: ScambioFatto): string {
  const conguaglio = paganteDi(s) ? `, con ${s.conguaglio} di conguaglio pagati da ${paganteDi(s)}` : '';
  return [
    `### ${s.squadraA} e ${s.squadraB}`,
    `id: ${s.id}`,
    `al ${s.squadraB} vanno: ${s.versoB.join(', ') || 'nessuno'}`,
    `al ${s.squadraA} vanno: ${s.versoA.join(', ') || 'nessuno'}${conguaglio}`,
  ].join('\n');
}

function tono(v: number): string {
  if (v <= 1) return 'misurato, da cronaca';
  if (v === 2) return 'asciutto, con qualche punta';
  if (v === 3) return 'pungente ma sportivo';
  if (v === 4) return 'cattivello: le bocciature si sentono';
  return 'velenoso, da sfottò da gruppo';
}

export function costruisciPromptChiusura(r: RichiestaChiusura): string {
  const ap = r.aste.find((a) => a.lottoId === r.apertura) ?? r.aste[0];
  const altre = contese(r.aste).filter((a) => a.lottoId !== ap?.lottoId);
  const liberi = senzaContendenti(r.aste).filter((a) => a.lottoId !== ap?.lottoId);
  const cap = paroleDelCappello(r.disposizione);

  return `Sei il giornalista di mercato della "Gazzetta della Mansarda". L'asta ${r.sessione} si è giocata ${r.quando} e la sala ha chiuso: scrivi la prima pagina del mercato **concluso**.

## Tono
${r.tono}/5 — ${tono(r.tono)}.
Si punzecchia il **club** e la sua dirigenza, mai la persona.

## Il registro
Scrivi come si scrive di calciomercato sui giornali: le squadre sono club, chi le guida sono dirigenti, i giocatori hanno un entourage. Qui però **niente è più un'indiscrezione**: è tutto successo. Usa il passato prossimo e l'indicativo — «se l'è portato a casa», «ha vinto il duello», «ha dovuto alzare bandiera bianca» — e non usare mai il condizionale.

I prezzi si scrivono: sono la notizia. Un giocatore «è costato 34», un club «si è spinto fino a 21». Non servono unità di misura.

## Regole assolute
1. Non scrivere MAI un numero che non ti ho dato qui sotto.
2. **Non nominare nessun giocatore che non sia in questa pagina**: né altri della rosa, né chi è uscito per far posto.
3. Non inventare rilanci, cifre intermedie o retroscena d'asta che non ti ho dato: di ogni lotto sai solo chi ha vinto, a quanto, e chi è rimasto a mani vuote.
4. Non inventare risultati, voti o partite: qui si parla solo di mercato.${
  r.paroleVietate.length ? `\n5. Parole vietate: ${r.paroleVietate.join(', ')}.` : ''}

## L'asta di apertura — la più pregiata fra quelle contese
${ap ? rigaAsta(ap) : 'nessuna asta conclusa'}

## Le altre aste contese
${altre.map(rigaAsta).join('\n\n') || 'nessuna'}

## Passati senza che nessuno si opponesse
${liberi.map((a) => `- ${a.giocatore} (${NOME_RUOLO[a.ruolo]} del ${a.club}) al ${a.vincitore} per ${a.prezzo}`).join('\n') || 'nessuno'}

## Gli scambi fra allenatori in questa finestra
${r.scambi.map(rigaScambio).join('\n\n') || 'nessuno'}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice:

{
  "titolo": "il titolo dell'apertura, al massimo 44 caratteri: il giocatore e chi l'ha preso",
  "gancio": "la seconda riga, al massimo 30 caratteri: il prezzo o chi è rimasto a bocca asciutta",
  "cappello": "il pezzo dell'apertura: fra ${cap.min} e ${cap.max} parole, due o tre frasi",
  "blocchi": [${altre.map((a) => `{ "lottoId": "${a.lottoId}", "testo": "due righe su ${a.giocatore}, al massimo 190 caratteri" }`).join(', ') || ''}],
  "svincolati": "un unico paragrafo sui giocatori passati senza opposizione, al massimo 240 caratteri${liberi.length ? '' : ' — se non ce ne sono, scrivi una riga che lo dica'}",
  "scambi": [${r.scambi.map((s) => `{ "id": "${s.id}", "testo": "una riga sullo scambio fra ${s.squadraA} e ${s.squadraB}, al massimo 170 caratteri" }`).join(', ') || ''}],
  "spalla": { "numero": "UN numero solo fra quelli che ti ho dato, in cifre", "didascalia": "cosa significa, al massimo 110 caratteri" }
}

L'array "blocchi" deve contenere tutte e ${altre.length} le altre aste contese, coi lottoId esatti. L'array "scambi" deve contenere tutti e ${r.scambi.length} gli scambi, con gli id esatti.${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''}`;
}

// =====================================================================
// La lettura e la verifica
// =====================================================================

export function daJsonChiusura(grezzo: unknown): TestiChiusura {
  const p = (grezzo ?? {}) as Record<string, unknown>;
  const blocchi = Array.isArray(p.blocchi) ? p.blocchi : [];
  const scambi = Array.isArray(p.scambi) ? p.scambi : [];
  const spalla = p.spalla as { numero?: unknown; didascalia?: unknown } | null | undefined;

  return {
    titolo: String(p.titolo ?? '').trim(),
    gancio: String(p.gancio ?? '').trim(),
    cappello: String(p.cappello ?? '').trim(),
    blocchi: blocchi.map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      return { lottoId: String(x.lottoId ?? ''), testo: String(x.testo ?? '').trim() };
    }),
    svincolati: String(p.svincolati ?? '').trim(),
    scambi: scambi.map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return { id: String(x.id ?? ''), testo: String(x.testo ?? '').trim() };
    }),
    spalla: spalla && String(spalla.numero ?? '').trim()
      ? { numero: String(spalla.numero).trim(), didascalia: String(spalla.didascalia ?? '').trim() }
      : null,
  };
}

export interface EsitoChiusura {
  ok: boolean;
  problemi: string[];
  inventati: number[];
}

/**
 * I numeri che questa pagina ha il diritto di citare: i prezzi, le
 * quotazioni, i conguagli, quanti erano, e le cifre della data — che
 * gliel'abbiamo scritta noi.
 */
export function numeriDellaChiusura(r: RichiestaChiusura): Set<number> {
  const n = new Set<number>([
    r.sessione, r.aste.length, r.scambi.length,
    contese(r.aste).length, senzaContendenti(r.aste).length,
  ]);
  for (const a of r.aste) {
    n.add(a.prezzo); n.add(a.quotazione); n.add(a.battute.length + 1);
  }
  for (const s of r.scambi) {
    if (s.conguaglio) n.add(s.conguaglio);
    n.add(s.versoA.length); n.add(s.versoB.length);
  }
  for (const x of r.quando.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const v = Number(x.replace(',', '.'));
    if (Number.isFinite(v)) n.add(v);
  }
  return n;
}

/**
 * Le parole che qui tradirebbero il foglio di calcolo.
 *
 * L'elenco è più corto di quello delle indiscrezioni apposta: «asta»,
 * «crediti» e «svincolati» sono i fatti di questa pagina e devono poterci
 * stare. Restano fuori solo le parole che nessun giornale userebbe.
 */
const DA_FOGLIO_DI_CALCOLO = ['fantapunt', 'fantamedia', 'fantallenator', 'listone', 'lotto', 'lotti'];

export function verificaChiusura(t: TestiChiusura, r: RichiestaChiusura): EsitoChiusura {
  const problemi: string[] = [];
  const tutto = [t.titolo, t.gancio, t.cappello, ...t.blocchi.map((b) => b.testo),
    t.svincolati, ...t.scambi.map((s) => s.testo), t.spalla?.didascalia ?? ''].join('\n');

  if (!t.titolo) problemi.push('manca il titolo');
  if (!t.cappello) problemi.push('manca il cappello');
  if (t.titolo.length > 44) problemi.push(`il titolo è di ${t.titolo.length} caratteri invece di 44`);
  if (t.gancio.length > 30) problemi.push(`il gancio è di ${t.gancio.length} caratteri invece di 30`);
  if (t.svincolati.length > 240) problemi.push(`il riquadro degli svincolati è di ${t.svincolati.length} caratteri invece di 240`);

  const parole = t.cappello.trim().split(/\s+/).filter(Boolean).length;
  const cap = paroleDelCappello(r.disposizione);
  if (t.cappello && (parole < cap.min || parole > cap.max)) {
    problemi.push(`il cappello è di ${parole} parole invece che fra ${cap.min} e ${cap.max}`);
  }

  // i blocchi e gli scambi devono esserci tutti, e con le chiavi giuste
  const attesi = contese(r.aste).filter((a) => a.lottoId !== r.apertura).map((a) => a.lottoId);
  const arrivati = new Set(t.blocchi.map((b) => b.lottoId));
  for (const id of attesi) if (!arrivati.has(id)) problemi.push(`manca il blocco del lotto ${id}`);
  for (const b of t.blocchi) {
    if (!attesi.includes(b.lottoId)) problemi.push(`il blocco ${b.lottoId} non corrisponde a nessuna asta contesa`);
    if (b.testo.length > 190) problemi.push(`un blocco è di ${b.testo.length} caratteri invece di 190`);
  }

  const idScambi = r.scambi.map((s) => s.id);
  const scambiArrivati = new Set(t.scambi.map((s) => s.id));
  for (const id of idScambi) if (!scambiArrivati.has(id)) problemi.push(`manca la riga dello scambio ${id}`);
  for (const s of t.scambi) {
    if (!idScambi.includes(s.id)) problemi.push(`la riga ${s.id} non corrisponde a nessuno scambio`);
    if (s.testo.length > 170) problemi.push(`una riga di scambio è di ${s.testo.length} caratteri invece di 170`);
  }

  // il condizionale: qui è tutto successo davvero
  if (/\b\w+(?:ebbe|ebbero)\b/i.test(tutto)) {
    problemi.push('c\'è un condizionale: in questa edizione è tutto già successo, si scrive all\'indicativo');
  }

  // la radice si cerca a **inizio parola**, non dentro: cercarla dentro
  // bocciava pezzi puliti — «guastare» contiene «asta» — ed è il difetto che
  // ha mandato al ripiego il primo pezzo di indiscrezioni vero
  const scivoloni = paroleCheIniziano(tutto, [...DA_FOGLIO_DI_CALCOLO, ...r.paroleVietate]);
  for (const parola of scivoloni) problemi.push(`parola da non usare: «${parola}»`);

  for (const nome of r.nomiVietati) {
    if (nominato(tutto, nome)) problemi.push(`nomina «${nome}», che in questa pagina non deve comparire`);
  }

  const leciti = numeriDellaChiusura(r);
  const inventati: number[] = [];
  for (const x of tutto.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const v = Number(x.replace(',', '.'));
    if (Number.isFinite(v) && !leciti.has(v)) inventati.push(v);
  }
  if (inventati.length) problemi.push(`numeri inventati: ${inventati.join(', ')}`);

  return { ok: problemi.length === 0, problemi, inventati };
}

// =====================================================================
// Il ripiego
// =====================================================================

/**
 * La pagina scritta senza modello: brutta ma vera.
 *
 * Non è un caso limite da ignorare. Quando il modello sbaglia due volte di
 * fila la gazzetta esce lo stesso, e deve essere una pagina che si può
 * mandare nel gruppo senza vergognarsi: i fatti ci sono tutti, manca solo
 * il colore.
 */
export function chiusuraDiRipiego(r: RichiestaChiusura): TestiChiusura {
  const ap = r.aste.find((a) => a.lottoId === r.apertura) ?? r.aste[0] ?? null;
  const altre = contese(r.aste).filter((a) => a.lottoId !== ap?.lottoId);
  const liberi = senzaContendenti(r.aste).filter((a) => a.lottoId !== ap?.lottoId);

  const conta = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;
  const cap = paroleDelCappello(r.disposizione);

  const frasi = ap
    ? [
      `Il ${NOME_RUOLO[ap.ruolo]} del ${ap.club} è l'acquisto più pregiato di questa finestra.`,
      `Se l'è portato a casa ${ap.vincitore} per ${ap.prezzo}.`,
      ap.battute.length
        ? `${ap.battute.join(' e ')} ${ap.battute.length > 1 ? 'sono rimaste' : 'è rimasta'} a mani vuote.`
        : 'Nessuno si è opposto.',
      `La sala ha chiuso ${r.quando}.`,
    ].filter(Boolean)
    : ['La sala ha chiuso senza che si assegnasse nessun giocatore.'];

  let cappello = '';
  for (const f of frasi) {
    if (conta(`${cappello} ${f}`) > cap.max) continue;
    cappello = cappello ? `${cappello} ${f}` : f;
  }

  return {
    titolo: ap ? `${ap.giocatore} al ${ap.vincitore}`.slice(0, 44) : 'Sala chiusa',
    gancio: ap ? `per ${ap.prezzo}`.slice(0, 30) : '',
    cappello,
    blocchi: altre.map((a) => ({
      lottoId: a.lottoId,
      testo: `${a.vincitore} l'ha spuntata per ${a.prezzo}, davanti a ${a.battute.join(' e ')}.`,
    })),
    svincolati: liberi.length
      ? `Senza contendenti: ${liberi.map((a) => `${a.giocatore} al ${a.vincitore} per ${a.prezzo}`).join('; ')}.`
      : 'Nessun giocatore è passato senza opposizione.',
    scambi: r.scambi.map((s) => ({
      id: s.id,
      testo: `${s.squadraA} e ${s.squadraB} si sono scambiati ${[...s.versoB, ...s.versoA].join(', ')}.`,
    })),
    spalla: r.aste.length
      ? { numero: String(r.aste.length), didascalia: 'i giocatori assegnati in questa sessione d\'asta.' }
      : null,
  };
}

// =====================================================================
// Il montaggio
// =====================================================================

/**
 * Dai testi del modello alla prima pagina del mercato chiuso.
 *
 * Tre riquadri, come li aveva chiesti: l'apertura con la foto, «Le altre
 * aste» a sinistra — dove in fondo sta il Mercato Svincolati, cioè chi è
 * passato senza contendenti — e gli scambi nella colonna di destra, che
 * nelle indiscrezioni restava vuota.
 *
 * I titoletti li scriviamo noi: il club di Serie A e il prezzo sono fatti, e
 * un fatto che il modello non scrive è un fatto che non può sbagliare.
 */
export function montaChiusura(
  t: TestiChiusura, p: PezziDellaChiusura, quando = new Date(),
): DatiPrima {
  const r = p.richiesta;
  const ap = r.aste.find((x) => x.lottoId === r.apertura) ?? r.aste[0] ?? null;
  const testoDi = new Map(t.blocchi.map((b) => [b.lottoId, b.testo]));
  const altre = contese(r.aste).filter((x) => x.lottoId !== ap?.lottoId);
  const liberi = senzaContendenti(r.aste).filter((x) => x.lottoId !== ap?.lottoId);

  const voci = altre.map((x) => ({ titolo: titoloAsta(x), testo: testoDi.get(x.lottoId) ?? '' }));
  if (liberi.length || t.svincolati) {
    voci.push({ titolo: 'Mercato Svincolati', testo: t.svincolati });
  }

  const testoScambio = new Map(t.scambi.map((s) => [s.id, s.testo]));

  return {
    tipo: 'mercato_chiuso',
    numero: `MERCATO · ASTA ${r.sessione}`,
    data: dataEstesa(quando),
    // non «MERCATO CHIUSO»: quella scritta sta già in alto a sinistra, e
    // ripeterla sotto la testata fa una pagina che si presenta due volte
    sottotestata: 'ASTE ★ SCAMBI ★ RIMPIANTI',
    occhiello: 'LA SALA HA CHIUSO',
    titolo: t.titolo,
    gancio: t.gancio,
    sottotitolo: ap
      ? `${ap.giocatore} (${ap.club}) al ${ap.vincitore} per ${ap.prezzo}`
      : `Asta ${r.sessione}`,
    cappello: t.cappello,
    foto: p.foto,
    classifica: [],
    prossimi: [],
    gironi: null,
    tabellone: null,
    titoloAltre: 'Le altre aste',
    altre: voci,
    colonna: r.scambi.length
      ? {
        titolo: 'Gli scambi',
        voci: r.scambi.map((s) => ({
          titolo: titoloScambio(s),
          testo: testoScambio.get(s.id) ?? '',
        })),
      }
      : null,
    spalla: t.spalla,
    piedeSinistra: 'FANTA MANSARDA',
    piedeDestra: 'TUTTO VERO, STAVOLTA',
  };
}
