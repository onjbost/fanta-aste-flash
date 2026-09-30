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
  /** i club che non si sono portati a casa nessuno */
  fermi: string[];
  paroleVietate: string[];
  /** i nomi che in pagina non possono comparire */
  nomiVietati: string[];
  correzioni?: string[];
}

export interface TestiChiusura {
  titolo: string;
  gancio: string;
  cappello: string;
  /** un paragrafo solo su tutte le altre aste contese */
  contesi: string;
  /** un paragrafo per club, su chi si è preso senza contendenti */
  squadre: { squadra: string; testo: string }[];
  /** i club usciti a mani vuote, tutti insieme */
  ferme: string;
  /** una riga per ogni scambio, legata al suo id */
  scambi: { id: string; testo: string }[];
  spalla: { numero: string; didascalia: string } | null;
}

export interface SpesaChiusa { squadra: string; aste: AstaConclusa[] }

/**
 * Le aste senza contendenti raccolte per club.
 *
 * Stessa idea della pagina delle indiscrezioni: non un riepilogo per lotto,
 * ma la spesa di ciascuno. Le aste contese stanno nel loro paragrafo e non
 * tornano qui, così ogni acquisto compare una volta sola.
 */
export function perSquadra(aste: AstaConclusa[]): SpesaChiusa[] {
  const per = new Map<string, AstaConclusa[]>();
  for (const a of senzaContendenti(aste)) {
    per.set(a.vincitore, [...(per.get(a.vincitore) ?? []), a]);
  }
  return [...per.entries()]
    .map(([squadra, suoi]) => ({ squadra, aste: suoi }))
    .sort((a, b) => (b.aste.length - a.aste.length) || a.squadra.localeCompare(b.squadra));
}

/** «HAINAUT (Lecce) per 1, COULIBALY L. (Udinese) per 3 e CAMBIAGHI (Atalanta) per 1» */
function elencoAcquisti(aste: AstaConclusa[]): string {
  const nomi = aste.map((a) => `${a.giocatore} (${a.club}) per ${a.prezzo}`);
  if (nomi.length <= 1) return nomi[0] ?? '';
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`;
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
// Gli spunti: i fatti che valgono una battuta
// =====================================================================

/** Un fatto vero, già contato, che merita un commento. Vedi SpuntoMercato. */
export interface SpuntoChiusura {
  peso: number;
  frase: string;
  /** le cifre che lo spunto autorizza a scrivere */
  numeri: number[];
}

function quanti(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

/**
 * Cosa c'è da notare a sala chiusa, contato sui fatti.
 *
 * Qui gli scambi contano quanto le aste: un club che ha chiamato cinque
 * nomi e fatto due scambi in due giornate è la notizia della pagina, e
 * senza qualcuno che gliela metta davanti il modello si limiterebbe a
 * elencare chi ha preso chi.
 */
export function spuntiDellaChiusura(r: RichiestaChiusura): SpuntoChiusura[] {
  const spunti: SpuntoChiusura[] = [];
  if (!r.aste.length) return spunti;

  const per = new Map<string, AstaConclusa[]>();
  for (const a of r.aste) per.set(a.vincitore, [...(per.get(a.vincitore) ?? []), a]);

  const scambiDi = new Map<string, number>();
  for (const s of r.scambi) {
    for (const nome of [s.squadraA, s.squadraB]) {
      scambiDi.set(nome, (scambiDi.get(nome) ?? 0) + 1);
    }
  }

  // --- chi ha fatto la spesa grossa, fra asta e scambi
  for (const [squadra, suoi] of per) {
    const scambi = scambiDi.get(squadra) ?? 0;
    const mosse = suoi.length + scambi;
    if (mosse >= 4) {
      spunti.push({
        peso: 5,
        frase: `${squadra} ha chiuso la finestra con ${quanti(suoi.length, 'acquisto', 'acquisti')} all'asta e ${quanti(scambi, 'scambio', 'scambi')}: ${mosse} movimenti in tutto.`,
        numeri: [suoi.length, scambi, mosse],
      });
    } else if (suoi.length >= 3) {
      spunti.push({
        peso: 4,
        frase: `${squadra} si è portato a casa ${quanti(suoi.length, 'giocatore', 'giocatori')} su ${r.aste.length} assegnati.`,
        numeri: [suoi.length, r.aste.length],
      });
    }
  }

  // --- chi ha speso di più
  const spesa = [...per.entries()]
    .map(([squadra, suoi]) => ({ squadra, totale: suoi.reduce((n, a) => n + a.prezzo, 0) }))
    .sort((a, b) => b.totale - a.totale);
  if (spesa.length >= 2 && spesa[0].totale >= spesa[1].totale * 2) {
    spunti.push({
      peso: 4,
      frase: `${spesa[0].squadra} ha speso ${spesa[0].totale}, più del doppio di chiunque altro.`,
      numeri: [spesa[0].totale],
    });
  }

  // --- il colpo grosso, e quanto è stato pagato sopra il suo valore
  const caro = r.aste.slice().sort((a, b) => b.prezzo - a.prezzo)[0];
  if (caro && caro.prezzo >= caro.quotazione * 2 && caro.quotazione > 0) {
    spunti.push({
      peso: 5,
      frase: `${caro.giocatore} è costato ${caro.prezzo} a fronte di una valutazione di ${caro.quotazione}: se l'è preso ${caro.vincitore}.`,
      numeri: [caro.prezzo, caro.quotazione],
    });
  }

  // --- chi ha perso tutti i duelli in cui è entrato
  const battute = new Map<string, number>();
  const vinti = new Map<string, number>();
  for (const a of contese(r.aste)) {
    vinti.set(a.vincitore, (vinti.get(a.vincitore) ?? 0) + 1);
    for (const b of a.battute) battute.set(b, (battute.get(b) ?? 0) + 1);
  }
  for (const [squadra, perse] of battute) {
    if (perse >= 2 && !vinti.has(squadra)) {
      spunti.push({
        peso: 5,
        frase: `${squadra} è entrato in ${quanti(perse, 'duello', 'duelli')} e li ha persi tutti.`,
        numeri: [perse],
      });
    }
  }
  for (const [squadra, presi] of vinti) {
    if (presi >= 2 && !battute.has(squadra)) {
      spunti.push({
        peso: 4,
        frase: `${squadra} ha vinto ${quanti(presi, 'duello', 'duelli')} su ${presi}: non ha mollato un colpo.`,
        numeri: [presi],
      });
    }
  }

  // --- quanti sono passati al prezzo più basso
  const minimo = Math.min(...r.aste.map((a) => a.prezzo));
  const allaBase = r.aste.filter((a) => a.prezzo === minimo);
  if (allaBase.length >= 3) {
    spunti.push({
      peso: 3,
      frase: `${quanti(allaBase.length, 'giocatore è passato', 'giocatori sono passati')} a ${minimo}, senza che nessuno alzasse la mano.`,
      numeri: [allaBase.length, minimo],
    });
  }

  // --- chi è uscito a mani vuote
  if (r.fermi.length >= 2) {
    spunti.push({
      peso: r.fermi.length >= 4 ? 4 : 2,
      frase: `${quanti(r.fermi.length, 'club è uscito', 'club sono usciti')} dalla sala senza niente in mano.`,
      numeri: [r.fermi.length],
    });
  }

  return spunti.sort((a, b) => (b.peso - a.peso) || a.frase.localeCompare(b.frase));
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
  const altre = r.aste.filter((a) => a.lottoId !== ap?.lottoId);
  const duelli = contese(altre);
  const gruppi = perSquadra(altre);
  const spunti = spuntiDellaChiusura(r);
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
4. Non inventare risultati, voti o partite: qui si parla solo di mercato.
5. **Non scrivere mai che un club ha dovuto privarsi di qualcuno, rinunciare a un giocatore o fare spazio.** Chi prende qualcuno lascia andare qualcun altro: è sottinteso, e ripeterlo a ogni paragrafo rende la pagina tutta uguale.
6. Ogni paragrafo comincia in modo diverso dagli altri: cambia il verbo, l'ordine, l'attacco.${
  r.paroleVietate.length ? `\n5. Parole vietate: ${r.paroleVietate.join(', ')}.` : ''}

## L'asta di apertura — la più pregiata fra quelle contese
${ap ? rigaAsta(ap) : 'nessuna asta conclusa'}

## Le altre aste contese — vanno tutte in UN paragrafo solo
${duelli.map(rigaAsta).join('\n\n') || 'nessun altro duello'}

## Chi è passato senza opposizione, club per club — un paragrafo per club
Su questi nomi non si è presentato nessun altro. Racconta la spesa di
ciascuno: che sessione ha fatto, cosa si è portato a casa.
${gruppi.map((g) => `### ${g.squadra}\nsi è preso: ${elencoAcquisti(g.aste)}`).join('\n\n') || 'nessuno'}

## I club usciti a mani vuote — tutti in UN paragrafo solo
${r.fermi.length ? r.fermi.join(', ') : 'nessuno: hanno preso tutti qualcuno'}

## Sbizzarrisciti, ma sui fatti
Qui sotto trovi degli **spunti**: fatti già contati, veri, che valgono un
commento. Usane almeno uno o due per dare un taglio alla pagina invece di
limitarti a elencare chi ha preso chi. Su uno spunto puoi ironizzare,
esagerare il tono, tirarci fuori un'immagine — «sembra di stare al mercato
con gli sconti», «ha fatto la spesa della settimana» — purché il fatto
sotto resti quello che ti ho dato.

Quello che **non** puoi fare è inventarne di nuovi: niente confronti con le
sessioni passate, niente classifiche, niente cifre che non trovi qui
dentro, niente motivazioni attribuite a qualcuno che nessuno ti ha detto.

## Gli spunti — i fatti che valgono una battuta
${spunti.map((x) => `- [peso ${x.peso}] ${x.frase}`).join('\n') || '- nessuno: racconta i fatti senza forzare la battuta'}

## Gli scambi fra allenatori in questa finestra
${r.scambi.map(rigaScambio).join('\n\n') || 'nessuno'}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice:

{
  "titolo": "il titolo dell'apertura, al massimo 44 caratteri: il giocatore e chi l'ha preso",
  "gancio": "la seconda riga, al massimo 30 caratteri: il prezzo o chi è rimasto a bocca asciutta",
  "cappello": "il pezzo dell'apertura: fra ${cap.min} e ${cap.max} parole, due o tre frasi",
  "contesi": "${duelli.length ? `un paragrafo solo su tutte le altre aste contese (${duelli.map((a) => a.giocatore).join(', ')}), al massimo 320 caratteri` : 'stringa vuota: non ci sono altre aste contese'}",
  "squadre": [${gruppi.map((g) => `{ "squadra": "${g.squadra}", "testo": "cosa si è portato a casa, coi nomi e i prezzi, al massimo 220 caratteri" }`).join(', ') || ''}],
  "ferme": "${r.fermi.length ? 'un paragrafo solo sui club rimasti a mani vuote, al massimo 200 caratteri' : 'stringa vuota: hanno preso tutti qualcuno'}",
  "scambi": [${r.scambi.map((s) => `{ "id": "${s.id}", "testo": "una riga sullo scambio fra ${s.squadraA} e ${s.squadraB}, al massimo 170 caratteri" }`).join(', ') || ''}],
  "spalla": { "numero": "UN numero solo fra quelli che ti ho dato, in cifre", "didascalia": "cosa significa, al massimo 110 caratteri" }
}

L'array "squadre" deve contenere tutti e ${gruppi.length} i club qui sopra, col nome scritto **esattamente** com'è scritto qui. L'array "scambi" deve contenere tutti e ${r.scambi.length} gli scambi, con gli id esatti. Ogni acquisto compare una volta sola in tutta la pagina.${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''}`;
}

// =====================================================================
// La lettura e la verifica
// =====================================================================

export function daJsonChiusura(grezzo: unknown): TestiChiusura {
  const p = (grezzo ?? {}) as Record<string, unknown>;
  const squadre = Array.isArray(p.squadre) ? p.squadre : [];
  const scambi = Array.isArray(p.scambi) ? p.scambi : [];
  const spalla = p.spalla as { numero?: unknown; didascalia?: unknown } | null | undefined;

  return {
    titolo: String(p.titolo ?? '').trim(),
    gancio: String(p.gancio ?? '').trim(),
    cappello: String(p.cappello ?? '').trim(),
    contesi: String(p.contesi ?? '').trim(),
    squadre: squadre.map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      return { squadra: String(x.squadra ?? '').trim(), testo: String(x.testo ?? '').trim() };
    }),
    ferme: String(p.ferme ?? '').trim(),
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
  /** il modello non ha risposto, o ha risposto con niente: vedi EsitoPrima.gravi */
  gravi: string[];
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
    contese(r.aste).length, senzaContendenti(r.aste).length, r.fermi.length,
  ]);
  // le cifre degli spunti: gliele abbiamo date noi
  for (const s of spuntiDellaChiusura(r)) for (const v of s.numeri) n.add(v);
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
  const gravi: string[] = [];
  const grave = (m: string) => { problemi.push(m); gravi.push(m); };
  const tutto = [t.titolo, t.gancio, t.cappello, t.contesi,
    ...t.squadre.map((b) => b.testo), t.ferme,
    ...t.scambi.map((s) => s.testo), t.spalla?.didascalia ?? ''].join('\n');

  if (!t.titolo) grave('manca il titolo');
  if (!t.cappello) grave('manca il cappello');
  if (t.titolo.length > 44) problemi.push(`il titolo è di ${t.titolo.length} caratteri invece di 44`);
  if (t.gancio.length > 30) problemi.push(`il gancio è di ${t.gancio.length} caratteri invece di 30`);
  if (t.contesi.length > 320) problemi.push(`il paragrafo sulle aste contese è di ${t.contesi.length} caratteri invece di 320`);
  if (t.ferme.length > 200) problemi.push(`il paragrafo sui club a mani vuote è di ${t.ferme.length} caratteri invece di 200`);

  const parole = t.cappello.trim().split(/\s+/).filter(Boolean).length;
  const cap = paroleDelCappello(r.disposizione);
  if (t.cappello && (parole < cap.min || parole > cap.max)) {
    problemi.push(`il cappello è di ${parole} parole invece che fra ${cap.min} e ${cap.max}`);
  }

  // le sezioni devono esserci tutte, e con le chiavi giuste
  const altre = r.aste.filter((a) => a.lottoId !== r.apertura);
  if (contese(altre).length && !t.contesi) problemi.push('manca il paragrafo sulle altre aste contese');
  if (r.fermi.length && !t.ferme) problemi.push('manca il paragrafo sui club a mani vuote');

  const attese = new Set(perSquadra(altre).map((g) => g.squadra));
  const arrivate = new Set(t.squadre.map((x) => x.squadra));
  for (const nome of attese) if (!arrivate.has(nome)) problemi.push(`manca il paragrafo di ${nome}`);
  for (const x of t.squadre) {
    if (!attese.has(x.squadra)) problemi.push(`c'è un paragrafo di ${x.squadra}, che non ha preso nessuno senza contendenti`);
    if (x.testo.length > 220) problemi.push(`il paragrafo di ${x.squadra} è di ${x.testo.length} caratteri invece di 220`);
  }

  // «ha dovuto privarsi di un centrocampista» e tutta la famiglia: è
  // sottinteso che chi prende qualcuno lasci andare qualcun altro
  const sottinteso = tutto.match(
    /\b(?:privars\w+|rinunciare a un\w*|sacrificare un\w*|fare spazio|liberare un posto|dovuto cedere)\b/gi,
  );
  if (sottinteso?.length) {
    problemi.push(`dice che qualcuno è dovuto uscire («${sottinteso[0]}»): è sottinteso, non si scrive`);
  }

  // due paragrafi che cominciano uguale
  const attacchi = new Map<string, string>();
  for (const x of [{ squadra: 'le aste contese', testo: t.contesi }, ...t.squadre,
    { squadra: 'i club a mani vuote', testo: t.ferme }]) {
    const attacco = x.testo.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
    if (!attacco) continue;
    const gia = attacchi.get(attacco);
    if (gia) problemi.push(`${x.squadra} e ${gia} cominciano allo stesso modo: «${attacco}»`);
    else attacchi.set(attacco, x.squadra);
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

  return { ok: problemi.length === 0, problemi, gravi, inventati };
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
  const altre = r.aste.filter((a) => a.lottoId !== ap?.lottoId);
  const duelli = contese(altre);
  const gruppi = perSquadra(altre);

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
    contesi: duelli.length
      ? duelli.map((a) => `Su ${a.giocatore} l'ha spuntata ${a.vincitore} per ${a.prezzo}, davanti a ${a.battute.join(' e ')}.`).join(' ')
      : '',
    squadre: gruppi.map((g) => ({
      squadra: g.squadra,
      testo: `${g.squadra} si è preso ${elencoAcquisti(g.aste)}.`,
    })),
    ferme: r.fermi.length ? `A mani vuote ${r.fermi.join(', ')}.` : '',
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
  const altre = r.aste.filter((x) => x.lottoId !== ap?.lottoId);
  const testoDi = new Map(t.squadre.map((x) => [x.squadra, x.testo]));

  /*
   * Tre tipi di voce, nell'ordine in cui si leggono: i duelli, la spesa di
   * ogni club, e chi è uscito a mani vuote. I titoletti li scriviamo noi.
   */
  const voci = [
    ...(contese(altre).length ? [{ titolo: 'Le altre aste', testo: t.contesi }] : []),
    ...perSquadra(altre).map((g) => ({ titolo: g.squadra, testo: testoDi.get(g.squadra) ?? '' })),
    ...(r.fermi.length ? [{ titolo: 'A mani vuote', testo: t.ferme }] : []),
  ];

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
    titoloAltre: 'Squadra per squadra',
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
