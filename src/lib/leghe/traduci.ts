/**
 * Leghe Fantacalcio senza preferito — dall'API al nostro tabellino.
 *
 * Funzioni pure. L'API (`apileague.fantacalcio.it`, la stessa che usa il
 * sito) non è documentata: la forma delle risposte viene da chi l'ha già
 * misurata sul campo (Leffettore/fantabot, con i suoi test sulle risposte
 * vere). Qui la si traduce nella **stessa forma** che mandava il preferito,
 * così passa dallo stesso `importaGiornata`: stessa validazione, stessa
 * verifica dei conti (la somma dei fantavoti deve fare il totale della lega),
 * stessa chiusura delle schedine. Se qualcosa qui è tradotto male, i conti
 * non tornano e l'import si ferma invece di scrivere un tabellino sbagliato.
 */

import { puntiCapitano, puntiModificatore, DIFENSORI_MINIMI } from '@/lib/live/calcolo';
import {
  ricostruisci,
  type ClassificaGrezza, type GiocatoreGrezzo, type RigaClassificaGrezza, type Ruolo,
  type SquadraGrezza, type TipoCompetizione,
} from '@/lib/redazione/tabellino';

// =====================================================================
// la forma delle risposte
// =====================================================================

/** Una riga di formazione in `teamLineup/{comp}/{mday}/{cmday}/{casa}/{ospite}`. */
export interface RigaApi {
  /** id di fantacalcio.it, lo stesso `ext_id` del nostro listone */
  pid: number;
  /** voto puro; 55 e 56 sono il «senza voto» */
  scr: number | null;
  /** fantavoto della lega; 100 quando non c'è voto */
  cscr: number | null;
  /** sedici contatori di eventi, separati da «;» */
  b?: string | null;
  /** malus di posizione (Mantra): 1 se l'ha preso */
  m?: number | null;
  /** «-», «U» uscito, «E» entrato */
  ptype?: string | null;
}

export interface LatoApi {
  tid: number;
  starts?: RigaApi[] | null;
  bench?: RigaApi[] | null;
  /** [capitano, vice], come id; a volte una stringa «id;id», null senza fascia */
  capt?: unknown;
  /** il modulo, «343» */
  mdl?: string | null;
  /** fantapunti di squadra, modificatori compresi */
  tot?: number | null;
  /** quando è stata mandata la formazione, «20260904125003261» */
  ldate?: string | null;
}

export interface DettaglioApi {
  home: LatoApi;
  away: LatoApi;
  /** «3-2» */
  res?: string | null;
}

export interface PartitaCalendarioApi {
  tIdH: number;
  tIdA: number;
  ptH?: number | null;
  ptA?: number | null;
  /** punti in classifica presi in questa partita: 3, 1 o 0 */
  standingPtH?: number | null;
  standingPtA?: number | null;
  /** «3-2» */
  result?: string | null;
}

export interface TurnoApi {
  /** la giornata della competizione: per il campionato la giornata di fanta, per la coppa il turno */
  matchDay: number;
  /** la giornata di Serie A */
  championshipMatchDay: number;
  /** la lega l'ha già calcolata */
  calculated?: boolean | null;
  matches?: PartitaCalendarioApi[] | null;
}

export interface CompetizioneApi {
  id: number;
  name: string;
  type?: number | null;
  del?: boolean | null;
}

// =====================================================================
// i pezzi
// =====================================================================

/** Il voto puro, o null per il senza voto (55, 56, 100 o niente). */
export function votoApi(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0 || v > 10) return null;
  return v;
}

/**
 * I sedici contatori, con i nomi delle icone che leggeva il preferito: così
 * `traduciEventi` li capisce senza saperne niente. Le posizioni 7, 9 e 11
 * non sono mai state viste accendersi (una delle tre è l'autogol): restano
 * col loro numero e finiscono fra gli «altri», dove si vedono.
 */
const POSIZIONI: Record<number, string> = {
  0: 'yellowCards', 1: 'redCards', 2: 'scoredGoals', 3: 'concededGoals',
  4: 'savedPenalties', 5: 'missedPenalties', 6: 'scoredPenalties',
  8: 'decisiveGoals', 10: 'cleanSheets',
  12: 'assists', 13: 'assists', 14: 'assists', 15: 'motm',
};

export function eventiApi(b: string | null | undefined): Record<string, number> {
  const esito: Record<string, number> = {};
  (b ?? '').split(';').forEach((x, i) => {
    const n = Number(x);
    if (!n) return;
    const k = POSIZIONI[i] ?? `posizione${i}`;
    esito[k] = (esito[k] ?? 0) + n;
  });
  return esito;
}

/** Capitano e vice, comunque la fonte li scriva. */
export function capitaniApi(capt: unknown): { c: number | null; v: number | null } {
  const lista = Array.isArray(capt) ? capt
    : typeof capt === 'string' ? capt.split(/[;,]/) : [];
  const ids = lista.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return { c: ids[0] ?? null, v: ids[1] ?? null };
}

/** «343» → «3-4-3». */
export function moduloApi(mdl: string | null | undefined): string | null {
  return mdl && /^\d{3,4}$/.test(mdl) ? mdl.split('').join('-') : null;
}

/** «20260904125003261» → «04/09/2026 12:50:03», la forma che `oraInvio` sa leggere. */
export function dataApi(s: string | null | undefined): string | null {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : null;
}

/** «3-2» → [3, 2]. */
export function risultatoApi(r: string | null | undefined): [number, number] | null {
  const m = r?.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// =====================================================================
// la formazione e il tabellino
// =====================================================================

export interface Anagrafica {
  nome: string;
  ruolo: Ruolo;
}

/** I giocatori di un lato, titolari e panchina nell'ordine della lega. */
export function giocatoriApi(lato: LatoApi, anag: Map<string, Anagrafica>): GiocatoreGrezzo[] {
  const { c, v } = capitaniApi(lato.capt);
  const riga = (r: RigaApi, titolare: boolean, ordine: number): GiocatoreGrezzo => {
    const a = anag.get(String(r.pid));
    const voto = votoApi(r.scr);
    return {
      extId: String(r.pid),
      nome: a?.nome ?? `#${r.pid}`,
      ruolo: a?.ruolo ?? null,
      titolare,
      ordine,
      voto,
      fantavoto: voto == null ? null : (r.cscr ?? null),
      fascia: titolare && r.pid === c ? 'C' : titolare && r.pid === v ? 'V' : null,
      eventi: eventiApi(r.b),
    };
  };
  return [
    ...(lato.starts ?? []).map((r, i) => riga(r, true, i)),
    ...(lato.bench ?? []).map((r, i) => riga(r, false, i)),
  ];
}

/**
 * Modificatore della difesa e fattore capitano, con le fasce della lega.
 *
 * L'API dà il totale di squadra ma non dice quanto ne venga da questi due:
 * si calcolano qui con le stesse regole della diretta, e la verifica dei
 * conti dell'import dice se il calcolo e la lega sono d'accordo.
 */
export function bonusDiSquadra(giocatori: GiocatoreGrezzo[]): { modificatore: number; capitano: number } {
  const f = ricostruisci({ giocatori, modificatore: 0, bonusCapitano: 0, fantapunti: null } as unknown as SquadraGrezza);
  const inCampo = f.scesiInCampo;

  let modificatore = 0;
  const difesa = f.titolari.filter((g) => g.ruolo === 'D').length;
  const portiere = inCampo.find((g) => g.ruolo === 'P' && g.voto != null);
  const difensori = inCampo.filter((g) => g.ruolo === 'D' && g.voto != null)
    .map((g) => g.voto as number).sort((a, b) => b - a).slice(0, 3);
  if (difesa >= DIFENSORI_MINIMI && portiere && difensori.length === 3) {
    modificatore = puntiModificatore((portiere.voto as number + difensori.reduce((a, b) => a + b, 0)) / 4);
  }

  const capo = giocatori.find((g) => g.fascia === 'C');
  const vice = giocatori.find((g) => g.fascia === 'V');
  const voto = capo?.voto ?? vice?.voto ?? null;
  return { modificatore, capitano: voto == null ? 0 : puntiCapitano(voto) };
}

export interface NomeSquadra { nome: string; allenatore: string }

export function squadraApi(
  lato: LatoApi, gol: number, chi: NomeSquadra, anag: Map<string, Anagrafica>,
): SquadraGrezza {
  const giocatori = giocatoriApi(lato, anag);
  const { modificatore, capitano } = bonusDiSquadra(giocatori);
  return {
    nome: chi.nome,
    allenatore: chi.allenatore,
    gol,
    modulo: moduloApi(lato.mdl),
    fantapunti: lato.tot ?? null,
    soloVoti: null,
    modificatore,
    bonusCapitano: capitano,
    inviataIl: dataApi(lato.ldate),
    giocatori,
  };
}

// =====================================================================
// la classifica
// =====================================================================

/**
 * La classifica di una competizione, dalle partite calcolate del suo
 * calendario: punti e fantapunti sono quelli che la lega ha assegnato
 * partita per partita, non ricalcolati da noi. A parità di punti vale la
 * somma dei fantapunti, che è il primo criterio di Leghe Fantacalcio.
 *
 * `gruppo` filtra le squadre di un girone di coppa.
 */
export function classificaApi(
  turni: TurnoApi[], nomi: Map<number, string>, comp: { id: number; nome: string; tipo: TipoCompetizione },
  gruppo: { nome: string; squadre: Set<number> } | null = null,
): ClassificaGrezza {
  const per = new Map<number, RigaClassificaGrezza>();
  const di = (tid: number) => {
    let r = per.get(tid);
    if (!r) {
      r = {
        posizione: null, squadra: nomi.get(tid) ?? String(tid),
        giocate: 0, vinte: 0, pari: 0, perse: 0, golFatti: 0, golSubiti: 0,
        differenza: 0, punti: 0, fantapunti: 0,
      };
      per.set(tid, r);
    }
    return r;
  };

  for (const t of turni) {
    if (!t.calculated) continue;
    for (const p of t.matches ?? []) {
      if (gruppo && !(gruppo.squadre.has(p.tIdH) && gruppo.squadre.has(p.tIdA))) continue;
      const ris = risultatoApi(p.result);
      if (!ris) continue;
      for (const [tid, fatti, subiti, pt, fp] of [
        [p.tIdH, ris[0], ris[1], p.standingPtH, p.ptH],
        [p.tIdA, ris[1], ris[0], p.standingPtA, p.ptA],
      ] as const) {
        const r = di(tid);
        r.giocate! += 1;
        if (fatti > subiti) r.vinte! += 1; else if (fatti === subiti) r.pari! += 1; else r.perse! += 1;
        r.golFatti! += fatti;
        r.golSubiti! += subiti;
        r.punti! += pt ?? (fatti > subiti ? 3 : fatti === subiti ? 1 : 0);
        r.fantapunti = Math.round(((r.fantapunti ?? 0) + (fp ?? 0)) * 100) / 100;
      }
    }
  }

  const righe = [...per.values()]
    .map((r) => ({ ...r, differenza: (r.golFatti ?? 0) - (r.golSubiti ?? 0) }))
    .sort((a, b) => (b.punti ?? 0) - (a.punti ?? 0) || (b.fantapunti ?? 0) - (a.fantapunti ?? 0))
    .map((r, i) => ({ ...r, posizione: i + 1 }));

  return {
    competizioneId: String(comp.id),
    competizione: comp.nome,
    tipo: comp.tipo,
    gruppo: gruppo?.nome ?? null,
    righe,
  };
}

/** Coppa o campionato, dal nome della competizione. */
export function tipoApi(c: CompetizioneApi): TipoCompetizione {
  return /coppa|cup|torneo/i.test(c.name) ? 'coppa' : 'campionato';
}
