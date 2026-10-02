/**
 * Quotazioni e voti di Serie A — la lettura delle pagine di fantacalcio.it.
 *
 * Qui, a differenza degli indisponibili, si legge l'HTML e non il testo: le
 * due pagine sono tabelle di numeri, e nel testo nudo un «38» non dice se è
 * la quotazione attuale, quella iniziale o la differenza. Le classi e i
 * `data-col-key` delle celle invece lo dicono, e sono quelli che la pagina
 * usa per i suoi filtri: cambiano molto più di rado dell'impaginazione.
 *
 * Funzioni pure, nessuna rete e nessun database: chi va a prendere le
 * pagine è `fontiServer.ts`.
 */

import type { Role } from '@/lib/rules';

// =====================================================================
// attrezzi
// =====================================================================

const ENTITA: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", rsquo: "'", lsquo: "'",
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', lt: '<', gt: '>',
};

export function decodifica(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITA[n] ?? m);
}

/** Il testo dentro un pezzo di HTML, spazi compresi in uno. */
export function testo(html: string): string {
  return decodifica(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * I pezzi di HTML che iniziano con un tag che ha quella classe, fino al
 * successivo dello stesso tipo. Non è un parser vero, e non serve: le righe
 * di queste tabelle non si annidano fra loro.
 */
function blocchi(html: string, tag: string, classe: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`, 'gi');
  const inizi: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) inizi.push(m.index);
  return inizi.map((i, k) => {
    const fine = k + 1 < inizi.length ? inizi[k + 1] : html.length;
    const pezzo = html.slice(i, fine);
    const chiusura = pezzo.search(new RegExp(`</${tag}>`, 'i'));
    // il blocco si chiude al suo tag di chiusura, se è prima del prossimo
    // inizio; per i contenitori (`li` con dentro una tabella) si tiene tutto
    return tag === 'tr' && chiusura > 0 ? pezzo.slice(0, chiusura) : pezzo;
  });
}

/** Il contenuto della prima cella con quella classe o quel `data-col-key`. */
function cella(riga: string, ...chiavi: string[]): string | null {
  for (const k of chiavi) {
    const re = new RegExp(
      `<(td|th)\\b[^>]*(?:data-col-key="${k}"|class="[^"]*\\b${k}\\b[^"]*")[^>]*>([\\s\\S]*?)</\\1>`, 'i',
    );
    const m = riga.match(re);
    if (m) return m[2];
  }
  return null;
}

function numero(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = testo(s).replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const RUOLI: Record<string, Role> = { p: 'P', d: 'D', c: 'C', a: 'A' };

/** Il ruolo Classic: lo `span.role` che non è quello del Mantra. */
function ruolo(riga: string): Role | null {
  const re = /<span\b[^>]*class="([^"]*)"[^>]*data-value="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(riga))) {
    const classi = m[1].split(/\s+/);
    if (classi.includes('role') && !classi.includes('role-mantra')) {
      return RUOLI[m[2].toLowerCase()] ?? null;
    }
  }
  return null;
}

export interface LinkGiocatore {
  /** l'id di fantacalcio.it, l'ultima parte dell'indirizzo */
  extId: string;
  /** il club come compare nell'indirizzo: «inter», «hellas-verona» */
  clubSlug: string;
  nome: string;
}

/** Il link al giocatore: `/serie-a/squadre/<club>/<nome>/<id>`. */
function linkGiocatore(riga: string): LinkGiocatore | null {
  const m = riga.match(
    /<a\b[^>]*href="[^"]*\/squadre\/([^/"]+)\/[^/"]+\/(\d+)\/?"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (!m) return null;
  const nome = testo(m[3]);
  if (!nome) return null;
  return { clubSlug: m[1].toLowerCase(), extId: m[2], nome };
}

// =====================================================================
// le quotazioni
// =====================================================================

export interface RigaQuotazione extends LinkGiocatore {
  ruolo: Role | null;
  /** come lo scrive la colonna della squadra: di solito la sigla, «INT» */
  club: string;
  qtIniziale: number | null;
  qtAttuale: number;
  fvm: number | null;
}

/**
 * Dalla pagina delle quotazioni alle righe.
 *
 * Una riga senza link al giocatore o senza quotazione attuale si scarta: è
 * un'intestazione, una pubblicità in mezzo alla tabella, o una pagina
 * cambiata. In quel caso il numero di righe crolla e chi raccoglie lo dice.
 */
export function leggiQuotazioni(html: string): RigaQuotazione[] {
  const esito: RigaQuotazione[] = [];
  const visti = new Set<string>();
  for (const riga of blocchi(html, 'tr', 'player-row')) {
    const link = linkGiocatore(riga);
    if (!link || visti.has(link.extId)) continue;
    const qa = numero(cella(riga, 'c_qa', 'player-classic-current-price'));
    if (qa == null) continue;
    visti.add(link.extId);
    esito.push({
      ...link,
      ruolo: ruolo(riga),
      club: testo(cella(riga, 'sq', 'player-team') ?? '') || link.clubSlug,
      qtIniziale: numero(cella(riga, 'c_qi', 'player-classic-initial-price')),
      qtAttuale: qa,
      fvm: numero(cella(riga, 'c_fvm', 'player-classic-fvm')),
    });
  }
  return esito;
}

// =====================================================================
// i voti
// =====================================================================

export interface RigaVoto extends LinkGiocatore {
  ruolo: Role | null;
  club: string;
  /** null = senza voto */
  voto: number | null;
  fantavoto: number | null;
}

export interface PaginaVoti {
  /** la giornata di Serie A, se la pagina la dichiara */
  giornata: number | null;
  /** «2026/27», se la pagina la dichiara */
  stagione: string | null;
  righe: RigaVoto[];
}

/**
 * Un voto plausibile o niente.
 *
 * La pagina a volte mette nei `data-value` numeri senza virgola come «55»
 * che non sono voti (o li maschera a chi non è collegato): meglio un voto
 * in meno che un 55 nella fantamedia di qualcuno.
 */
function voto(s: string | null, min: number, max: number): number | null {
  if (s == null) return null;
  const t = s.trim().replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

function dataValue(riga: string, classe: string): string | null {
  const re = new RegExp(`<[a-z]+\\b[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`, 'i');
  const tag = riga.match(re)?.[0];
  if (!tag) return null;
  const dv = tag.match(/data-value="([^"]*)"/i)?.[1];
  if (dv != null) return dv;
  // senza data-value, il numero mostrato subito dopo il tag
  const dopo = riga.slice(riga.indexOf(tag) + tag.length).match(/^\s*([-\d.,]+)/);
  return dopo?.[1] ?? null;
}

/** La giornata e la stagione: dal titolo, o dall'indirizzo canonico. */
function intestazione(html: string): { giornata: number | null; stagione: string | null } {
  const titolo = testo(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const t = titolo.match(/(\d{1,2})\D{0,6}giornata[\s\S]*?(\d{4})[/-](\d{2})/i);
  if (t) return { giornata: Number(t[1]), stagione: `${t[2]}/${t[3]}` };
  const u = html.match(/voti-fantacalcio-serie-a\/(\d{4})-(\d{2})\/(\d{1,2})/i);
  if (u) return { giornata: Number(u[3]), stagione: `${u[1]}/${u[2]}` };
  return { giornata: null, stagione: null };
}

/**
 * Dalla pagina dei voti di giornata alle righe.
 *
 * La pagina mostra tre fonti di voto per giocatore (Fantacalcio, Statistico,
 * Italia): si prende la prima, che è quella della redazione di
 * fantacalcio.it ed è quella che usa Leghe Fantacalcio.
 */
export function leggiVoti(html: string): PaginaVoti {
  const { giornata, stagione } = intestazione(html);
  const righe: RigaVoto[] = [];
  const visti = new Set<string>();

  for (const squadra of blocchi(html, 'li', 'team-table')) {
    const nomeClub = testo(
      squadra.match(/class="[^"]*\bteam-name\b[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ?? '',
    );
    for (const riga of trDi(squadra)) {
      const link = linkGiocatore(riga);
      if (!link || visti.has(link.extId)) continue;
      visti.add(link.extId);
      righe.push({
        ...link,
        ruolo: ruolo(riga),
        club: nomeClub || link.clubSlug,
        voto: voto(dataValue(riga, 'player-grade'), 0, 10),
        fantavoto: voto(dataValue(riga, 'player-fanta-grade'), -10, 30),
      });
    }
  }
  return { giornata, stagione, righe };
}

/** Le righe di una tabella, qualunque classe abbiano. */
function trDi(html: string): string[] {
  return [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
}

// =====================================================================
// le statistiche di stagione
// =====================================================================

export interface RigaStatistiche extends LinkGiocatore {
  ruolo: Role | null;
  club: string;
  /** partite a voto */
  presenze: number | null;
  mediaVoto: number | null;
  fantamedia: number | null;
  gol: number | null;
  golSubiti: number | null;
  rigoriSegnati: number | null;
  rigoriCalciati: number | null;
  rigoriParati: number | null;
  assist: number | null;
  ammonizioni: number | null;
  espulsioni: number | null;
}

/** «2 / 3» → segnati 2 su 3 calciati. */
function rigori(s: string | null): { segnati: number | null; calciati: number | null } {
  const m = s == null ? null : testo(s).match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? { segnati: Number(m[1]), calciati: Number(m[2]) } : { segnati: null, calciati: null };
}

/**
 * Dalla pagina «Statistiche Serie A» alle righe.
 *
 * Stessa tabella a `tr.player-row` delle quotazioni, con le colonne
 * riconoscibili dal `data-col-key`: pg (partite a voto), mv, mfv
 * (fantamedia), gol, gs, rig («segnati / tirati»), rp, ass, amm, esp.
 * Un giocatore senza partite a voto ha medie vuote: restano null.
 */
export function leggiStatistiche(html: string): RigaStatistiche[] {
  const esito: RigaStatistiche[] = [];
  const visti = new Set<string>();
  for (const riga of blocchi(html, 'tr', 'player-row')) {
    const link = linkGiocatore(riga);
    if (!link || visti.has(link.extId)) continue;
    const presenze = numero(cella(riga, 'pg'));
    if (presenze == null) continue;
    visti.add(link.extId);
    const rig = rigori(cella(riga, 'rig'));
    esito.push({
      ...link,
      ruolo: ruolo(riga),
      club: testo(cella(riga, 'sq', 'player-team') ?? '') || link.clubSlug,
      presenze,
      mediaVoto: voto(testo(cella(riga, 'mv') ?? ''), 0, 10),
      fantamedia: voto(testo(cella(riga, 'mfv') ?? ''), -10, 30),
      gol: numero(cella(riga, 'gol')),
      golSubiti: numero(cella(riga, 'gs')),
      rigoriSegnati: rig.segnati,
      rigoriCalciati: rig.calciati,
      rigoriParati: numero(cella(riga, 'rp')),
      assist: numero(cella(riga, 'ass')),
      ammonizioni: numero(cella(riga, 'amm')),
      espulsioni: numero(cella(riga, 'esp')),
    });
  }
  return esito;
}

// =====================================================================
// l'aggancio ai nostri giocatori
// =====================================================================

export interface GiocatoreNostro {
  id: string;
  extId: string;
  name: string;
  club: string;
}

/** Nome confrontabile: senza accenti, punti, apostrofi e doppi spazi. */
export function chiaveNome(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim();
}

function chiaveClub(club: string): string {
  return club.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Un club della fonte e uno nostro sono lo stesso?
 *
 * La fonte scrive la sigla («INT») nella colonna e il nome nell'indirizzo
 * («hellas-verona»); il listone scrive «Inter», «Verona». Basta che uno dei
 * due stia dentro l'altro, o che le prime tre lettere coincidano.
 */
export function stessoClub(nostro: string, ...fonte: string[]): boolean {
  const n = chiaveClub(nostro);
  if (!n) return false;
  return fonte.some((f) => {
    const x = chiaveClub(f);
    if (!x) return false;
    return x.includes(n) || n.includes(x) || x.slice(0, 3) === n.slice(0, 3);
  });
}

/**
 * Chi è, fra i nostri giocatori, la riga della fonte.
 *
 * Prima l'id, che è lo stesso del listone della lega. Poi il nome, ma solo
 * se non è ambiguo: con due «Martinez» si guarda anche il club, e se
 * resta il dubbio non si aggancia nessuno. Un giocatore non agganciato è
 * un dato in meno; uno agganciato male è un dato sbagliato.
 */
export function agganciatore(nostri: GiocatoreNostro[]) {
  const perId = new Map(nostri.map((g) => [g.extId, g.id]));
  const perNome = new Map<string, GiocatoreNostro[]>();
  for (const g of nostri) {
    const k = chiaveNome(g.name);
    perNome.set(k, [...(perNome.get(k) ?? []), g]);
  }
  return (r: { extId: string; nome: string; clubSlug: string; club: string }): string | null => {
    const daId = perId.get(r.extId);
    if (daId) return daId;
    const candidati = perNome.get(chiaveNome(r.nome)) ?? [];
    const delClub = candidati.filter((g) => stessoClub(g.club, r.club, r.clubSlug));
    if (delClub.length === 1) return delClub[0].id;
    return null;
  };
}
