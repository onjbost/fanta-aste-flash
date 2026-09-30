/**
 * La Gazzetta — l'edizione fantamercato, le indiscrezioni.
 *
 * Esce a chiamate chiuse, prima dell'asta, e non parla di fantacalcio: parla
 * di mercato come ne parlano i giornali veri. «Il club ha avviato i
 * contatti», «si inserisce nella corsa», «l'entourage prende tempo». I
 * crediti, le quotazioni e i fantapunti restano fuori — chi legge deve
 * riconoscere un lancio di mercato, non un tabellone.
 *
 * Da questo discendono due vincoli che non sono di stile.
 *
 * **Il pezzo deve dichiararsi indiscrezione.** Scritto col registro di un
 * lancio, «l'NTONIA prende Zhegrova» viene creduto. L'occhiello dice
 * INDISCREZIONI e i verbi stanno al condizionale: è così che un giornale
 * distingue una voce da una notizia, e qui serve davvero perché l'asta non
 * si è ancora giocata.
 *
 * **Due cose il modello non le vede proprio: i budget dichiarati e i nomi
 * dei giocatori messi in palio come svincolo.** Non è pudore, è che
 * pubblicarli rovina l'asta che deve ancora avvenire — sapere fin dove può
 * spingersi l'avversario, o chi è disposto a sacrificare, vale la sessione.
 * Non si chiede al modello di tacerli: non glieli si dà, e finiscono invece
 * nella lista dei nomi vietati, così se ne compare uno il pezzo viene
 * bocciato. Il ruolo sì («dovrà privarsi di un centrocampista»): dice
 * abbastanza per far parlare il gruppo senza scoprire le carte.
 */

import { numeriInventati } from '../redazione/verifica';
import { nominato } from '../nomi';
import { tono } from '../redazione/toni';
import {
  dataEstesa, paroleDelCappello,
  type DatiPrima, type Disposizione, type FotoPrima,
} from './prima';

// =====================================================================
// Il materiale
// =====================================================================

/** Un club in corsa su un giocatore. */
export interface ClubInCorsa {
  squadra: string;
  /** chi ha chiamato per primo: è la differenza fra «bussa» e «si inserisce» */
  chiamante: boolean;
  /**
   * Il ruolo del giocatore che dovrebbe uscire per far posto — non il nome.
   * Il nome è esattamente quello che non deve finire in pagina.
   */
  ruoloInUscita: 'P' | 'D' | 'C' | 'A' | null;
}

/** Una trattativa: un giocatore chiamato, e chi se lo contende. */
export interface Trattativa {
  /** l'identificativo del lotto, per far tornare i blocchi ai loro posti */
  lottoId: string;
  giocatore: string;
  ruolo: 'P' | 'D' | 'C' | 'A';
  /** la squadra di Serie A: è il club vero, quello che il pezzo nomina */
  club: string;
  inCorsa: ClubInCorsa[];
}

export interface RichiestaMercato {
  tono: number;
  /** il numero della sessione d'asta */
  sessione: number;
  /** quando apre la sala, già scritto per esteso */
  quandoSiGioca: string;
  disposizione: Disposizione;
  trattative: Trattativa[];
  /** il lotto che va in apertura */
  apertura: string;
  /** i club che non hanno avviato nessuna trattativa: il silenzio è notizia */
  fermi: string[];
  paroleVietate: string[];
  /**
   * I nomi che in pagina non possono comparire: gli svincolandi, e chiunque
   * non sia in trattativa. Non stanno nel prompt — stanno qui.
   */
  nomiVietati: string[];
  correzioni?: string[];
}

export interface TestiMercato {
  titolo: string;
  gancio: string;
  cappello: string;
  /** un paragrafo solo su tutti i duelli, non uno per lotto */
  contesi: string;
  /** un paragrafo per squadra, sulle sue trattative in esclusiva */
  squadre: { squadra: string; testo: string }[];
  /** le squadre che non si sono mosse, tutte insieme */
  ferme: string;
  spalla: { numero: string; didascalia: string } | null;
}

/** Le trattative su cui si sono mossi in due o più: i duelli. */
export function contese(trattative: Trattativa[]): Trattativa[] {
  return trattative.filter((t) => t.inCorsa.length >= 2);
}

/** Le trattative su cui, per ora, si è mosso uno solo. */
export function inEsclusiva(trattative: Trattativa[]): Trattativa[] {
  return trattative.filter((t) => t.inCorsa.length <= 1);
}

export interface SpesaDiSquadra { squadra: string; trattative: Trattativa[] }

/**
 * Le trattative in esclusiva raccolte per squadra.
 *
 * È il cuore della pagina nuova: non un riepilogo per lotto — otto paragrafi
 * che dicono tutti la stessa cosa — ma la spesa di ciascuno messa in fila,
 * «il Joga Benito è andato al supermercato e vuole Hainaut, Coulibaly e
 * Cambiaghi». I duelli stanno nel loro paragrafo e non tornano qui: ogni
 * trattativa compare una volta sola in tutta la pagina.
 *
 * L'ordine è chi ne ha di più, poi il nome: deterministico, così due
 * generazioni della stessa sessione impaginano uguale.
 */
export function perSquadra(trattative: Trattativa[]): SpesaDiSquadra[] {
  const per = new Map<string, Trattativa[]>();
  for (const t of inEsclusiva(trattative)) {
    const chi = chiamante(t)?.squadra;
    if (!chi) continue;
    per.set(chi, [...(per.get(chi) ?? []), t]);
  }
  return [...per.entries()]
    .map(([squadra, suoi]) => ({ squadra, trattative: suoi }))
    .sort((a, b) => (b.trattative.length - a.trattative.length)
      || a.squadra.localeCompare(b.squadra));
}

export const RIGHE_BLOCCO = 3;
export const LARGHEZZA_BLOCCO = 360;

/**
 * Quante licenze di colore sono ammesse.
 *
 * La versione scelta è quella romanzata: cene, telefonate, entourage. Il
 * rischio è che il pezzo diventi tutto inventato e nessuno se ne accorga,
 * quindi il colore si può usare **solo dentro una formula che lo dichiara**
 * — «si dice che», «nell'ambiente», «fonti vicine» — e le formule si
 * contano. Tre per pagina: abbastanza per il tono, poche perché restino
 * riconoscibili.
 */
export const MASSIME_LICENZE = 3;

export const FORMULE_DI_COLORE = [
  'si dice che', 'si vocifera', 'nell\'ambiente', 'fonti vicine',
  'secondo indiscrezioni', 'trapela', 'si mormora', 'pare che',
];

/** Quante formule di colore usa questo testo. */
export function licenzeUsate(testo: string): number {
  const t = testo.toLowerCase();
  return FORMULE_DI_COLORE.reduce(
    (n, f) => n + (t.split(f.toLowerCase()).length - 1), 0,
  );
}

/**
 * «giovedì 1 ottobre alle 21.30», come lo direbbe un lancio di agenzia.
 *
 * L'ora è quella italiana, non quella del database. Il database tiene gli
 * orari in UTC e la sessione 1 vera è salvata come 19:30: scritta così nel
 * gruppo darebbe l'appuntamento sbagliato di due ore — o di una, d'inverno.
 *
 * Anche il giorno della settimana viene dal fuso di Roma e non dal server:
 * un'asta alle 23.30 di lunedì italiane è ancora lunedì solo se si guarda
 * l'orologio giusto.
 */
export function quandoApreLaSala(iso: string): string {
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));

  const p = (t: string) => parti.find((x) => x.type === t)?.value ?? '';
  // `day: 'numeric'` accanto a un campo a due cifre viene impaginato a due
  // cifre lo stesso: «01 ottobre» non lo scrive nessuno
  const giorno = p('day').replace(/^0/, '');
  return `${p('weekday')} ${giorno} ${p('month')} alle ${p('hour')}.${p('minute')}`;
}

// =====================================================================
// Cosa apre la pagina
// =====================================================================

const NOME_RUOLO: Record<'P' | 'D' | 'C' | 'A', string> = {
  P: 'portiere', D: 'difensore', C: 'centrocampista', A: 'attaccante',
};

// il plurale scritto, non il singolare con una «i» attaccata: in italiano
// non funziona per nessuno dei quattro ruoli
const RUOLO_PLURALE: Record<'P' | 'D' | 'C' | 'A', string> = {
  P: 'portieri', D: 'difensori', C: 'centrocampisti', A: 'attaccanti',
};

export function ruoloPerEsteso(r: 'P' | 'D' | 'C' | 'A' | null): string {
  return r ? NOME_RUOLO[r] : 'giocatore';
}

/**
 * Quale trattativa apre la pagina.
 *
 * **Un duello, prima di tutto.** Due club sullo stesso nome è una notizia
 * anche su un giocatore da poco: è la storia che il gruppo commenta. Una
 * soglia fissa sulla quotazione non funzionerebbe — l'asta flash pesca fra
 * gli svincolati, cioè fra quelli che a settembre nessuno ha voluto, e nella
 * prima sessione vera della lega il chiamato più caro valeva 8. Con una
 * soglia a 15 la prima pagina sarebbe uscita senza apertura.
 *
 * A parità di contendenti vince chi ne ha di più, poi l'ordine del lotto,
 * che è stabile e non dipende dal caso.
 */
export function trattativaDiApertura(trattative: Trattativa[]): string | null {
  if (!trattative.length) return null;
  return trattative.slice().sort((a, b) => {
    const d = b.inCorsa.length - a.inCorsa.length;
    if (d !== 0) return d;
    return a.lottoId.localeCompare(b.lottoId);
  })[0].lottoId;
}

/** «Zhegrova (Juventus)»: il titoletto del blocco, scritto da noi. */
export function titoloTrattativa(t: Trattativa): string {
  return `${t.giocatore} (${t.club})`;
}

/** Chi ha bussato per primo. */
export function chiamante(t: Trattativa): ClubInCorsa | null {
  return t.inCorsa.find((c) => c.chiamante) ?? t.inCorsa[0] ?? null;
}

export function rivali(t: Trattativa): ClubInCorsa[] {
  return t.inCorsa.filter((c) => !c.chiamante);
}

// =====================================================================
// Gli spunti: i fatti che valgono una battuta
// =====================================================================

/**
 * Uno spunto: un fatto vero, già contato, che merita un commento.
 *
 * Serve a far scrivere una pagina diversa ogni volta senza inventare
 * niente. Un modello che riceve otto trattative in fila scrive otto volte
 * «il club avrebbe avviato i contatti», perché non ha nessun motivo per
 * dire altro: non è pigrizia, è che il materiale non contiene un taglio.
 * Gli spunti il taglio glielo danno — «cinque nomi su otto li ha chiamati
 * lo stesso club» — e restano fatti perché li conta il codice, non lui.
 *
 * `numeri` non è decorazione: sono le cifre che lo spunto autorizza a
 * scrivere, e finiscono fra quelle lecite. Senza, la verifica boccerebbe
 * come inventato proprio il numero che gli abbiamo dato noi.
 */
export interface SpuntoMercato {
  /** 1-5: quanto vale come notizia */
  peso: number;
  frase: string;
  numeri: number[];
}

function quanti(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

/**
 * Cosa c'è da notare in questa finestra, contato sui fatti.
 *
 * Tutti gli spunti sono derivati dalle trattative e dai club fermi: niente
 * qui dentro viene da fuori. L'ordine è per peso e poi alfabetico sulla
 * frase, così la stessa sessione dà sempre gli stessi spunti nello stesso
 * ordine — la varietà viene da quale il modello sceglie, non dal caso.
 */
export function spuntiDelMercato(r: RichiestaMercato): SpuntoMercato[] {
  const spunti: SpuntoMercato[] = [];
  const totale = r.trattative.length;
  if (!totale) return spunti;

  // quante volte ogni club si è mosso, e come
  const chiamate = new Map<string, Trattativa[]>();
  const inserimenti = new Map<string, Trattativa[]>();
  for (const t of r.trattative) {
    for (const c of t.inCorsa) {
      const dove = c.chiamante ? chiamate : inserimenti;
      dove.set(c.squadra, [...(dove.get(c.squadra) ?? []), t]);
    }
  }

  // --- chi ha riempito il carrello
  for (const [squadra, suoi] of chiamate) {
    // tre chiamate sono una spesa grossa di per sé; due lo sono solo se la
    // finestra è larga — «ha bussato a 1 porta su 1» non è una notizia
    if (suoi.length >= 3 || (suoi.length >= 2 && totale >= 4 && suoi.length * 2 >= totale)) {
      spunti.push({
        peso: suoi.length >= 4 ? 5 : 4,
        frase: `${squadra} ha bussato a ${quanti(suoi.length, 'porta', 'porte')} su ${totale}: è la sessione di uno che ha fatto la spesa grossa.`,
        numeri: [suoi.length, totale],
      });
    }
  }

  // --- chi cerca sempre lo stesso ruolo
  for (const [squadra, suoi] of chiamate) {
    const ruoli = new Set(suoi.map((t) => t.ruolo));
    if (suoi.length >= 2 && ruoli.size === 1) {
      spunti.push({
        peso: 3,
        frase: `${squadra} si è mosso solo su ${RUOLO_PLURALE[suoi[0].ruolo]}: ${quanti(suoi.length, 'nome', 'nomi')} su ${suoi.length}, nessun altro reparto.`,
        numeri: [suoi.length],
      });
    }
  }

  // --- chi non chiama e si limita a inserirsi
  for (const [squadra, suoi] of inserimenti) {
    if (!chiamate.has(squadra) && suoi.length >= 1) {
      spunti.push({
        peso: 3,
        frase: `${squadra} non ha aperto nessuna trattativa: si è inserito su ${quanti(suoi.length, 'nome', 'nomi')} che aveva trovato qualcun altro.`,
        numeri: [suoi.length],
      });
    }
  }

  // --- due club che si ritrovano contro
  const duelli = contese(r.trattative);
  const incroci = new Map<string, { squadre: [string, string]; volte: number }>();
  for (const t of duelli) {
    const nomi = t.inCorsa.map((c) => c.squadra).sort();
    for (let i = 0; i < nomi.length; i++) {
      for (let j = i + 1; j < nomi.length; j++) {
        const chiave = `${nomi[i]}|${nomi[j]}`;
        const gia = incroci.get(chiave);
        incroci.set(chiave, { squadre: [nomi[i], nomi[j]], volte: (gia?.volte ?? 0) + 1 });
      }
    }
  }
  for (const { squadre, volte } of incroci.values()) {
    if (volte >= 2) {
      spunti.push({
        peso: 5,
        frase: `${squadre[0]} e ${squadre[1]} si sono trovate contro su ${quanti(volte, 'nome', 'nomi')}: non è un caso, è una questione personale.`,
        numeri: [volte],
      });
    }
  }

  // --- il nome che ha scatenato più gente
  const piuConteso = duelli.slice().sort((a, b) => b.inCorsa.length - a.inCorsa.length)[0];
  if (piuConteso && piuConteso.inCorsa.length >= 3) {
    spunti.push({
      peso: 4,
      frase: `Su ${piuConteso.giocatore} si sono mossi in ${piuConteso.inCorsa.length}: è il nome che ha fatto alzare più teste.`,
      numeri: [piuConteso.inCorsa.length],
    });
  }

  // --- il silenzio, che è una notizia
  if (r.fermi.length >= 2) {
    spunti.push({
      peso: r.fermi.length >= 4 ? 4 : 2,
      frase: `${quanti(r.fermi.length, 'club è rimasto', 'club sono rimasti')} a guardare senza muovere un dito.`,
      numeri: [r.fermi.length],
    });
  }

  // --- una finestra tutta in esclusiva, o tutta duelli
  if (totale >= 3 && duelli.length === 0) {
    spunti.push({
      peso: 3,
      frase: `Nessuno si è pestato i piedi: ${quanti(totale, 'trattativa', 'trattative')}, e ognuno per conto suo.`,
      numeri: [totale],
    });
  } else if (totale >= 3 && duelli.length === totale) {
    spunti.push({
      peso: 4,
      frase: `Non c'è un nome libero: su tutte e ${totale} le trattative c'è più di un club.`,
      numeri: [totale],
    });
  }

  return spunti.sort((a, b) => (b.peso - a.peso) || a.frase.localeCompare(b.frase));
}

// =====================================================================
// Il prompt
// =====================================================================

/**
 * Una trattativa come la legge il modello.
 *
 * Del giocatore che dovrebbe uscire non c'è più traccia, nemmeno il ruolo.
 * Era l'informazione che generava «dovrà privarsi di un centrocampista» in
 * fondo a ogni paragrafo, otto volte su otto: una frase che non aggiunge
 * niente, perché in questa lega chi chiama qualcuno svincola qualcun altro
 * per definizione, e che schiacciava tutta la pagina sullo stesso stampo.
 */
function riga(t: Trattativa): string {
  const primo = chiamante(t);
  const altri = rivali(t);
  const righe = [
    `### ${t.giocatore}, ${NOME_RUOLO[t.ruolo]} del ${t.club}`,
    primo ? `ha bussato per primo: ${primo.squadra}` : 'nessuno',
  ];
  if (altri.length) righe.push(`si sono inseriti: ${altri.map((c) => c.squadra).join('; ')}`);
  return righe.join('\n');
}

/** «Hainaut (Lecce), Coulibaly L. (Udinese) e Cambiaghi (Atalanta)» */
function elencoGiocatori(trattative: Trattativa[]): string {
  const nomi = trattative.map((t) => `${t.giocatore} (${t.club})`);
  if (nomi.length <= 1) return nomi[0] ?? '';
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`;
}

export function costruisciPromptMercato(r: RichiestaMercato): string {
  const ap = r.trattative.find((t) => t.lottoId === r.apertura) ?? r.trattative[0];
  const altre = r.trattative.filter((t) => t.lottoId !== ap?.lottoId);
  const duelli = contese(altre);
  const gruppi = perSquadra(altre);
  const spunti = spuntiDelMercato(r);
  const cap = paroleDelCappello(r.disposizione);

  return `Sei il giornalista di mercato della "Gazzetta della Mansarda". Le chiamate per la sessione ${r.sessione} d'asta sono chiuse e l'asta non si è ancora giocata: scrivi la prima pagina delle indiscrezioni.

## Tono
${r.tono}/5 — ${tono(r.tono)}.
Si punzecchia il **club** e la sua dirigenza, mai la persona. Anche un lancio
di mercato può essere velenoso: «il club che non si muove da tre sessioni»,
«l'ennesimo sondaggio andato a vuoto».

## Il registro: mercato vero, non fantacalcio
Scrivi come si scrive di calciomercato sui giornali. Le squadre sono **club**, chi le guida sono **dirigenti**, i giocatori hanno un **entourage**. Si «avviano i contatti», ci si «inserisce nella corsa», si «prova il sorpasso», si «sonda il terreno».

Non nominare mai crediti, quotazioni, fantapunti, aste, lotti, svincoli, rose o fantacalcio. Chi legge deve avere davanti la pagina di mercato di un quotidiano sportivo.

## Sono indiscrezioni, e si deve vedere
L'asta si gioca ${r.quandoSiGioca}: niente è ancora successo. Usa il condizionale — «si sarebbe mosso», «avrebbe fatto sapere» — e non dare mai per fatto un acquisto.

## Il colore
Puoi aggiungere dettagli di colore che non ti ho dato — una cena, una telefonata, l'umore di una dirigenza — **ma solo dentro una di queste formule**, che dicono al lettore che è una voce: ${FORMULE_DI_COLORE.map((f) => `«${f}»`).join(', ')}.
Al massimo ${MASSIME_LICENZE} in tutta la pagina. Tutto il resto dev'essere vero.

## Sbizzarrisciti, ma sui fatti
Qui sotto trovi degli **spunti**: fatti già contati, veri, che valgono un
commento. Usane almeno uno o due per dare un taglio alla pagina invece di
limitarti a riferire chi ha chiamato chi. Su uno spunto puoi ironizzare,
esagerare il tono, tirarci fuori un'immagine — «sembra di stare al mercato
con gli sconti», «ha fatto la spesa della settimana» — purché il fatto
sotto resti quello che ti ho dato.

Quello che **non** puoi fare è inventarne di nuovi: niente confronti con le
sessioni passate, niente classifiche, niente cifre che non trovi qui
dentro, niente motivazioni attribuite a qualcuno («vuole tornare in alto»)
che nessuno ti ha detto.

## Regole assolute
1. Non scrivere MAI un numero che non ti ho dato qui sotto.
2. **Non nominare nessun giocatore che non sia uno di quelli in trattativa qui sotto.** Nessun altro nome, per nessun motivo: né chi potrebbe uscire, né chi gioca in quelle squadre.
3. **Non scrivere mai che un club dovrà privarsi di qualcuno, rinunciare a un giocatore, fare spazio o liberare un posto.** In questa lega chi prende qualcuno lascia andare qualcun altro: è sottinteso, e ripeterlo a ogni paragrafo è la cosa che rende la pagina tutta uguale. Non nominare nemmeno il ruolo di chi uscirebbe.
4. Non inventare risultati, voti o partite: qui si parla solo di mercato.
5. Ogni paragrafo comincia in modo diverso dagli altri: cambia il verbo, l'ordine, l'attacco. Se due paragrafi cominciano con la stessa formula, riscrivili.${
  r.paroleVietate.length ? `\n5. Parole vietate: ${r.paroleVietate.join(', ')}.` : ''}

## La trattativa di apertura
${ap ? riga(ap) : 'nessuna trattativa aperta'}

## Gli altri duelli — vanno tutti in UN paragrafo solo
${duelli.map(riga).join('\n\n') || 'nessun altro duello'}

## Le trattative in esclusiva, club per club — un paragrafo per club
Su questi nomi, per ora, si è mosso un club solo. Racconta la spesa di
ciascuno: che tipo di sessione sta facendo, cosa dice del suo momento.
${gruppi.map((g) => `### ${g.squadra}\nvuole: ${elencoGiocatori(g.trattative)}`).join('\n\n') || 'nessuna'}

## I club che non si sono mossi — tutti in UN paragrafo solo
${r.fermi.length ? r.fermi.join(', ') : 'nessuno: si sono mossi tutti'}

## Gli spunti — i fatti che valgono una battuta
${spunti.map((x) => `- [peso ${x.peso}] ${x.frase}`).join('\n') || '- nessuno: racconta i fatti senza forzare la battuta'}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice:

{
  "titolo": "il titolo dell'apertura, al massimo 44 caratteri: il nome del giocatore e il fatto",
  "gancio": "la seconda riga, al massimo 30 caratteri: chi spinge e chi si oppone",
  "cappello": "il pezzo dell'apertura: fra ${cap.min} e ${cap.max} parole, due o tre frasi",
  "contesi": "${duelli.length ? `un paragrafo solo su tutti gli altri duelli (${duelli.map((t) => t.giocatore).join(', ')}), al massimo 320 caratteri` : 'stringa vuota: non ci sono altri duelli'}",
  "squadre": [${gruppi.map((g) => `{ "squadra": "${g.squadra}", "testo": "cosa sta facendo sul mercato, coi nomi che vuole, al massimo 220 caratteri" }`).join(', ') || ''}],
  "ferme": "${r.fermi.length ? 'un paragrafo solo sui club fermi, al massimo 200 caratteri' : 'stringa vuota: si sono mossi tutti'}",
  "spalla": { "numero": "UN numero solo fra quelli che ti ho dato, in cifre", "didascalia": "cosa significa, al massimo 110 caratteri" }
}

L'array "squadre" deve contenere tutti e ${gruppi.length} i club qui sopra, col nome scritto **esattamente** com'è scritto qui. Ogni trattativa compare una volta sola in tutta la pagina: quelle dei duelli stanno in "contesi" e non si ripetono in "squadre".${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''}`;
}

// =====================================================================
// La lettura e la verifica
// =====================================================================

export function daJsonMercato(grezzo: unknown): TestiMercato {
  const p = (grezzo ?? {}) as Record<string, unknown>;
  const squadre = Array.isArray(p.squadre) ? p.squadre : [];
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
    spalla: spalla && String(spalla.numero ?? '').trim()
      ? { numero: String(spalla.numero).trim(), didascalia: String(spalla.didascalia ?? '').trim() }
      : null,
  };
}

export interface EsitoMercato {
  ok: boolean;
  problemi: string[];
  /** il modello non ha risposto, o ha risposto con niente: vedi EsitoPrima.gravi */
  gravi: string[];
  inventati: number[];
}

/**
 * I numeri che la pagina di mercato ha il diritto di citare.
 *
 * Fra questi ci sono anche quelli della data d'apertura, perché gliel'abbiamo
 * scritta noi: «giovedì 1 ottobre alle 21.30» contiene 1 e 21.30, e in
 * italiano l'ora si scrive col punto — un controllo che non lo sapesse
 * boccerebbe ogni pezzo che dice quando si gioca, compreso il ripiego.
 */
export function numeriDelMercato(r: RichiestaMercato): Set<number> {
  const n = new Set<number>([r.sessione, r.trattative.length, r.fermi.length]);
  for (const t of r.trattative) n.add(t.inCorsa.length);
  // le cifre degli spunti: gliele abbiamo date noi, non le ha inventate
  for (const s of spuntiDelMercato(r)) for (const v of s.numeri) n.add(v);
  for (const x of r.quandoSiGioca.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const v = Number(x.replace(',', '.'));
    if (Number.isFinite(v)) n.add(v);
  }
  return n;
}

/**
 * Le parole che tradiscono il fantacalcio.
 *
 * Il registro è tutto: una riga che dice «crediti» o «quotazione» fa cadere
 * il gioco, e nessun'altra verifica se ne accorgerebbe.
 */
const DA_FANTACALCIO = [
  'credit', 'quotazion', 'fantapunt', 'fantamedia', 'asta', 'aste', 'lotto', 'lotti',
  'svincol', 'rosa', 'rose', 'fantacalcio', 'fantallenator', 'listone',
];

/**
 * Le parole del testo che **cominciano** con una di queste radici.
 *
 * L'inizio della parola non è un dettaglio di stile: cercare la radice in
 * mezzo bocciava pezzi puliti. «guastare» contiene «asta», «bastardo» pure,
 * e il primo pezzo di indiscrezioni vero è finito al ripiego proprio così —
 * il modello aveva scritto «guastare la festa» e la verifica ha letto
 * un'asta lì dentro. Le radici sono prefissi apposta (svincol → svincolati,
 * svincolando), quindi la regola giusta è «la parola comincia per», non «la
 * parola contiene».
 *
 * Torna le parole com'erano scritte, non le radici: all'admin serve sapere
 * cosa cambiare, non come le cerchiamo.
 */
export function paroleCheIniziano(testo: string, radici: string[]): string[] {
  const minuscolo = testo.toLowerCase();
  const trovate = radici.flatMap((radice) => {
    if (!radice) return [];
    const scappata = radice.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${scappata}\\p{L}*)`, 'gu');
    return [...minuscolo.matchAll(re)].map((m) => m[2]);
  });
  return [...new Set(trovate)];
}

export function verificaMercato(t: TestiMercato, r: RichiestaMercato): EsitoMercato {
  const problemi: string[] = [];
  const gravi: string[] = [];
  const grave = (m: string) => { problemi.push(m); gravi.push(m); };
  const tutto = [t.titolo, t.gancio, t.cappello, t.contesi,
    ...t.squadre.map((b) => b.testo), t.ferme, t.spalla?.didascalia ?? ''].join('\n');

  if (!t.titolo) grave('manca il titolo');
  if (!t.cappello) grave('manca il cappello');
  if (t.titolo.length > 44) problemi.push(`il titolo è di ${t.titolo.length} caratteri invece di 44`);
  if (t.gancio.length > 30) problemi.push(`il gancio è di ${t.gancio.length} caratteri invece di 30`);

  const cap = paroleDelCappello(r.disposizione);
  const parole = t.cappello.trim().split(/\s+/).filter(Boolean).length;
  if (t.cappello && (parole < cap.min || parole > cap.max)) {
    problemi.push(`il cappello ha ${parole} parole invece di ${cap.min}-${cap.max}`);
  }

  // ---- le sezioni: i duelli, un paragrafo per club, i fermi
  const altre = r.trattative.filter((x) => x.lottoId !== r.apertura);
  const duelli = contese(altre);
  const gruppi = perSquadra(altre);

  if (duelli.length && !t.contesi) problemi.push('manca il paragrafo sui duelli');
  if (t.contesi.length > 320) problemi.push(`il paragrafo sui duelli è di ${t.contesi.length} caratteri invece di 320`);
  if (r.fermi.length && !t.ferme) problemi.push('manca il paragrafo sui club fermi');
  if (t.ferme.length > 200) problemi.push(`il paragrafo sui club fermi è di ${t.ferme.length} caratteri invece di 200`);

  const attese = new Set(gruppi.map((g) => g.squadra));
  const arrivate = new Set(t.squadre.map((x) => x.squadra));
  for (const nome of attese) if (!arrivate.has(nome)) problemi.push(`manca il paragrafo di ${nome}`);
  for (const nome of arrivate) {
    if (!attese.has(nome)) problemi.push(`c'è un paragrafo di ${nome}, che non ha trattative in esclusiva`);
  }
  for (const x of t.squadre) {
    if (x.testo.length > 220) problemi.push(`il paragrafo di ${x.squadra} è di ${x.testo.length} caratteri invece di 220`);
  }

  // ---- «dovrà privarsi di un centrocampista», e tutta la famiglia
  //
  // È sottinteso che chi prende qualcuno svincoli qualcun altro: scriverlo
  // ogni volta era quello che rendeva gli otto paragrafi indistinguibili.
  const sottinteso = tutto.match(
    /\b(?:privars\w+|rinunciare a un\w*|sacrificare un\w*|fare spazio|liberare un posto|dovr[àa] cedere)\b/gi,
  );
  if (sottinteso?.length) {
    problemi.push(`dice che qualcuno deve uscire («${sottinteso[0]}»): è sottinteso, non si scrive`);
  }

  // ---- due paragrafi che cominciano uguale
  const attacchi = new Map<string, string>();
  for (const x of [{ squadra: 'i duelli', testo: t.contesi }, ...t.squadre, { squadra: 'i fermi', testo: t.ferme }]) {
    const attacco = x.testo.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
    if (!attacco) continue;
    const gia = attacchi.get(attacco);
    if (gia) problemi.push(`${x.squadra} e ${gia} cominciano allo stesso modo: «${attacco}»`);
    else attacchi.set(attacco, x.squadra);
  }

  // ---- i nomi vietati: gli svincolandi e chiunque non sia in trattativa
  for (const vietato of r.nomiVietati) {
    if (nominato(tutto, vietato)) {
      // gli svincolandi sono il segreto di questa edizione: resta
      // l'avviso più importante che l'editor possa mostrarti, ma la
      // decisione di mandarla o correggerla è tua
      problemi.push(`nomina ${vietato}, che in questa pagina non deve comparire`);
    }
  }

  // ---- il registro
  const scivoloni = paroleCheIniziano(tutto, DA_FANTACALCIO);
  if (scivoloni.length) {
    problemi.push(`usa parole da fantacalcio invece che da mercato: ${scivoloni.join(', ')}`);
  }

  // ---- il colore, contato
  const licenze = licenzeUsate(tutto);
  if (licenze > MASSIME_LICENZE) {
    problemi.push(`${licenze} formule di colore invece di ${MASSIME_LICENZE}`);
  }

  // ---- i numeri
  const ammessi = numeriDelMercato(r);
  if (t.spalla) {
    const n = Number(t.spalla.numero.replace(',', '.'));
    if (!Number.isFinite(n)) problemi.push(`il numerone «${t.spalla.numero}» non è un numero`);
    else if (!ammessi.has(n)) problemi.push(`il numerone ${n} non è fra quelli che ti ho dato`);
  }
  const inventati = numeriInventati(tutto, ammessi);
  if (inventati.length) problemi.push(`numeri che non ti ho dato: ${inventati.join(', ')}`);

  // ---- parole vietate di lega, con la stessa regola del registro: una
  // parola vietata è una parola, non una sequenza di lettere dentro un'altra
  const vietate = paroleCheIniziano(tutto, r.paroleVietate.filter(Boolean));
  if (vietate.length) problemi.push(`parole vietate usate: ${vietate.join(', ')}`);

  return { ok: problemi.length === 0, problemi, gravi, inventati };
}

// =====================================================================
// Il ripiego
// =====================================================================

/**
 * La pagina che esce quando il modello non risponde.
 *
 * Asciutta e al condizionale, come il resto: meglio un lancio scarno nel
 * gruppo che un lancio inventato, o niente. Il tono da mercato lo tiene
 * anche senza il modello, perché è nelle parole scelte qui.
 */
export function mercatoDiRipiego(r: RichiestaMercato): TestiMercato {
  const ap = r.trattative.find((t) => t.lottoId === r.apertura) ?? r.trattative[0] ?? null;
  const altre = r.trattative.filter((t) => t.lottoId !== ap?.lottoId);
  const primo = ap ? chiamante(ap) : null;
  const sfidanti = ap ? rivali(ap) : [];

  const conta = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;
  const cap = paroleDelCappello(r.disposizione);

  const frasi = ap
    ? [
      `Il ${NOME_RUOLO[ap.ruolo]} del ${ap.club} è il nome caldo di questa finestra.`,
      primo ? `${primo.squadra} avrebbe avviato i contatti per prima.` : '',
      sfidanti.length
        ? `Ma ${sfidanti.map((s) => s.squadra).join(' e ')} si ${sfidanti.length > 1 ? 'sarebbero inseriti' : 'sarebbe inserito'} nella corsa.`
        : 'Per ora nessun altro club si sarebbe mosso.',
      r.fermi.length ? `Silenzio invece da ${r.fermi.join(', ')}.` : '',
      `Si capirà ${r.quandoSiGioca}.`,
    ].filter(Boolean)
    : ['Nessuna trattativa aperta in questa finestra.'];

  let cappello = '';
  for (const f of frasi) {
    if (conta(`${cappello} ${f}`) > cap.max) continue;
    cappello = cappello ? `${cappello} ${f}` : f;
  }

  const duelli = contese(altre);
  const gruppi = perSquadra(altre);

  return {
    titolo: ap ? ap.giocatore.slice(0, 44) : 'Mercato fermo',
    gancio: sfidanti.length ? 'è sfida' : ap ? 'trattativa in esclusiva' : '',
    cappello,
    contesi: duelli.length
      ? duelli.map((t) => `Su ${t.giocatore} si sarebbero mossi ${t.inCorsa.map((c) => c.squadra).join(' e ')}.`).join(' ')
      : '',
    squadre: gruppi.map((g) => ({
      squadra: g.squadra,
      testo: `${g.squadra} avrebbe messo gli occhi su ${elencoGiocatori(g.trattative)}.`,
    })),
    ferme: r.fermi.length ? `Nessun movimento, per ora, da ${r.fermi.join(', ')}.` : '',
    spalla: r.trattative.length
      ? {
        numero: String(r.trattative.length),
        didascalia: 'le trattative aperte in questa finestra di mercato.',
      }
      : null,
  };
}

// =====================================================================
// Il montaggio
// =====================================================================

/**
 * Dai testi del modello alla prima pagina del fantamercato.
 *
 * I titoletti dei blocchi — «ZHEGROVA (Juventus)» — li scriviamo noi, come
 * per le altre edizioni: sono fatti, e un fatto che il modello non scrive è
 * un fatto che non può sbagliare. Qui vale doppio, perché il club di Serie A
 * è l'unica cosa che àncora il pezzo alla realtà quando tutto il resto è
 * scritto al condizionale.
 */
export function montaMercato(
  t: TestiMercato, p: PezziDelMercato, quando = new Date(),
): DatiPrima {
  const r = p.richiesta;
  const ap = r.trattative.find((x) => x.lottoId === r.apertura) ?? r.trattative[0] ?? null;
  const altre = r.trattative.filter((x) => x.lottoId !== ap?.lottoId);
  const testoDi = new Map(t.squadre.map((x) => [x.squadra, x.testo]));

  /*
   * Tre tipi di voce, nell'ordine in cui si leggono: i duelli, poi la spesa
   * di ogni club, poi chi è rimasto a guardare. I titoletti li scriviamo
   * noi — il nome del club è un fatto, e un fatto che il modello non scrive
   * è un fatto che non può sbagliare.
   */
  const voci = [
    ...(contese(altre).length ? [{ titolo: 'Chi se lo contende', testo: t.contesi }] : []),
    ...perSquadra(altre).map((g) => ({ titolo: g.squadra, testo: testoDi.get(g.squadra) ?? '' })),
    ...(r.fermi.length ? [{ titolo: 'Chi sta a guardare', testo: t.ferme }] : []),
  ];

  return {
    tipo: 'fantamercato',
    numero: `MERCATO · SESSIONE ${r.sessione}`,
    data: dataEstesa(quando),
    sottotestata: 'INDISCREZIONI DI MERCATO',
    occhiello: 'INDISCREZIONI',
    titolo: t.titolo,
    gancio: t.gancio,
    sottotitolo: ap
      ? `${ap.giocatore} (${ap.club}) · sala d'asta ${r.quandoSiGioca}`
      : `Sala d'asta ${r.quandoSiGioca}`,
    cappello: t.cappello,
    foto: p.foto,
    // niente classifiche e niente calendari: qui ci sono solo notizie di
    // mercato, e la colonna di destra sparisce da sola
    classifica: [],
    prossimi: [],
    gironi: null,
    tabellone: null,
    titoloAltre: 'Squadra per squadra',
    altre: voci,
    spalla: t.spalla,
    piedeSinistra: 'FANTA MANSARDA',
    piedeDestra: 'TUTTE VOCI, PER ORA',
  };
}

/** Quello che la pagina mette accanto ai testi. */
export interface PezziDelMercato {
  richiesta: RichiestaMercato;
  foto: FotoPrima | null;
}
