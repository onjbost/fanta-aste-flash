/**
 * Confronto tra un nuovo export della lega e quello che c'è nel database.
 *
 * Funzione pura: entra la fotografia attuale e quella nuova, esce l'elenco
 * di cosa cambierebbe. Serve per far vedere all'admin le differenze *prima*
 * di toccare qualcosa — un import che riscrive in silenzio è il modo più
 * veloce per perdere un mercato intero.
 */

import type { ListonePlayer } from './listone';
import type { Role } from './rules';

export interface CurrentContract {
  extId: string;
  name: string;
  role: Role;
  teamName: string;
  price: number;
  /** true se il giocatore è arrivato con un'asta flash, non con l'asta iniziale */
  fromFlashAuction: boolean;
}

export interface CurrentPlayer {
  extId: string;
  name: string;
  club: string;
  quotation: number;
  outOfList: boolean;
}

export interface RosterDiff {
  /** in rosa nel file, libero nel database */
  added: { extId: string; name: string; role: Role; teamName: string; price: number }[];
  /** in rosa nel database, libero nel file */
  removed: { extId: string; name: string; role: Role; teamName: string; price: number; fromFlashAuction: boolean }[];
  /** cambiato di squadra */
  moved: { extId: string; name: string; role: Role; from: string; to: string; price: number }[];
  /** stessa squadra, prezzo diverso */
  repriced: { extId: string; name: string; role: Role; teamName: string; from: number; to: number }[];
  /** invariati */
  unchanged: number;
}

export interface ListoneDiff {
  newPlayers: ListonePlayer[];
  /** quotazione, club o flag fuori lista cambiati */
  updated: { extId: string; name: string; changes: string[] }[];
  /** nel database ma non più nel file */
  disappeared: CurrentPlayer[];
}

export function diffListone(current: CurrentPlayer[], incoming: ListonePlayer[]): ListoneDiff {
  const byId = new Map(current.map((p) => [p.extId, p]));
  const incomingIds = new Set(incoming.map((p) => p.extId));

  const newPlayers: ListonePlayer[] = [];
  const updated: ListoneDiff['updated'] = [];

  for (const p of incoming) {
    const old = byId.get(p.extId);
    if (!old) { newPlayers.push(p); continue; }
    const changes: string[] = [];
    if (old.quotation !== p.quotation) changes.push(`quotazione ${old.quotation} → ${p.quotation}`);
    if (old.club !== p.club) changes.push(`club ${old.club} → ${p.club}`);
    if (old.outOfList !== p.outOfList) {
      changes.push(p.outOfList ? 'ora fuori lista' : 'non più fuori lista');
    }
    if (changes.length) updated.push({ extId: p.extId, name: p.name, changes });
  }

  return {
    newPlayers,
    updated,
    disappeared: current.filter((p) => !incomingIds.has(p.extId)),
  };
}

export function diffRosters(current: CurrentContract[], incoming: ListonePlayer[]): RosterDiff {
  const byId = new Map(current.map((c) => [c.extId, c]));
  const diff: RosterDiff = { added: [], removed: [], moved: [], repriced: [], unchanged: 0 };
  const seen = new Set<string>();

  for (const p of incoming) {
    seen.add(p.extId);
    const old = byId.get(p.extId);

    if (p.teamName) {
      const price = p.price ?? 0;
      if (!old) {
        diff.added.push({ extId: p.extId, name: p.name, role: p.role, teamName: p.teamName, price });
      } else if (old.teamName !== p.teamName) {
        diff.moved.push({
          extId: p.extId, name: p.name, role: p.role,
          from: old.teamName, to: p.teamName, price,
        });
      } else if (old.price !== price) {
        diff.repriced.push({
          extId: p.extId, name: p.name, role: p.role,
          teamName: p.teamName, from: old.price, to: price,
        });
      } else {
        diff.unchanged += 1;
      }
    } else if (old) {
      diff.removed.push({
        extId: p.extId, name: p.name, role: p.role,
        teamName: old.teamName, price: old.price, fromFlashAuction: old.fromFlashAuction,
      });
    }
  }

  // un contratto aperto su un giocatore che il file non nomina proprio resta
  // dov'è: preferisco lasciarlo all'admin piuttosto che svincolarlo da solo
  return diff;
}

export function diffIsEmpty(d: RosterDiff): boolean {
  return d.added.length === 0 && d.removed.length === 0
    && d.moved.length === 0 && d.repriced.length === 0;
}

/**
 * Le operazioni di mercato già registrate non vanno perse da una
 * sincronizzazione: se un giocatore è entrato con un'asta flash e il file
 * (esportato prima) non lo sa, va segnalato e non toccato in automatico.
 */
export function conflictsWithMarket(d: RosterDiff): RosterDiff['removed'] {
  return d.removed.filter((r) => r.fromFlashAuction);
}
