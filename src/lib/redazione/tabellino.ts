/**
 * La Redazione — dal payload del bookmarklet al tabellino.
 *
 * Funzioni pure, nessun accesso al database: entra quello che ha mandato il
 * browser, esce quello che va scritto, oppure un errore che dice cosa non
 * torna.
 *
 * La regola che governa tutto: **quello che arriva dal browser non si crede
 * sulla parola.** Il bookmarklet manda anche i conti che ha fatto lui, ma qui
 * si rifanno da zero sui giocatori e si confrontano con il totale scritto
 * dalla lega. Se non coincidono, l'import si ferma: meglio nessun dato che un
 * tabellino sbagliato, perché sul tabellino sbagliato ci costruiamo le
 * notizie e le classifiche.
 */

export type Ruolo = 'P' | 'D' | 'C' | 'A';
export type Fascia = 'C' | 'V';

export interface GiocatoreGrezzo {
  extId: string | null;
  nome: string;
  ruolo: Ruolo | null;
  titolare: boolean;
  ordine: number;
  voto: number | null;
  fantavoto: number | null;
  fascia: Fascia | null;
  eventi: Record<string, number>;
}

export interface SquadraGrezza {
  nome: string;
  allenatore: string;
  gol: number;
  modulo: string | null;
  fantapunti: number | null;
  soloVoti: number | null;
  modificatore: number;
  bonusCapitano: number;
  inviataIl: string | null;
  giocatori: GiocatoreGrezzo[];
}

export interface SfidaGrezza {
  indice: number;
  dati: { casa: SquadraGrezza; ospite: SquadraGrezza } | { errore: string };
  testo?: string;
}

export interface PayloadImport {
  lega: string;
  competizione: string | null;
  giornata: number | null;
  raccoltoIl: string;
  versioneEstrattore: number;
  sfide: SfidaGrezza[];
}

/** Quante sostituzioni concede il regolamento del Classico. */
export const MAX_SOSTITUZIONI = 3;
const EPS = 0.01;

// =====================================================================
// 1 · validazione della forma
// =====================================================================

export type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

function eNumero(x: unknown): x is number { return typeof x === 'number' && Number.isFinite(x); }

export function validaPayload(x: unknown): Esito<PayloadImport> {
  if (!x || typeof x !== 'object') return { ok: false, errore: 'payload non è un oggetto' };
  const p = x as Record<string, unknown>;
  if (typeof p.lega !== 'string' || !p.lega) return { ok: false, errore: 'manca l\'alias della lega' };
  if (!Array.isArray(p.sfide) || !p.sfide.length) return { ok: false, errore: 'nessuna sfida nel payload' };
  if (p.giornata != null && !eNumero(p.giornata)) return { ok: false, errore: 'giornata non numerica' };
  if (p.sfide.length > 12) return { ok: false, errore: 'troppe sfide: ' + p.sfide.length };

  for (const s of p.sfide as unknown[]) {
    if (!s || typeof s !== 'object') return { ok: false, errore: 'sfida malformata' };
    const d = (s as Record<string, unknown>).dati;
    if (!d || typeof d !== 'object') return { ok: false, errore: 'sfida senza dati' };
    if ('errore' in (d as object)) continue;               // ammessa: la segnaliamo dopo
    for (const lato of ['casa', 'ospite'] as const) {
      const q = (d as Record<string, unknown>)[lato] as Record<string, unknown> | undefined;
      if (!q) return { ok: false, errore: `sfida senza ${lato}` };
      if (typeof q.nome !== 'string' || !q.nome) return { ok: false, errore: `${lato} senza nome` };
      if (!Array.isArray(q.giocatori) || q.giocatori.length < 11) {
        return { ok: false, errore: `${q.nome}: solo ${(q.giocatori as unknown[])?.length ?? 0} giocatori` };
      }
    }
  }
  return { ok: true, valore: x as unknown as PayloadImport };
}

// =====================================================================
// 2 · chi è sceso in campo davvero
// =====================================================================

export interface Subentro { dentro: GiocatoreGrezzo; alPostoDi: GiocatoreGrezzo }

export interface Formazione {
  titolari: GiocatoreGrezzo[];
  panchina: GiocatoreGrezzo[];
  subentrati: Subentro[];
  /** titolari senza voto che nessuno ha rilevato: la squadra gioca in dieci */
  inDieci: GiocatoreGrezzo[];
  scesiInCampo: GiocatoreGrezzo[];
  atteso: number | null;
  calcolato: number;
  quadra: boolean | null;
  scarto: number | null;
}

/**
 * Le sostituzioni del Classico: un titolare senza voto lo rileva il primo
 * panchinaro **dello stesso ruolo** che ha preso voto, seguendo l'ordine
 * della panchina. Se quel ruolo in panchina è esaurito o è tutto senza voto,
 * il posto resta vuoto e si gioca in dieci.
 *
 * Non si cerca la combinazione che fa quadrare il totale: due panchinari con
 * lo stesso fantavoto danno la stessa somma, e si finirebbe per nominare
 * quello sbagliato — un errore invisibile che poi finisce dentro una notizia.
 */
export function ricostruisci(squadra: SquadraGrezza, maxSostituzioni = MAX_SOSTITUZIONI): Formazione {
  const titolari = squadra.giocatori.filter((g) => g.titolare);
  const panchina = squadra.giocatori.filter((g) => !g.titolare);

  const usati = new Set<GiocatoreGrezzo>();
  const subentrati: Subentro[] = [];
  const inDieci: GiocatoreGrezzo[] = [];

  for (const t of titolari) {
    if (t.fantavoto != null) continue;
    if (subentrati.length >= maxSostituzioni) { inDieci.push(t); continue; }
    const scelto = panchina.find(
      (p) => !usati.has(p) && p.ruolo === t.ruolo && p.fantavoto != null,
    );
    if (scelto) { usati.add(scelto); subentrati.push({ dentro: scelto, alPostoDi: t }); }
    else inDieci.push(t);
  }

  const scesiInCampo = titolari.filter((g) => g.fantavoto != null)
    .concat(subentrati.map((s) => s.dentro));

  const somma = scesiInCampo.reduce((s, g) => s + (g.fantavoto ?? 0), 0);
  const calcolato = arrotonda(somma + squadra.modificatore + squadra.bonusCapitano);
  const atteso = squadra.fantapunti;

  return {
    titolari, panchina, subentrati, inDieci, scesiInCampo,
    atteso, calcolato,
    quadra: atteso == null ? null : Math.abs(calcolato - atteso) < EPS,
    scarto: atteso == null ? null : arrotonda(calcolato - atteso),
  };
}

function arrotonda(n: number): number { return Math.round(n * 100) / 100; }

// =====================================================================
// 3 · gli eventi, con i nostri nomi
// =====================================================================

/**
 * Le chiavi che la lega mette sulle icone. Quelle che non conosciamo non si
 * buttano: finiscono in `altri`, così quando la lega ne aggiunge una la
 * vediamo invece di perderla in silenzio.
 */
const EVENTI: Record<string, string> = {
  scoredGoals: 'gol',
  decisiveGoals: 'golVittoria',
  ownGoals: 'autogol',
  assists: 'assist',
  softAssists: 'assistSoft',
  yellowCards: 'ammonizioni',
  redCards: 'espulsioni',
  cleanSheets: 'portaInviolata',
  concededGoals: 'golSubiti',
  savedPenalties: 'rigoriParati',
  scoredPenalties: 'rigoriSegnati',
  missedPenalties: 'rigoriSbagliati',
};

export interface Bonus { [chiave: string]: number | Record<string, number> }

export function traduciEventi(eventi: Record<string, number>): Bonus {
  const fuori: Bonus = {};
  const altri: Record<string, number> = {};
  for (const [k, v] of Object.entries(eventi || {})) {
    if (EVENTI[k]) fuori[EVENTI[k]] = v;
    else altri[k] = v;
  }
  if (Object.keys(altri).length) fuori.altri = altri;
  return fuori;
}

// =====================================================================
// 4 · le righe da scrivere
// =====================================================================

export interface RigaTabellino {
  slot: number;
  playerName: string;
  extId: string | null;
  role: Ruolo | null;
  starter: boolean;
  entered: boolean;
  isCaptain: boolean;
  voto: number | null;
  fantavoto: number | null;
  bonus: Bonus;
  counted: boolean;
}

/**
 * I titolari prendono gli slot 1..11, la panchina dal 101 in su: numeri
 * stabili, così reimportare la stessa giornata aggiorna le righe invece di
 * aggiungerne di nuove.
 */
export function righeTabellino(squadra: SquadraGrezza, f: Formazione): RigaTabellino[] {
  const entrati = new Set(f.subentrati.map((s) => s.dentro));
  const inCampo = new Set(f.scesiInCampo);

  return squadra.giocatori.map((g) => ({
    slot: g.titolare ? g.ordine + 1 : 101 + g.ordine,
    playerName: g.nome,
    extId: g.extId,
    role: g.ruolo,
    starter: g.titolare,
    entered: entrati.has(g),
    isCaptain: g.fascia === 'C',
    voto: g.voto,
    fantavoto: g.fantavoto,
    bonus: traduciEventi(g.eventi),
    counted: inCampo.has(g),
  }));
}

// =====================================================================
// 5 · l'ora di invio della formazione
// =====================================================================

/**
 * "28/08/2026 20:04:23" → ISO. La lega scrive l'ora italiana; d'estate
 * siamo a +02:00, d'inverno a +01:00, e sbagliare di un'ora conta perché su
 * quell'orario si costruisce lo spunto della formazione mandata all'ultimo.
 */
export function oraInvio(testo: string | null): string | null {
  if (!testo) return null;
  const m = testo.match(/(\d{2})\/(\d{2})\/(\d{4})[, ]+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, gg, mm, aaaa, h, min, s] = m;
  const finto = Date.UTC(+aaaa, +mm - 1, +gg, +h, +min, +s);
  // l'offset di Roma per quell'istante, senza dipendenze esterne
  const offset = offsetRoma(new Date(finto));
  return new Date(finto - offset * 60000).toISOString();
}

function offsetRoma(quando: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of f.formatToParts(quando)) p[type] = value;
  const locale = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (locale - quando.getTime()) / 60000;
}

// =====================================================================
// 6 · il verdetto su una sfida
// =====================================================================

export interface SfidaVerificata {
  indice: number;
  casa: SquadraGrezza;
  ospite: SquadraGrezza;
  formazioneCasa: Formazione;
  formazioneOspite: Formazione;
  quadra: boolean;
  problemi: string[];
}

export function verificaSfida(s: SfidaGrezza, maxSostituzioni = MAX_SOSTITUZIONI): Esito<SfidaVerificata> {
  if ('errore' in s.dati) return { ok: false, errore: s.dati.errore };
  const { casa, ospite } = s.dati;
  const fc = ricostruisci(casa, maxSostituzioni);
  const fo = ricostruisci(ospite, maxSostituzioni);

  const problemi: string[] = [];
  for (const [sq, f] of [[casa, fc], [ospite, fo]] as const) {
    if (f.atteso == null) problemi.push(`${sq.nome}: la lega non dà il totale`);
    else if (!f.quadra) problemi.push(`${sq.nome}: calcolo ${f.calcolato}, la lega dice ${f.atteso} (scarto ${f.scarto})`);
    if (f.titolari.length !== 11) problemi.push(`${sq.nome}: ${f.titolari.length} titolari invece di 11`);
    if (!sq.giocatori.some((g) => g.fascia === 'C')) problemi.push(`${sq.nome}: nessun capitano`);
  }

  return {
    ok: true,
    valore: {
      indice: s.indice, casa, ospite,
      formazioneCasa: fc, formazioneOspite: fo,
      quadra: fc.quadra === true && fo.quadra === true,
      problemi,
    },
  };
}
