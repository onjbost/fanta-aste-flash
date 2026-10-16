/**
 * Il calendario di Serie A — la lettura di fantacalcio.it/serie-a/calendario/N.
 *
 * Il live elenca solo le partite già cominciate: per sapere quando apre la
 * giornata che viene (e quindi quando chiudono schedine e formazioni) serve
 * la pagina del calendario, che ha orari, anticipi e posticipi di adesso.
 *
 * Ogni partita è un `SportsEvent` di schema.org: squadre nei `meta` di
 * `homeTeam`/`awayTeam`, la data nel `meta startDate` e l'ora in
 * `span.hours`, l'una e l'altra all'ora di Roma. Lo stato sta in
 * `data-match-status`, con gli stessi numeri del live (4 finita, 6 rinviata).
 *
 * La pagina mostra anche, in un riquadro, la giornata in corso: le partite
 * si tengono solo se il loro `div.matchweek` è quella chiesta.
 *
 * Funzioni pure, nessuna rete e nessun database.
 */

import { decodifica } from './pagine';

export interface PartitaCalendarioPagina {
  teamHome: string;
  teamAway: string;
  /** stesso significato del live: 0 da giocare, 4 finita, 6 rinviata */
  status: number;
  /** calcio d'inizio in millisecondi, 0 se la pagina non dà l'orario */
  matchDate: number;
}

/** Durata presunta di una partita, recuperi compresi: per la fine dell'ultima. */
export const DURATA_PARTITA_MS = 115 * 60_000;

/** L'istante di «2026-10-16» alle «20:45» a Roma, ora legale compresa. */
export function istanteRoma(data: string, ora: string): number | null {
  const d = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const o = ora.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!d || !o) return null;
  const comeUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(o[1]), Number(o[2]));
  // lo scarto di Roma da UTC in quel momento; due giri bastano anche a
  // cavallo del cambio d'ora
  let t = comeUtc - scartoRoma(comeUtc);
  t = comeUtc - scartoRoma(t);
  return t;
}

function scartoRoma(ms: number): number {
  const parti = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const comeLocale = Date.UTC(
    Number(parti.year), Number(parti.month) - 1, Number(parti.day), Number(parti.hour), Number(parti.minute),
  );
  return comeLocale - Math.floor(ms / 60_000) * 60_000;
}

/** Le partite della giornata `giornata` lette dalla pagina; [] se non ci sono. */
export function leggiCalendario(html: string, giornata: number): PartitaCalendarioPagina[] {
  const pezzi = html.split(/<div\s+itemscope\s+itemtype="http:\/\/schema\.org\/SportsEvent"/i).slice(1);
  const viste = new Set<string>();
  const partite: PartitaCalendarioPagina[] = [];

  for (const p of pezzi) {
    const settimana = p.match(/class="matchweek"[^>]*>\s*(\d+)\s*</i);
    if (!settimana || Number(settimana[1]) !== giornata) continue;

    const casa = squadra(p, 'homeTeam');
    const ospite = squadra(p, 'awayTeam');
    if (!casa || !ospite) continue;
    const chiave = `${casa}|${ospite}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);

    const stato = Number(p.match(/data-match-status="(\d+)"/i)?.[1] ?? 0);
    const data = p.match(/itemprop="startDate"\s+content="([^"]+)"/i)?.[1] ?? '';
    const ora = decodifica(p.match(/class="hours"[^>]*>([^<]*)</i)?.[1] ?? '').trim();
    partite.push({ teamHome: casa, teamAway: ospite, status: stato, matchDate: istanteRoma(data.slice(0, 10), ora) ?? 0 });
  }
  return partite;
}

/** Il nome della squadra di casa o in trasferta: il primo `meta name` dopo l'`itemprop`. */
function squadra(pezzo: string, ruolo: 'homeTeam' | 'awayTeam'): string | null {
  const i = pezzo.search(new RegExp(`itemprop="${ruolo}"`, 'i'));
  if (i < 0) return null;
  const m = pezzo.slice(i).match(/<meta\s+itemprop="name"\s+content="([^"]+)"/i);
  return m ? decodifica(m[1]).trim() : null;
}

export interface RiassuntoGiornata {
  /** la prima partita non rinviata: da qui chiudono schedine e formazioni */
  prima: { nome: string; kickoff: number } | null;
  /** l'ultima partita non rinviata e quando dovrebbe finire */
  ultima: { nome: string; kickoff: number; fine: number } | null;
  rinviate: string[];
  /** partite senza orario sulla pagina (e non rinviate) */
  senzaOrario: string[];
}

export function riassumi(partite: PartitaCalendarioPagina[]): RiassuntoGiornata {
  const nome = (p: PartitaCalendarioPagina) => `${p.teamHome}–${p.teamAway}`;
  const valide = partite.filter((p) => p.status !== 6 && p.matchDate > 0).sort((a, b) => a.matchDate - b.matchDate);
  const prima = valide[0];
  const ultima = valide[valide.length - 1];
  return {
    prima: prima ? { nome: nome(prima), kickoff: prima.matchDate } : null,
    ultima: ultima ? { nome: nome(ultima), kickoff: ultima.matchDate, fine: ultima.matchDate + DURATA_PARTITA_MS } : null,
    rinviate: partite.filter((p) => p.status === 6).map(nome),
    senzaOrario: partite.filter((p) => p.status !== 6 && !p.matchDate).map(nome),
  };
}
