/**
 * L'anteprima di giornata — il messaggio delle quote appena pubblicate.
 *
 * È il gemello anteriore del pezzo di fine giornata: stessa meccanica, tempo
 * verbale opposto. Là si racconta cos'è successo, qui cosa sta per succedere,
 * e la notizia è che la lavagna è aperta e si può giocare.
 *
 * Funzioni pure, nessun accesso al database. Il materiale lo raccoglie
 * `anteprimaServer.ts`; qui c'è come si chiede al modello, come si controlla
 * quello che risponde, e come si monta il messaggio da inoltrare.
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
  fixtureId: string;
  casa: string;
  ospite: string;
  competizione: 'campionato' | 'coppa';
  /** 'A' o 'B' nella fase a gruppi della coppa */
  gruppo?: string | null;
  /** posizione in classifica delle due, quando ce l'hanno */
  posCasa: number | null;
  posOspite: number | null;
  /** chi il modello delle quote dà favorito, e a quanto paga */
  favorita: string | null;
  quotaFavorita: number | null;
  /** quanto paga il pareggio: serve a far capire se è una sfida aperta */
  quotaPari: number | null;
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
  apertura: string;
  classifica: string;
  sfide: { fixtureId: string; testo: string }[];
  chiusura: string;
}

/** Un lancio, non una cronaca: due o tre righe bastano. */
export const MIN_PAROLE_SFIDA = 25;

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

const quota = (q: number | null) => (q == null ? '—' : q.toFixed(2).replace('.', ','));

/** I punti dei tipster sono decimali: in italiano si scrivono con la virgola. */
const punti = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function costruisciPromptAnteprima(r: RichiestaAnteprima): string {
  const classifica = r.classifica
    .map((c) => `${c.posizione}. ${c.nome} — ${c.punti} punti`).join('\n');

  const sfide = r.sfide.map((s) => {
    const righe = [
      `### ${s.casa} – ${s.ospite}  (${s.competizione}${s.gruppo ? `, gruppo ${s.gruppo}` : ''})`,
      `fixtureId: ${s.fixtureId}`,
      `in classifica: ${s.casa} ${s.posCasa ?? '—'}° · ${s.ospite} ${s.posOspite ?? '—'}°`,
      s.favorita
        ? `favorita secondo le quote: ${s.favorita}, quota ${quota(s.quotaFavorita)} (il pari paga ${quota(s.quotaPari)})`
        : 'quote non disponibili per questa sfida',
    ];
    const e = etichettaScontro(s.scontro);
    if (e) righe.push(`nota: ${e}`);
    return righe.join('\n');
  }).join('\n\n');

  const tipster = r.tipster
    .map((t) => `${t.posizione}. ${t.nome} — ${t.punti} punti`).join('\n');

  return `Sei il cronista della lega di fantacalcio "Fanta Mansarda". Le quote della giornata ${r.giornata} (Serie A ${r.serieA}) sono appena state pubblicate: scrivi l'annuncio per il gruppo WhatsApp della lega.

Non è la cronaca di una giornata finita: è la presentazione di una che deve cominciare. Non sai com'è andata, sai solo chi parte favorito e come sono messi in classifica.

## Tono
${r.tono}/5 — ${tono(r.tono)}.
Si sfotte la SQUADRA e il suo allenatore in quanto fantallenatore, mai la persona.

## Regole assolute
1. Non scrivere MAI un numero che non ti ho dato: né medie, né percentuali, né statistiche calcolate da te. Se un numero non è qui sotto, non esiste.
2. Non dare per avvenuto niente. Nessun risultato, nessun gol, nessuna prestazione di questa giornata: non si è ancora giocato.
3. Ogni sfida deve avere almeno ${MIN_PAROLE_SFIDA} parole. È un lancio, non un pezzo: due o tre righe.
4. Italiano parlato e vivo, niente burocratese sportivo, niente elenchi puntati dentro i testi.
5. Le quote sono quelle del nostro modello, non di un bookmaker: parlane come di un pronostico della lega, non di una verità.
${r.paroleVietate.length ? `6. Parole vietate, non usarle mai: ${r.paroleVietate.join(', ')}.\n` : ''}
## Classifica adesso
${classifica || 'non si è ancora giocato'}

## Le sfide da presentare
${sfide}

## Torneo dei Tipster, la classifica adesso
${tipster || 'nessuna schedina giocata finora'}

## Quando si chiude
${r.chiusura}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice, in questa forma:

{
  "apertura": "3-4 righe: che le quote sono pubblicate e si può giocare, e che giornata è",
  "classifica": "un paragrafo su com'è messa la classifica adesso e cosa c'è in ballo",
  "sfide": [{ "fixtureId": "<esattamente quello indicato sopra>", "testo": "almeno ${MIN_PAROLE_SFIDA} parole" }],
  "chiusura": "una riga per invitare a giocare prima della chiusura"
}

L'array "sfide" deve contenere tutte e ${r.sfide.length} le sfide, con i fixtureId esatti.${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''
}`;
}

/** Dal JSON del modello all'anteprima, coi campi messi in forma. */
export function daJsonAnteprima(grezzo: unknown): Anteprima {
  const p = (grezzo ?? {}) as Partial<Anteprima>;
  if (!Array.isArray(p.sfide)) throw new Error('la risposta non contiene l\'elenco delle sfide');
  return {
    apertura: String(p.apertura ?? '').trim(),
    classifica: String(p.classifica ?? '').trim(),
    sfide: p.sfide.map((s) => ({
      fixtureId: String((s as { fixtureId?: unknown }).fixtureId ?? ''),
      testo: String((s as { testo?: unknown }).testo ?? '').trim(),
    })),
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
}

/**
 * I numeri che l'anteprima ha il diritto di citare.
 *
 * Le quote entrano sia col punto sia con la virgola, perché il modello
 * scrive «1,93» e il controllo legge numeri: senza, ogni quota citata
 * sembrerebbe inventata e il pezzo verrebbe bocciato sempre.
 */
export function numeriLecitiAnteprima(r: RichiestaAnteprima): Set<number> {
  const n = new Set<number>();
  const metti = (x: unknown) => { if (typeof x === 'number' && Number.isFinite(x)) n.add(x); };

  metti(r.giornata);
  metti(r.serieA);
  for (const c of r.classifica) { metti(c.punti); metti(c.posizione); }
  for (const t of r.tipster) { metti(t.punti); metti(t.posizione); }
  for (const s of r.sfide) {
    metti(s.posCasa); metti(s.posOspite);
    metti(s.quotaFavorita); metti(s.quotaPari);
    // le quote arrotondate come le scriverebbe una persona
    if (s.quotaFavorita != null) metti(Math.round(s.quotaFavorita * 100) / 100);
    if (s.quotaPari != null) metti(Math.round(s.quotaPari * 100) / 100);
  }
  return n;
}

export function verificaAnteprima(a: Anteprima, r: RichiestaAnteprima): EsitoAnteprima {
  const problemi: string[] = [];

  const attesi = new Set(r.sfide.map((s) => s.fixtureId));
  const arrivati = new Set(a.sfide.map((s) => s.fixtureId));
  for (const id of attesi) {
    if (!arrivati.has(id)) {
      const s = r.sfide.find((x) => x.fixtureId === id)!;
      problemi.push(`manca il lancio di ${s.casa} – ${s.ospite}`);
    }
  }
  for (const id of arrivati) {
    if (!attesi.has(id)) problemi.push(`c'è un lancio su una sfida che non esiste (${id})`);
  }

  for (const s of a.sfide) {
    const nome = r.sfide.find((x) => x.fixtureId === s.fixtureId);
    const n = contaParole(s.testo);
    if (n < MIN_PAROLE_SFIDA) {
      problemi.push(
        `${nome ? `${nome.casa} – ${nome.ospite}` : s.fixtureId}: ${n} parole invece di ${MIN_PAROLE_SFIDA}`,
      );
    }
  }

  const tutto = [a.apertura, a.classifica, ...a.sfide.map((s) => s.testo), a.chiusura].join('\n');
  const inventati = numeriInventati(tutto, numeriLecitiAnteprima(r));
  if (inventati.length) problemi.push(`numeri che non ti ho dato: ${inventati.join(', ')}`);

  const minuscolo = tutto.toLowerCase();
  const vietate = r.paroleVietate.filter((p) => p && minuscolo.includes(p.toLowerCase()));
  if (vietate.length) problemi.push(`parole vietate usate: ${vietate.join(', ')}`);

  if (!a.apertura.trim()) problemi.push('manca l\'apertura');

  return { ok: problemi.length === 0, problemi, inventati };
}

// =====================================================================
// Il ripiego
// =====================================================================

/**
 * L'anteprima senza modello: asciutta, ma completa e sempre corretta.
 *
 * Non deve essere brillante, deve partire. Se Gemini non risponde di
 * giovedì sera il gruppo riceve comunque l'annuncio con dentro tutto quello
 * che serve per giocare — ed è per costruzione impossibile che citi un
 * numero che non le abbiamo dato.
 */
export function anteprimaDiRipiego(r: RichiestaAnteprima): Anteprima {
  const capo = r.classifica[0];
  const guida = r.tipster[0];

  return {
    apertura: `Le quote della giornata ${r.giornata} sono in lavagna: si può giocare.`
      + (capo ? ` In testa al campionato ${capo.nome} con ${capo.punti} punti.` : ''),
    classifica: capo
      ? `Comanda ${capo.nome} con ${capo.punti} punti; chiude `
        + `${r.classifica[r.classifica.length - 1].nome} a `
        + `${r.classifica[r.classifica.length - 1].punti}.`
      : '',
    sfide: r.sfide.map((s) => ({
      fixtureId: s.fixtureId,
      testo: s.favorita
        ? `Le quote danno avanti ${s.favorita} a ${quota(s.quotaFavorita)}, col pari a ${quota(s.quotaPari)}.`
        : 'Sfida senza quote.',
    })),
    chiusura: guida
      ? `Nel Torneo dei Tipster guida ${guida.nome} con ${punti(guida.punti)} punti.`
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
  ];

  if (r.classifica.length) {
    righe.push('', '📊 COME SIAMO MESSI', '',
      r.classifica.map((c) => `${c.posizione}. ${c.nome} ${punti(c.punti)}`).join(' · '));
    if (a.classifica) righe.push('', a.classifica);
  }

  const blocco = (s: SfidaDaPresentare) => {
    const testo = a.sfide.find((x) => x.fixtureId === s.fixtureId)?.testo;
    if (!testo) return;
    const e = etichettaScontro(s.scontro);
    righe.push(
      '',
      `⚽ ${s.casa} – ${s.ospite}`,
      s.favorita
        ? `   favorita: ${s.favorita} @ ${quota(s.quotaFavorita)}${e ? ` · ${e}` : ''}`
        : (e ? `   ${e}` : '   quote non disponibili'),
      '',
      testo,
    );
  };

  const campionato = r.sfide.filter((s) => s.competizione !== 'coppa');
  const coppa = r.sfide.filter((s) => s.competizione === 'coppa');

  if (campionato.length) {
    if (coppa.length) righe.push('', '📅 CAMPIONATO');
    campionato.forEach(blocco);
  }
  if (coppa.length) {
    righe.push('', RIGA, '🥇 COPPA MANSARDA');
    coppa.forEach(blocco);
  }

  if (r.tipster.length) {
    righe.push('', '🎯 TORNEO DEI TIPSTER', '',
      r.tipster.map((t) => `${t.posizione}. ${t.nome} ${punti(t.punti)}`).join(' · '));
  }

  if (a.chiusura) righe.push('', a.chiusura);
  righe.push('', `🔒 Si gioca fino a ${r.chiusura}`);

  return righe.join('\n');
}
