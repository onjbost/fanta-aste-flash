/**
 * L'anteprima di giornata — il messaggio delle quote appena pubblicate.
 *
 * È il gemello anteriore del pezzo di fine giornata: stessa meccanica, tempo
 * verbale opposto. Là si racconta cos'è successo, qui si lancia quello che
 * sta per succedere.
 *
 * **Non è una schedina.** La prima versione metteva in chiaro la favorita e
 * la sua quota sfida per sfida: informazione onesta, ma il messaggio veniva
 * lungo e si leggeva come un pronostico da bookmaker invece che come un
 * annuncio della lega. Le quote stanno nell'app, chi gioca le guarda lì. Qui
 * ci va il racconto: chi comanda, chi va da chi, cosa c'è in ballo.
 *
 * E ci va **un blocco solo**: tutta la giornata in un paragrafo che scorre,
 * non quattro schedine incolonnate. Lungo il giusto per essere una lettura —
 * una quindicina di righe — ma senza titoletti e senza elenchi in mezzo, che
 * è quello che trasforma un annuncio in un modulo da compilare.
 *
 * Funzioni pure, nessun accesso al database. Il materiale lo raccoglie
 * `anteprimaServer.ts`.
 */

import { tono } from './modello';
import { contaParole, numeriInventati } from './verifica';

// =====================================================================
// Il materiale
// =====================================================================

export type Scontro = 'alta' | 'bassa' | 'prima_ultima' | null;

export interface RigaAnteprima {
  nome: string;
  punti: number;
  posizione: number;
}

export interface SfidaDaPresentare {
  casa: string;
  ospite: string;
  competizione: 'campionato' | 'coppa';
  /** 'A' o 'B' nella fase a gruppi della coppa */
  gruppo?: string | null;
  /** posizione in classifica delle due, quando ce l'hanno */
  posCasa: number | null;
  posOspite: number | null;
  scontro: Scontro;
}

export interface TipsterInTesta {
  nome: string;
  punti: number;
  posizione: number;
}

export interface RichiestaAnteprima {
  giornata: number;
  serieA: number;
  tono: number;
  paroleVietate: string[];
  /** quando si chiude, già scritto in italiano */
  chiusura: string;
  classifica: RigaAnteprima[];
  sfide: SfidaDaPresentare[];
  tipster: TipsterInTesta[];
  /** cosa non andava nel tentativo precedente */
  correzioni?: string[];
}

export interface Anteprima {
  /** una o due righe: la lavagna è aperta */
  apertura: string;
  /** il racconto della giornata, tutte le sfide dentro un blocco solo */
  panoramica: string;
  /** una riga per mandare a giocare */
  chiusura: string;
}

/**
 * Quanto può essere lunga la panoramica.
 *
 * Su un telefono una riga di WhatsApp sta sulle nove o dieci parole, quindi
 * centocinquanta parole fanno la quindicina di righe chiesta e trecento ne
 * fanno una trentina. Il minimo serve a non farsi liquidare in tre frasi; il
 * massimo esiste perché un paragrafo unico che supera lo schermo due volte
 * smette di essere un racconto e diventa un muro.
 */
export const MIN_PAROLE = 150;
export const MAX_PAROLE = 300;

// =====================================================================
// Gli scontri caldi
// =====================================================================

/**
 * Che tipo di sfida è, guardando solo la classifica.
 *
 * Stesse soglie degli spunti di fine giornata, perché una partita non può
 * essere «scontro d'alta classifica» il giovedì e non esserlo la domenica.
 * Chi non è in classifica — una squadra senza giornate giocate — non produce
 * nessuno scontro: meglio non dire niente che dire una cosa a caso.
 */
export function classificaScontro(
  posCasa: number | null, posOspite: number | null, quante: number,
): Scontro {
  if (posCasa == null || posOspite == null || quante < 4) return null;
  if (posCasa <= 3 && posOspite <= 3) return 'alta';
  if (posCasa > quante - 3 && posOspite > quante - 3) return 'bassa';
  if (Math.abs(posCasa - posOspite) >= quante - 2) return 'prima_ultima';
  return null;
}

export function etichettaScontro(s: Scontro): string | null {
  if (s === 'alta') return 'scontro d\'alta classifica';
  if (s === 'bassa') return 'sfida in fondo alla classifica';
  if (s === 'prima_ultima') return 'la prima contro l\'ultima';
  return null;
}

// =====================================================================
// Il prompt
// =====================================================================

/** I punti sono decimali: in italiano si scrivono con la virgola. */
const punti = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Tutte le squadre che scendono in campo, senza ripetizioni. */
export function squadreInCampo(r: RichiestaAnteprima): string[] {
  const viste: string[] = [];
  for (const s of r.sfide) {
    for (const n of [s.casa, s.ospite]) if (!viste.includes(n)) viste.push(n);
  }
  return viste;
}

export function costruisciPromptAnteprima(r: RichiestaAnteprima): string {
  const classifica = r.classifica
    .map((c) => `${c.posizione}. ${c.nome} — ${c.punti} punti`).join('\n');

  const sfide = r.sfide.map((s) => {
    const dove = s.competizione === 'coppa'
      ? `coppa${s.gruppo ? `, gruppo ${s.gruppo}` : ''}`
      : 'campionato';
    const e = etichettaScontro(s.scontro);
    return `- ${s.casa} (${s.posCasa ?? '—'}°) contro ${s.ospite} (${s.posOspite ?? '—'}°)`
      + ` · ${dove}${e ? ` · ${e}` : ''}`;
  }).join('\n');

  const capo = r.tipster[0];

  return `Sei il cronista della lega di fantacalcio "Fanta Mansarda". Le quote della giornata ${r.giornata} (Serie A ${r.serieA}) sono appena state pubblicate: scrivi l'annuncio per il gruppo WhatsApp della lega.

Non è la cronaca di una giornata finita: è il lancio di una che deve cominciare. Non sai com'è andata — non si è ancora giocato — e non devi pronosticare come andrà.

## Tono
${r.tono}/5 — ${tono(r.tono)}.
Racconta e sfida: il tono è quello di chi presenta gli incroci della settimana e provoca chi deve giocarli. Si sfotte la SQUADRA e il suo allenatore in quanto fantallenatore, mai la persona.

## Regole assolute
1. **Niente pronostici.** Non dire chi vincerà, chi è favorito, chi parte meglio. Puoi dire come stanno in classifica, cosa hanno da perdere, cosa si giocano: quello è raccontare, non prevedere.
2. Non scrivere MAI un numero che non ti ho dato: né medie, né percentuali, né statistiche calcolate da te. Se un numero non è qui sotto, non esiste.
3. Non dare per avvenuto niente: nessun risultato, nessun gol, nessuna prestazione di questa giornata.
4. La panoramica è **un paragrafo solo** per tutta la giornata, fra ${MIN_PAROLE} e ${MAX_PAROLE} parole — una quindicina di righe. Deve nominare **tutte** le squadre che giocano e dedicare qualche riga a ciascuna sfida, ma dentro un testo continuo: niente elenchi puntati, niente titoletti, niente «a capo» fra una partita e l'altra. Devono legarsi l'una all'altra come in un pezzo di giornale.
5. Italiano parlato e vivo, niente burocratese sportivo.
${r.paroleVietate.length ? `6. Parole vietate, non usarle mai: ${r.paroleVietate.join(', ')}.\n` : ''}
## Classifica adesso
${classifica || 'non si è ancora giocato'}

## Chi gioca con chi
${sfide}

## Torneo dei Tipster
${capo ? `guida ${capo.nome} con ${punti(capo.punti)} punti` : 'nessuna schedina giocata finora'}

## Quando si chiude
${r.chiusura}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice, in questa forma:

{
  "apertura": "una o due righe: le quote sono in lavagna e si può giocare",
  "panoramica": "il paragrafo unico sulla giornata, ${MIN_PAROLE}-${MAX_PAROLE} parole, tutte le squadre nominate, nessun a capo dentro",
  "chiusura": "una riga sola per mandare a giocare prima della chiusura"
}${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''
}`;
}

/** Dal JSON del modello all'anteprima, coi campi messi in forma. */
export function daJsonAnteprima(grezzo: unknown): Anteprima {
  const p = (grezzo ?? {}) as Partial<Anteprima>;
  if (typeof p.panoramica !== 'string' || !p.panoramica.trim()) {
    throw new Error('la risposta non contiene la panoramica');
  }
  return {
    apertura: String(p.apertura ?? '').trim(),
    panoramica: p.panoramica.trim(),
    chiusura: String(p.chiusura ?? '').trim(),
  };
}

// =====================================================================
// La verifica
// =====================================================================

export interface EsitoAnteprima {
  ok: boolean;
  problemi: string[];
  inventati: number[];
  parole: number;
}

/**
 * I numeri che l'anteprima ha il diritto di citare: le posizioni e i punti
 * di classifica, i punti di chi guida il torneo, la giornata. Le quote non
 * ci sono più — e siccome non gliele diamo, se ne cita una viene bocciata,
 * che è esattamente il comportamento voluto.
 */
export function numeriLecitiAnteprima(r: RichiestaAnteprima): Set<number> {
  const n = new Set<number>();
  const metti = (x: unknown) => { if (typeof x === 'number' && Number.isFinite(x)) n.add(x); };

  metti(r.giornata);
  metti(r.serieA);
  for (const c of r.classifica) { metti(c.punti); metti(c.posizione); }
  for (const t of r.tipster) { metti(t.punti); metti(t.posizione); }
  for (const s of r.sfide) { metti(s.posCasa); metti(s.posOspite); }
  return n;
}

export function verificaAnteprima(a: Anteprima, r: RichiestaAnteprima): EsitoAnteprima {
  const problemi: string[] = [];
  const parole = contaParole(a.panoramica);

  if (parole < MIN_PAROLE) problemi.push(`la panoramica ha ${parole} parole invece di ${MIN_PAROLE}`);
  if (parole > MAX_PAROLE) problemi.push(`la panoramica ha ${parole} parole, il massimo è ${MAX_PAROLE}`);

  /*
   * Che ci siano tutte le sfide, senza un elenco di sfide.
   *
   * Nella versione a blocchi bastava contare i `fixtureId`. Qui il testo è
   * uno solo, e il controllo diventa: ogni squadra che scende in campo deve
   * essere nominata. Serve a non farsi consegnare un paragrafo che racconta
   * due partite e si dimentica le altre due.
   */
  const dentro = a.panoramica.toLowerCase();
  const mancanti = squadreInCampo(r).filter((n) => !dentro.includes(n.toLowerCase()));
  if (mancanti.length) problemi.push(`non nomina: ${mancanti.join(', ')}`);

  const tutto = [a.apertura, a.panoramica, a.chiusura].join('\n');
  const inventati = numeriInventati(tutto, numeriLecitiAnteprima(r));
  if (inventati.length) problemi.push(`numeri che non ti ho dato: ${inventati.join(', ')}`);

  const minuscolo = tutto.toLowerCase();
  const vietate = r.paroleVietate.filter((p) => p && minuscolo.includes(p.toLowerCase()));
  if (vietate.length) problemi.push(`parole vietate usate: ${vietate.join(', ')}`);

  if (!a.apertura.trim()) problemi.push('manca l\'apertura');

  return { ok: problemi.length === 0, problemi, inventati, parole };
}

// =====================================================================
// Il ripiego
// =====================================================================

/** «Alfa, Beta e Gamma» — la congiunzione al posto giusto. */
function elenco(nomi: string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? '';
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`;
}

/**
 * L'anteprima senza modello: asciutta, ma completa e sempre corretta.
 *
 * Non deve essere brillante, deve partire. Se Gemini non risponde di giovedì
 * sera il gruppo riceve comunque l'annuncio con dentro quello che serve, ed è
 * per costruzione impossibile che citi un numero che non gli abbiamo dato.
 */
export function anteprimaDiRipiego(r: RichiestaAnteprima): Anteprima {
  const capo = r.classifica[0];
  const guida = r.tipster[0];

  const incroci = r.sfide
    .map((s) => `${s.casa} – ${s.ospite}`)
    .join('; ');
  const caldi = r.sfide
    .map((s) => ({ s, e: etichettaScontro(s.scontro) }))
    .filter((x) => x.e)
    .map((x) => `${x.s.casa} – ${x.s.ospite} è ${x.e}`);

  return {
    apertura: `Quote in lavagna per la giornata ${r.giornata}: si gioca.`,
    panoramica: [
      capo ? `Comanda ${capo.nome} con ${capo.punti} punti.` : '',
      `In campo: ${incroci}.`,
      caldi.length ? `${elenco(caldi)}.` : '',
    ].filter(Boolean).join(' '),
    chiusura: guida
      ? `Nel Torneo dei Tipster guida ${guida.nome} con ${punti(guida.punti)} punti: c'è da riprenderlo.`
      : 'Si comincia: la prima schedina vale già.',
  };
}

// =====================================================================
// Il montaggio
// =====================================================================

const RIGA = '─'.repeat(28);

/** Il messaggio finito, nell'ordine in cui si legge. */
export function montaAnteprima(a: Anteprima, r: RichiestaAnteprima): string {
  const righe: string[] = [
    `🏆 FANTA MANSARDA · GIORNATA ${r.giornata}`,
    RIGA,
    '',
    a.apertura,
    '',
    a.panoramica,
  ];

  if (r.classifica.length) {
    righe.push('', `📊 ${r.classifica.map((c) => `${c.posizione}. ${c.nome} ${punti(c.punti)}`).join(' · ')}`);
  }
  if (a.chiusura) righe.push('', a.chiusura);
  righe.push('', `🔒 Si gioca fino a ${r.chiusura}`);

  return righe.join('\n');
}
