/**
 * Listone e rose da Leghe Fantacalcio — la traduzione, senza rete.
 *
 * Due risposte dell'API, le stesse che usa il sito:
 *  - `GET /onboarding/v1/league/players`: il listone della lega, un oggetto
 *    con la chiave `players` (non un array nudo). Per giocatore: `id` (lo
 *    stesso id di fantacalcio.it e del nostro `ext_id`), `name`, `stnme` (la
 *    sigla del club, «ROM»), `quotd` (la quotazione), `fcrle` (il ruolo
 *    Classic: 1 P, 2 D, 3 C, 4 A).
 *  - `GET /onboarding/v1/league/teams`: le squadre, ognuna con la rosa in
 *    due stringhe separate da `;` e appaiate per posizione: `cal` gli id dei
 *    giocatori, `cs` quanto sono costati.
 *
 * I nomi dei campi li ha misurati sul campo Leffettore/fantabot (MIT). Qui
 * si traduce nella forma dell'export «Lista calciatori» (`ListonePlayer`),
 * così il resto — anteprima, confronto, scrittura — è lo stesso dell'import
 * da file. Quello che l'API non dice (il «fuori lista») resta com'è nel
 * nostro database.
 */

import type { ListonePlayer } from '@/lib/listone';
import type { Role } from '@/lib/rules';
import { stessoClub } from '@/lib/fonti/pagine';

export interface GiocatoreApi {
  id?: number | string;
  name?: string;
  stnme?: string;
  quotd?: number | string | null;
  fcrle?: number | string | null;
}

export interface SquadraApi {
  id?: number | string;
  n?: string;
  cal?: string | null;
  cs?: string | null;
  /** crediti rimasti */
  cr?: number | string | null;
}

/** Quello che sappiamo già di un giocatore: serve quando l'API tace. */
export interface GiocatoreNostroListone {
  extId: string;
  name: string;
  role: Role;
  club: string;
  quotation: number;
  outOfList: boolean;
}

const RUOLO_CLASSIC: Record<number, Role> = { 1: 'P', 2: 'D', 3: 'C', 4: 'A' };

/** Sotto questi numeri la risposta è monca o è cambiata: non si scrive niente. */
export const MINIMO_LISTONE = 400;

function intero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function lista(s: string | null | undefined): string[] {
  return (s ?? '').split(';').map((x) => x.trim()).filter(Boolean);
}

/** «Martinez L.» → «MARTINEZ L.», come li scrive l'export della lega. */
function nome(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

export interface Traduzione {
  giocatori: ListonePlayer[];
  /** le squadre della lega che nel nostro database non ci sono */
  squadreSconosciute: string[];
  /** quante squadre hanno una rosa (prima dell'asta nessuna) */
  conRosa: number;
  /** i crediti rimasti di ogni nostra squadra secondo la lega, se li dice */
  crediti: Map<string, number>;
  problemi: string[];
}

/**
 * Le due risposte, tradotte nell'export della lega.
 *
 * `nostri` è il listone attuale: ne vengono il «fuori lista» e, per chi
 * l'API non descrive del tutto, ruolo, club e quotazione. `squadre` sono i
 * nomi delle nostre squadre: quelli della lega si agganciano senza badare a
 * maiuscole e spazi, e si riportano scritti come da noi.
 * `quotazioni` (facoltativo) sono le quotazioni lette da fantacalcio.it, per
 * il ruolo di chi la lega non dice.
 */
export function traduciListoneERose(
  pool: { players?: GiocatoreApi[] } | null | undefined,
  teams: SquadraApi[],
  nostri: GiocatoreNostroListone[],
  squadre: string[],
  quotazioni: Map<string, { ruolo: Role | null }> = new Map(),
): Traduzione {
  const problemi: string[] = [];
  const perId = new Map(nostri.map((g) => [g.extId, g]));
  const clubNostri = [...new Set(nostri.map((g) => g.club))];
  const club = (sigla: string, prima: string | undefined) => {
    if (prima && stessoClub(prima, sigla)) return prima;
    return clubNostri.find((c) => stessoClub(c, sigla)) ?? (sigla || prima || '—');
  };

  // chi è in rosa e a quanto, dalle squadre
  const chiaveSquadra = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nostraSquadra = new Map(squadre.map((s) => [chiaveSquadra(s), s]));
  const inRosa = new Map<string, { teamName: string; price: number }>();
  const squadreSconosciute: string[] = [];
  const crediti = new Map<string, number>();
  let conRosa = 0;
  for (const t of teams) {
    const nomeLega = String(t.n ?? t.id ?? '').trim();
    const ids = lista(t.cal);
    const costi = lista(t.cs);
    if (ids.length !== costi.length) {
      problemi.push(`${nomeLega}: ${ids.length} giocatori ma ${costi.length} prezzi, rosa non leggibile`);
      continue;
    }
    const teamName = nostraSquadra.get(chiaveSquadra(nomeLega));
    const cr = intero(t.cr);
    if (teamName && cr != null) crediti.set(teamName, cr);
    if (!ids.length) continue;
    conRosa++;
    if (!teamName) { squadreSconosciute.push(nomeLega); continue; }
    ids.forEach((id, i) => inRosa.set(id, { teamName, price: Number(costi[i]) || 0 }));
  }

  const giocatori: ListonePlayer[] = [];
  const visti = new Set<string>();
  for (const p of pool?.players ?? []) {
    const extId = p.id == null ? '' : String(p.id);
    if (!extId || visti.has(extId) || !p.name) continue;
    visti.add(extId);
    const prima = perId.get(extId);
    const role = RUOLO_CLASSIC[intero(p.fcrle) ?? 0] ?? prima?.role ?? quotazioni.get(extId)?.ruolo ?? null;
    if (!role) { problemi.push(`${p.name}: ruolo sconosciuto, saltato`); continue; }
    const rosa = inRosa.get(extId);
    giocatori.push({
      extId,
      name: nome(p.name),
      role,
      club: club(String(p.stnme ?? '').trim(), prima?.club),
      quotation: Math.max(1, intero(p.quotd) ?? prima?.quotation ?? 1),
      outOfList: prima?.outOfList ?? false,
      teamName: rosa?.teamName ?? null,
      price: rosa ? rosa.price : null,
    });
  }

  // uno in rosa che il listone della lega non ha: la rosa non torna, meglio dirlo
  const mancanti = [...inRosa.keys()].filter((id) => !visti.has(id));
  if (mancanti.length) {
    problemi.push(`${mancanti.length} giocatori in rosa che il listone della lega non riporta (id ${mancanti.slice(0, 5).join(', ')}${mancanti.length > 5 ? '…' : ''})`);
  }
  if (giocatori.length < MINIMO_LISTONE) {
    problemi.push(`il listone della lega ha solo ${giocatori.length} giocatori: la risposta è incompleta o è cambiata`);
  }
  return { giocatori, squadreSconosciute, conRosa, crediti, problemi };
}

// =====================================================================
// la copia delle rose
// =====================================================================

/** Un contratto aperto da noi, nella forma che serve al confronto. */
export interface ContrattoNostro {
  contractId: string;
  extId: string;
  nome: string;
  teamName: string;
  price: number;
}

export interface Differenze {
  /** in rosa nella lega, non da noi (o da noi in un'altra squadra: allora è anche in `escono`) */
  entrano: { extId: string; nome: string; teamName: string; price: number }[];
  /** in rosa da noi, non nella lega (o nella lega in un'altra squadra) */
  escono: { contractId: string; extId: string; nome: string; teamName: string; price: number }[];
  /** stessa squadra, costo diverso */
  costi: { contractId: string; extId: string; nome: string; teamName: string; da: number; a: number }[];
  /** crediti diversi da quelli della lega */
  crediti: { teamName: string; da: number; a: number }[];
  /** quante cose cambierebbero, in tutto */
  totale: number;
}

/**
 * Cosa cambiare perché le nostre rose siano quelle della lega: chi c'è, a
 * che costo, con quanti crediti. Nessuna operazione di mercato: un giocatore
 * che non è più in rosa esce senza rimborso e senza consumare un cambio,
 * perché i crediti si copiano dalla lega così come sono.
 */
export function differenzeRose(
  nostri: ContrattoNostro[],
  lega: ListonePlayer[],
  creditiNostri: Map<string, number>,
  creditiLega: Map<string, number>,
): Differenze {
  const voluti = new Map(lega.filter((p) => p.teamName).map((p) => [p.extId, p]));
  const attuali = new Map(nostri.map((c) => [c.extId, c]));
  const d: Differenze = { entrano: [], escono: [], costi: [], crediti: [], totale: 0 };

  for (const c of nostri) {
    const v = voluti.get(c.extId);
    if (!v || v.teamName !== c.teamName) {
      d.escono.push({ contractId: c.contractId, extId: c.extId, nome: c.nome, teamName: c.teamName, price: c.price });
    } else if ((v.price ?? 0) !== c.price) {
      d.costi.push({ contractId: c.contractId, extId: c.extId, nome: c.nome, teamName: c.teamName, da: c.price, a: v.price ?? 0 });
    }
  }
  for (const v of voluti.values()) {
    const c = attuali.get(v.extId);
    if (!c || c.teamName !== v.teamName) {
      d.entrano.push({ extId: v.extId, nome: v.name, teamName: v.teamName!, price: v.price ?? 0 });
    }
  }
  for (const [teamName, a] of creditiLega) {
    const da = creditiNostri.get(teamName);
    if (da != null && da !== a) d.crediti.push({ teamName, da, a });
  }
  d.totale = d.entrano.length + d.escono.length + d.costi.length + d.crediti.length;
  return d;
}
