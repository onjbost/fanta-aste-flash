/**
 * La coda operativa: quello che l'admin deve fare a mano, fuori dall'app.
 *
 * I lotti senza contendenti non vanno all'asta: si assegnano da soli quando
 * la sala apre, al 75% dello svincolando. Dentro l'app il movimento è già
 * registrato, ma su Leghe Fantacalcio no — e lì il lavoro è manuale: per
 * ogni squadra, togliere uno e mettere l'altro.
 *
 * Senza questo elenco l'admin sa chi entra ma non chi esce, perché lo
 * svincolando è il dato che fino all'apertura resta coperto. È successo
 * davvero alla prima asta: il messaggio di apertura elenca solo i lotti
 * contesi, e i quattro assegnati d'ufficio non comparivano da nessuna parte.
 */

import type { Role } from './rules';

export interface VoceDellaCoda {
  lottoId: string;
  squadra: string;
  prende: { nome: string; ruolo: Role; club: string };
  /** chi esce dalla rosa per far posto */
  svincola: { nome: string; ruolo: Role } | null;
  /** quanto costa, cioè quanto rende lo svincolando */
  prezzo: number;
}

const RUOLO: Record<Role, string> = { P: 'P', D: 'D', C: 'C', A: 'A' };

/** Una riga sola, come la si legge per spuntarla. */
export function rigaDellaCoda(v: VoceDellaCoda): string {
  const dentro = `${v.prende.nome} (${RUOLO[v.prende.ruolo]}, ${v.prende.club}) per ${v.prezzo}`;
  const fuori = v.svincola
    ? `svincola ${v.svincola.nome} (${RUOLO[v.svincola.ruolo]})`
    : 'svincolando mancante: da controllare';
  return `${v.squadra}: ${fuori} → prende ${dentro}`;
}

/**
 * L'elenco pronto da incollare.
 *
 * Diviso per squadra e non per lotto: chi lo usa apre la rosa di una
 * squadra per volta, e saltare avanti e indietro fra due squadre è il modo
 * di svincolare il giocatore sbagliato.
 */
export function testoDellaCoda(voci: VoceDellaCoda[]): string {
  if (!voci.length) return 'Nessun lotto da assegnare senza asta.';

  const per = new Map<string, VoceDellaCoda[]>();
  for (const v of voci) per.set(v.squadra, [...(per.get(v.squadra) ?? []), v]);

  const squadre = [...per.keys()].sort((a, b) => a.localeCompare(b));
  const righe: string[] = [];
  for (const squadra of squadre) {
    righe.push(squadra);
    for (const v of per.get(squadra)!) {
      const dentro = `${v.prende.nome} (${RUOLO[v.prende.ruolo]}, ${v.prende.club}) per ${v.prezzo}`;
      righe.push(v.svincola
        ? `  − ${v.svincola.nome} (${RUOLO[v.svincola.ruolo]})  +  ${dentro}`
        : `  svincolando mancante  +  ${dentro}`);
    }
    righe.push('');
  }
  return righe.join('\n').trimEnd();
}

/** Quanti crediti escono in tutto da questa coda. */
export function totaleDellaCoda(voci: VoceDellaCoda[]): number {
  return voci.reduce((n, v) => n + v.prezzo, 0);
}
