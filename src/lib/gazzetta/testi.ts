/**
 * La Gazzetta della Mansarda — chi scrive i testi della prima pagina.
 *
 * Non è un riassunto del messaggione: è **lo stesso pezzo**, con lo stesso
 * tono, tagliato per stare in un'immagine. Da qui discendono due differenze
 * rispetto alla Redazione, e sono tutte e due vincoli di spazio.
 *
 * **Al modello si chiede il meno possibile.** Il sottotitolo («FC NTONIA -
 * FC CANEPARDO 4-1»), i titolini delle altre partite, l'occhiello e la data
 * li calcoliamo noi: sono fatti, non scrittura, e un fatto che il modello non
 * scrive è un fatto che non può sbagliare. Al modello restano il titolo, il
 * gancio, il cappello, tre righe per le altre partite e la didascalia del
 * numerone — cioè solo le parti dove serve la penna.
 *
 * **Le lunghezze sono in caratteri, non in parole.** In un messaggio WhatsApp
 * un testo lungo va a capo; in un'immagine esce dal riquadro e si taglia, e
 * nessuno se ne accorge finché non è nel gruppo. I limiti qui sotto vengono
 * da una misura vera dei font in uso (vedi `LARGHEZZA_CARATTERE`), non da una
 * stima a occhio.
 */

import { numeriInventati } from '../redazione/verifica';
import type { Spunto } from '../redazione/spunti';
import { tono } from '../redazione/toni';
import {
  ETICHETTA_EDIZIONE, paroleDelCappello,
  type Disposizione, type TipoEdizione,
} from './prima';

// =====================================================================
// Il materiale
// =====================================================================

export interface SfidaPrima {
  fixtureId: string;
  casa: string;
  ospite: string;
  golCasa: number;
  golOspite: number;
  fpCasa: number;
  fpOspite: number;
  competizione: 'campionato' | 'coppa';
}

export interface SquadraPrima {
  nome: string;
  soprannomi: string[];
  /** su cosa non si scherza: vale qui come vale nel messaggione */
  intoccabile?: string | null;
}

/** Il giocatore del numerone: il voto più alto di giornata. */
export interface MiglioreInCampo {
  nome: string;
  /** la fantasquadra che ce l'aveva in campo */
  squadra: string;
  fantapunti: number;
}

export interface RichiestaPrima {
  tipo: TipoEdizione;
  giornata: number;
  tono: number;
  /** dove finisce la foto: decide quanto può essere lungo il titolo */
  disposizione: Disposizione;
  squadre: SquadraPrima[];
  sfide: SfidaPrima[];
  /** il fixtureId che va in apertura */
  apertura: string;
  spunti: Spunto[];
  migliore: MiglioreInCampo | null;
  paroleVietate: string[];
  /** cosa non andava nel tentativo precedente */
  correzioni?: string[];
}

export interface TestiPrima {
  titolo: string;
  gancio: string;
  cappello: string;
  altre: { fixtureId: string; testo: string }[];
  spalla: { numero: string; didascalia: string } | null;
}

// =====================================================================
// Quanto ci sta: misure, non impressioni
// =====================================================================

/**
 * La larghezza media di un carattere, misurata davvero.
 *
 * Presa in Chromium coi font veri (Fjalla One per i titoli, Aileron per i
 * corpi) su otto titoli italiani plausibili, tenendo il **caso peggiore** fra
 * i campioni e non la media: un titolo tutto di lettere larghe deve stare
 * dentro come ci sta uno normale.
 *
 * Se un giorno cambia il font dei titoli, questi numeri vanno rimisurati: il
 * codice non se ne accorge da solo, e il sintomo sarebbe un titolo tagliato
 * a metà nell'immagine già mandata nel gruppo.
 */
export const LARGHEZZA_CARATTERE = {
  titolo64: 28.3,
  gancio44: 19.4,
  altreTesto14: 6.2,
  cappello15: 6.7,
} as const;

/** La larghezza della colonna dell'apertura, secondo dove sta la foto. */
export function larghezzaApertura(d: Disposizione): number {
  if (d === 'sfondo') return 600;
  if (d === 'senzaFoto') return 700;
  return 470;
}

/** Quante righe occupa un testo, a occhio ma con una misura sotto. */
export function righeStimate(testo: string, larghezzaColonna: number, perCarattere: number): number {
  const parole = testo.trim().split(/\s+/).filter(Boolean);
  if (!parole.length) return 0;

  // si impagina davvero, parola per parola: contare i caratteri e dividere
  // sbaglia di una riga ogni volta che una parola lunga va a capo da sola
  let righe = 1;
  let riga = 0;
  for (const p of parole) {
    const largo = p.length * perCarattere;
    const conSpazio = riga === 0 ? largo : riga + perCarattere + largo;
    if (conSpazio > larghezzaColonna) { righe += 1; riga = largo; } else { riga = conSpazio; }
  }
  return righe;
}

/**
 * I limiti del titolo e del gancio, in caratteri.
 *
 * Il titolo può andare su due righe, il gancio deve stare su una: il gancio
 * è la battuta, e una battuta spezzata su due righe in giallo non è più una
 * battuta.
 */
export function limitiTitolo(d: Disposizione): { titolo: number; gancio: number } {
  const largo = larghezzaApertura(d);
  return {
    titolo: Math.floor((largo * 2) / LARGHEZZA_CARATTERE.titolo64),
    gancio: Math.floor(largo / LARGHEZZA_CARATTERE.gancio44),
  };
}

/** Le righe massime di un blocco «Le altre»: tre, poi la colonna sfonda. */
export const RIGHE_ALTRE = 3;
export const LARGHEZZA_ALTRE = 495;

// =====================================================================
// Cosa va in apertura
// =====================================================================

/**
 * Quale partita apre la pagina.
 *
 * Non la prima dell'elenco e non quella col punteggio più alto: quella con
 * lo **spunto più grosso**, perché è quella di cui il gruppo parlerà. A parità
 * (o senza spunti) vince il fantapunteggio più alto messo in campo — una
 * regola, non una preferenza, così l'admin sa sempre perché è finita lì.
 */
export function sceltaApertura(sfide: SfidaPrima[], spunti: Spunto[]): string | null {
  if (!sfide.length) return null;

  const peso = new Map<string, number>();
  for (const s of spunti) {
    if (!s.fixtureId) continue;
    peso.set(s.fixtureId, Math.max(peso.get(s.fixtureId) ?? 0, s.peso));
  }

  const punteggio = (s: SfidaPrima) => Math.max(s.fpCasa, s.fpOspite);
  return sfide.slice().sort((a, b) => {
    const d = (peso.get(b.fixtureId) ?? 0) - (peso.get(a.fixtureId) ?? 0);
    if (d !== 0) return d;
    const p = punteggio(b) - punteggio(a);
    if (p !== 0) return p;
    // ultimo criterio stabile: l'ordine non deve dipendere dal caso
    return a.fixtureId.localeCompare(b.fixtureId);
  })[0].fixtureId;
}

/** «FC NTONIA - FC CANEPARDO 4-1»: lo scriviamo noi, non il modello. */
export function sottotitoloDi(s: SfidaPrima): string {
  return `${s.casa} - ${s.ospite} ${s.golCasa}-${s.golOspite}`;
}

/** «Joga Benito 2-1 Montester»: idem. */
export function titolinoDi(s: SfidaPrima): string {
  return `${s.casa} ${s.golCasa}-${s.golOspite} ${s.ospite}`;
}

export function occhielloDi(r: Pick<RichiestaPrima, 'tipo' | 'giornata'>): string {
  return r.tipo === 'settimanale' ? `LA GIORNATA ${r.giornata}` : 'IL FANTAMERCATO';
}

// =====================================================================
// Il prompt
// =====================================================================

export function costruisciPromptPrima(r: RichiestaPrima): string {
  const apertura = r.sfide.find((s) => s.fixtureId === r.apertura) ?? r.sfide[0];
  const altre = r.sfide.filter((s) => s.fixtureId !== apertura?.fixtureId);
  const lim = limitiTitolo(r.disposizione);
  const cap = paroleDelCappello(r.disposizione);

  const spuntiDi = (id: string | null) => r.spunti
    .filter((s) => s.fixtureId === id)
    .map((s) => `  - [peso ${s.peso}] ${s.frase} · dati: ${JSON.stringify(s.dati)}`)
    .join('\n');

  const schede = r.squadre.map((s) => {
    const righe = [`- ${s.nome}`];
    if (s.soprannomi.length) righe.push(`  soprannomi: ${s.soprannomi.join(', ')}`);
    if (s.intoccabile) righe.push(`  NON scherzare su: ${s.intoccabile}`);
    return righe.join('\n');
  }).join('\n');

  const blocco = (s: SfidaPrima) => [
    `### ${titolinoDi(s)}  (${s.competizione})`,
    `fixtureId: ${s.fixtureId}`,
    `fantapunti: ${s.casa} ${s.fpCasa} · ${s.ospite} ${s.fpOspite}`,
    spuntiDi(s.fixtureId) || '  - nessuno spunto: racconta il fatto senza forzare la battuta',
  ].join('\n');

  return `Sei il titolista della "Gazzetta della Mansarda", la prima pagina che la lega di fantacalcio Fanta Mansarda manda nel gruppo al posto del racconto lungo.

Questa non è una versione corta del pezzo: è la prima pagina di un giornale sportivo. Poche cose, grosse, con la lingua di chi sfotte gli amici da dieci anni.

## Tono
${r.tono}/5 — ${tono(r.tono)}.
Si sfotte la SQUADRA e il suo allenatore in quanto fantallenatore, mai la persona.

## Regole assolute
1. Non scrivere MAI un numero che non ti ho dato qui sotto. Nessuna media, nessuna percentuale, niente che tu abbia calcolato.
2. Non inventare episodi, gol o dichiarazioni: hai i punteggi e gli spunti, basta.
3. Non citare giocatori o squadre che non compaiono qui sotto.
4. Italiano parlato. Niente burocratese sportivo, niente "l'undici di", niente "cala il sipario".
5. Le lunghezze sono un vincolo di spazio, non un consiglio: quello che sfora viene tagliato dall'immagine e nessuno se ne accorge in tempo.${
  r.paroleVietate.length ? `\n6. Parole vietate: ${r.paroleVietate.join(', ')}.` : ''}

## Le squadre
${schede}

## L'apertura
${apertura ? blocco(apertura) : 'nessuna sfida'}

## Le altre partite
${altre.map(blocco).join('\n\n') || 'nessuna'}

## Spunti di giornata (non legati a una partita sola)
${spuntiDi(null) || '  - nessuno'}

## Il migliore in campo
${r.migliore
    ? `${r.migliore.nome}, ${r.migliore.fantapunti} fantapunti, schierato da ${r.migliore.squadra}`
    : 'non pervenuto'}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice:

{
  "titolo": "il titolo dell'apertura, al massimo ${lim.titolo} caratteri. Il fatto, secco, senza battuta",
  "gancio": "la seconda riga del titolo, al massimo ${lim.gancio} caratteri: qui ci va il gancio, e se puoi ci metti dentro il migliore in campo. Esempio della forma: «con un Mastantuono da 18»",
  "cappello": "il sommario dell'apertura: fra ${cap.min} e ${cap.max} parole, due o tre frasi, il tono del racconto lungo concentrato",
  "altre": [${altre.map((s) => `{ "fixtureId": "${s.fixtureId}", "testo": "due righe secche su ${titolinoDi(s)}, al massimo 190 caratteri" }`).join(', ') || ''}],
  "spalla": { "numero": "UN numero solo fra quelli che ti ho dato, scritto in cifre", "didascalia": "cosa significa quel numero, al massimo 110 caratteri, senza ripetere il numero" }
}

Il titolo NON deve ripetere il risultato: sotto al titolo il risultato c'è già scritto.
L'array "altre" deve contenere tutte e ${altre.length} le partite, coi fixtureId esatti.${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''}`;
}

// =====================================================================
// La lettura della risposta
// =====================================================================

export function daJsonPrima(grezzo: unknown): TestiPrima {
  const p = (grezzo ?? {}) as Record<string, unknown>;
  const altreGrezze = Array.isArray(p.altre) ? p.altre : [];
  const spalla = p.spalla as { numero?: unknown; didascalia?: unknown } | null | undefined;

  return {
    titolo: String(p.titolo ?? '').trim(),
    gancio: String(p.gancio ?? '').trim(),
    cappello: String(p.cappello ?? '').trim(),
    altre: altreGrezze.map((a) => {
      const x = (a ?? {}) as Record<string, unknown>;
      return { fixtureId: String(x.fixtureId ?? ''), testo: String(x.testo ?? '').trim() };
    }),
    spalla: spalla && String(spalla.numero ?? '').trim()
      ? {
        numero: String(spalla.numero).trim(),
        didascalia: String(spalla.didascalia ?? '').trim(),
      }
      : null,
  };
}

// =====================================================================
// La verifica
// =====================================================================

export interface EsitoPrima {
  ok: boolean;
  problemi: string[];
  inventati: number[];
}

/** I numeri che la pagina ha il diritto di citare. */
export function numeriDellaPrima(r: RichiestaPrima, leciti: Set<number>): Set<number> {
  const ammessi = new Set<number>(leciti);
  for (const s of r.sfide) {
    ammessi.add(s.golCasa); ammessi.add(s.golOspite);
    ammessi.add(s.fpCasa); ammessi.add(s.fpOspite);
  }
  ammessi.add(r.giornata);
  if (r.migliore) ammessi.add(r.migliore.fantapunti);
  return ammessi;
}

export function verificaPrima(t: TestiPrima, r: RichiestaPrima, leciti: Set<number>): EsitoPrima {
  const problemi: string[] = [];
  const lim = limitiTitolo(r.disposizione);
  const cap = paroleDelCappello(r.disposizione);
  const largo = larghezzaApertura(r.disposizione);

  // ---- il minimo sindacale
  if (!t.titolo) problemi.push('manca il titolo');
  if (!t.cappello) problemi.push('manca il cappello');

  // ---- le lunghezze, che qui sono spazio e non stile
  if (t.titolo.length > lim.titolo) {
    problemi.push(`il titolo è di ${t.titolo.length} caratteri invece di ${lim.titolo}`);
  }
  if (righeStimate(t.titolo, largo, LARGHEZZA_CARATTERE.titolo64) > 2) {
    problemi.push('il titolo occupa più di due righe');
  }
  if (t.gancio.length > lim.gancio) {
    problemi.push(`il gancio è di ${t.gancio.length} caratteri invece di ${lim.gancio}`);
  }
  if (t.gancio && righeStimate(t.gancio, largo, LARGHEZZA_CARATTERE.gancio44) > 1) {
    problemi.push('il gancio non sta su una riga sola');
  }

  const paroleCappello = t.cappello.trim().split(/\s+/).filter(Boolean).length;
  if (t.cappello && (paroleCappello < cap.min || paroleCappello > cap.max)) {
    problemi.push(`il cappello ha ${paroleCappello} parole invece di ${cap.min}-${cap.max}`);
  }

  // ---- tutte le altre partite, coi loro identificativi
  const attesi = new Set(r.sfide.filter((s) => s.fixtureId !== r.apertura).map((s) => s.fixtureId));
  const arrivati = new Set(t.altre.map((a) => a.fixtureId));
  for (const id of attesi) {
    if (!arrivati.has(id)) {
      const s = r.sfide.find((x) => x.fixtureId === id)!;
      problemi.push(`manca il blocco su ${s.casa} – ${s.ospite}`);
    }
  }
  for (const id of arrivati) {
    if (!attesi.has(id)) problemi.push(`c'è un blocco su una partita che non va in pagina (${id})`);
  }
  for (const a of t.altre) {
    const righe = righeStimate(a.testo, LARGHEZZA_ALTRE, LARGHEZZA_CARATTERE.altreTesto14);
    if (righe > RIGHE_ALTRE) {
      const s = r.sfide.find((x) => x.fixtureId === a.fixtureId);
      problemi.push(`${s ? titolinoDi(s) : a.fixtureId}: ${righe} righe invece di ${RIGHE_ALTRE}`);
    }
  }

  // ---- il numerone dev'essere un numero che esiste
  const ammessi = numeriDellaPrima(r, leciti);
  if (t.spalla) {
    const n = Number(t.spalla.numero.replace(',', '.'));
    if (!Number.isFinite(n)) problemi.push(`il numerone «${t.spalla.numero}» non è un numero`);
    else if (!ammessi.has(n)) problemi.push(`il numerone ${n} non è fra quelli che ti ho dato`);
    if (t.spalla.didascalia.length > 130) problemi.push('la didascalia del numerone è troppo lunga');
  }

  // ---- numeri inventati, dappertutto
  const tutto = [t.titolo, t.gancio, t.cappello, ...t.altre.map((a) => a.testo),
    t.spalla?.didascalia ?? ''].join('\n');
  const inventati = numeriInventati(tutto, ammessi);
  if (inventati.length) problemi.push(`numeri che non ti ho dato: ${inventati.join(', ')}`);

  // ---- parole vietate
  const minuscolo = tutto.toLowerCase();
  const vietate = r.paroleVietate.filter((p) => p && minuscolo.includes(p.toLowerCase()));
  if (vietate.length) problemi.push(`parole vietate usate: ${vietate.join(', ')}`);

  return { ok: problemi.length === 0, problemi, inventati };
}

// =====================================================================
// Il ripiego
// =====================================================================

/**
 * La pagina che esce quando il modello non risponde.
 *
 * Non è brillante e non ci prova: deve essere **corretta** e stare dentro i
 * riquadri. Meglio una prima pagina asciutta nel gruppo che un errore, o
 * niente.
 */
/**
 * Mette insieme le frasi finché il cappello è abbastanza lungo, senza mai
 * sforare.
 *
 * Il minimo non è un capriccio: sotto le ~28 parole, nella disposizione a
 * tutta pagina, il cappello lascia un buco bianco sotto il filetto giallo.
 * Le frasi arrivano già in ordine di importanza, quindi si prendono dall'alto
 * e si smette appena basta.
 */
export function riempi(frasi: string[], min: number, max: number): string {
  const conta = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const prese: string[] = [];
  let n = 0;
  for (const f of frasi) {
    const q = conta(f);
    if (n + q > max) continue;          // questa non ci sta: si prova la prossima
    prese.push(f);
    n += q;
    if (n >= min) break;
  }
  return prese.join(' ');
}

export function primaDiRipiego(r: RichiestaPrima): TestiPrima {
  const ap = r.sfide.find((s) => s.fixtureId === r.apertura) ?? r.sfide[0] ?? null;
  const altre = r.sfide.filter((s) => s.fixtureId !== ap?.fixtureId);
  const lim = limitiTitolo(r.disposizione);
  const cap = paroleDelCappello(r.disposizione);

  const vince = ap && (ap.fpCasa >= ap.fpOspite ? ap.casa : ap.ospite);
  const perde = ap && (ap.fpCasa >= ap.fpOspite ? ap.ospite : ap.casa);
  const alti = ap ? Math.max(ap.fpCasa, ap.fpOspite) : 0;
  const bassi = ap ? Math.min(ap.fpCasa, ap.fpOspite) : 0;

  const taglia = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}.`);

  return {
    titolo: ap ? taglia(`${vince} passa`, lim.titolo) : `${ETICHETTA_EDIZIONE[r.tipo]}`,
    gancio: ap ? taglia(`${alti} contro ${bassi}`, lim.gancio) : '',
    cappello: ap
      ? riempi([
        `${vince} chiude a ${alti} fantapunti, ${perde} a ${bassi}: finisce ${ap.golCasa}-${ap.golOspite}.`,
        ...(r.migliore
          ? [`Il voto più alto della giornata è di ${r.migliore.nome}, ${r.migliore.fantapunti} fantapunti, schierato da ${r.migliore.squadra}.`]
          : []),
        ...altre.map((s) => `${s.casa} ${s.golCasa}-${s.golOspite} ${s.ospite}, ${s.fpCasa} fantapunti contro ${s.fpOspite}.`),
        'Il racconto lungo resta nell\'app, per chi lo vuole.',
      ], cap.min, cap.max)
      : 'Nessuna partita da raccontare.',
    altre: altre.map((s) => ({
      fixtureId: s.fixtureId,
      testo: `${s.fpCasa} fantapunti contro ${s.fpOspite}.`,
    })),
    spalla: r.migliore
      ? {
        numero: String(r.migliore.fantapunti),
        didascalia: `i fantapunti di ${r.migliore.nome}, schierato da ${r.migliore.squadra}.`,
      }
      : null,
  };
}
