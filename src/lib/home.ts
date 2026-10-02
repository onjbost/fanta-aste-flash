/**
 * La Home, calcolata: la prossima partita della squadra in campionato e in
 * coppa, la forma delle ultime cinque, i precedenti fra due squadre e le
 * quattro scadenze. Funzioni pure su dati già letti — la lettura sta in
 * `homeServer.ts`, il disegno nei componenti.
 */

export type Competizione = 'campionato' | 'coppa';
export type Esito = 'V' | 'N' | 'P';

export interface Partita {
  id: string;
  competition: Competizione;
  phase: 'regular' | 'gruppi' | 'semifinale' | 'finale';
  groupName: 'A' | 'B' | null;
  round: number;
  serieA: number;
  /** numero della giornata del fanta; null dove il fanta non gioca */
  fanta: number | null;
  /** il calcio d'inizio della prima partita vera della giornata */
  kickoff: string;
  homeId: string | null;
  awayId: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
}

const giocata = (p: Partita) => p.homeGoals !== null && p.awayGoals !== null;
const tocca = (p: Partita, teamId: string) => p.homeId === teamId || p.awayId === teamId;
const perData = (a: Partita, b: Partita) => Date.parse(a.kickoff) - Date.parse(b.kickoff);

/** Vinta, pari o persa per quella squadra; null se non è ancora giocata. */
export function esitoPer(p: Partita, teamId: string): Esito | null {
  if (!giocata(p) || !tocca(p, teamId)) return null;
  const miei = p.homeId === teamId ? p.homeGoals! : p.awayGoals!;
  const loro = p.homeId === teamId ? p.awayGoals! : p.homeGoals!;
  return miei > loro ? 'V' : miei < loro ? 'P' : 'N';
}

/**
 * La prossima partita della squadra in una competizione.
 *
 * Solo partite con entrambe le squadre decise: una semifinale ancora vuota
 * non è «la prossima partita», è un posto da conquistare.
 */
export function prossimaPartita(lista: Partita[], teamId: string, comp: Competizione): Partita | null {
  return lista
    .filter((p) => p.competition === comp && !giocata(p) && tocca(p, teamId) && p.homeId && p.awayId)
    .sort(perData)[0] ?? null;
}

/**
 * Le ultime `quante` giocate dalla squadra, dalla più recente.
 * Con `comp` solo quella competizione: la forma in coppa non è quella in
 * campionato, e il foglio le mostra ciascuna sulla sua slide.
 */
export function formaUltime(lista: Partita[], teamId: string, quante = 5, comp?: Competizione): Esito[] {
  return lista
    .filter((p) => giocata(p) && tocca(p, teamId) && (!comp || p.competition === comp))
    .sort((a, b) => perData(b, a))
    .slice(0, quante)
    .map((p) => esitoPer(p, teamId)!);
}

/** Gli scontri diretti già giocati fra due squadre, dal più recente; con `comp` solo in quella competizione. */
export function precedenti(lista: Partita[], a: string, b: string, comp?: Competizione): Partita[] {
  return lista
    .filter((p) => giocata(p) && tocca(p, a) && tocca(p, b) && (!comp || p.competition === comp))
    .sort((x, y) => perData(y, x));
}

export interface GiornataStorica { chiave: string; titolo: string; partite: Partita[] }

/**
 * Lo storico di una competizione: tutte le partite giocate, di tutte le
 * squadre, raggruppate per giornata (o per turno e girone in coppa), dalla
 * giornata più recente. Dentro la giornata l'ordine è quello del calendario.
 */
export function storicoCompetizione(lista: Partita[], comp: Competizione): GiornataStorica[] {
  const gruppi = new Map<string, GiornataStorica & { quando: number }>();
  for (const p of lista) {
    if (p.competition !== comp || !giocata(p)) continue;
    const chiave = `${p.serieA}|${p.phase}|${p.groupName ?? ''}|${p.round}`;
    const g = gruppi.get(chiave) ?? { chiave, titolo: titoloPartita(p), partite: [], quando: Date.parse(p.kickoff) };
    g.partite.push(p);
    gruppi.set(chiave, g);
  }
  return [...gruppi.values()]
    .sort((a, b) => b.quando - a.quando || a.titolo.localeCompare(b.titolo))
    .map(({ chiave, titolo, partite }) => ({ chiave, titolo, partite }));
}

/** «6ª giornata», «Girone A · 3° turno», «Semifinale». */
export function titoloPartita(p: Partita): string {
  if (p.competition === 'campionato') return `${p.fanta ?? p.serieA}ª giornata`;
  if (p.phase === 'semifinale') return 'Semifinale';
  if (p.phase === 'finale') return 'Finale';
  return p.groupName ? `Girone ${p.groupName} · ${p.round}° turno` : `${p.round}° turno`;
}

// ------------------------------------------------------------- scadenze

export type ChiaveScadenza = 'chiamate' | 'adesioni' | 'formazione' | 'schedine';

export interface Scadenza {
  chiave: ChiaveScadenza;
  titolo: string;
  /** ISO; null se non c'è una scadenza aperta da mostrare */
  quando: string | null;
  /** la più vicina fra quelle aperte: è quella che la Home accende */
  prossima: boolean;
}

export interface GiornataPerScadenze {
  firstKickoffAt: string;
  lockAt: string;
  fanta: number | null;
}

const MINUTI_FORMAZIONE = 15;

/**
 * Le quattro tessere delle scadenze, sempre nello stesso ordine.
 *
 * L'ordine non segue l'urgenza di proposito: le tessere stanno ferme, così
 * l'occhio sa dove trovare ciascuna. L'urgenza la dice la tessera accesa.
 *
 * La formazione si mette su Leghe Fantacalcio: qui è un promemoria, un quarto
 * d'ora prima della prima partita della giornata in cui il fanta gioca.
 */
export function scadenzeDellaHome({ ora, asta, giornate, giorniChiamate, giorniAdesioni }: {
  ora: Date;
  asta: { number: number; auctionAt: string; status: string } | null;
  giornate: GiornataPerScadenze[];
  giorniChiamate: number;
  giorniAdesioni: number;
}): Scadenza[] {
  const t = ora.getTime();
  const futura = (d: Date | null) => (d && d.getTime() > t ? d.toISOString() : null);
  const meno = (iso: string, giorni: number) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() - giorni);
    return d;
  };

  const astaAperta = asta && !['live', 'closed'].includes(asta.status) ? asta : null;
  const delFanta = giornate
    .filter((g) => g.fanta !== null)
    .sort((a, b) => Date.parse(a.firstKickoffAt) - Date.parse(b.firstKickoffAt));
  const formazione = delFanta
    .map((g) => new Date(Date.parse(g.firstKickoffAt) - MINUTI_FORMAZIONE * 60_000))
    .find((d) => d.getTime() > t) ?? null;
  const schedine = delFanta.map((g) => new Date(g.lockAt)).find((d) => d.getTime() > t) ?? null;

  const numero = astaAperta ? ` · #${astaAperta.number}` : '';
  const lista: Scadenza[] = [
    { chiave: 'chiamate', titolo: `Chiamate${numero}`, quando: futura(astaAperta ? meno(astaAperta.auctionAt, giorniChiamate) : null), prossima: false },
    { chiave: 'adesioni', titolo: `Adesioni${numero}`, quando: futura(astaAperta ? meno(astaAperta.auctionAt, giorniAdesioni) : null), prossima: false },
    { chiave: 'formazione', titolo: 'Formazione', quando: futura(formazione), prossima: false },
    { chiave: 'schedine', titolo: 'Schedine', quando: futura(schedine), prossima: false },
  ];

  const aperte = lista.filter((s) => s.quando);
  if (aperte.length) {
    const prima = aperte.reduce((a, b) => (Date.parse(a.quando!) <= Date.parse(b.quando!) ? a : b));
    prima.prossima = true;
  }
  return lista;
}
