/**
 * Ordinamento e filtri della vista Svincolati — la parte che si può provare.
 *
 * Sta fuori dal componente apposta: il ciclo dei tre click su una colonna
 * (entra · gira · esce) e la priorità fra più colonne sono regole facili da
 * rompere senza accorgersene, e in una tabella un ordinamento sbagliato non
 * dà errore — dà solo righe nell'ordine sbagliato, che nessuno nota subito.
 */

import type { Role } from '@/lib/rules';

export type Campo = 'ruolo' | 'nome' | 'club' | 'quotazione';
export type Verso = 'asc' | 'desc';
export interface Ordine { campo: Campo; verso: Verso }

/** Quello che serve per ordinare: il resto della riga qui non interessa. */
export interface Ordinabile {
  name: string;
  club: string;
  role: Role;
  quotation: number;
}

/**
 * Il verso del primo click, campo per campo.
 *
 * Non è sempre «decrescente»: su una quotazione il primo click deve mettere in
 * cima i più cari, ma su un nome partire dalla Z sarebbe assurdo. Il criterio
 * è l'ordine che uno si aspetta di vedere per primo — e per il ruolo è quello
 * del campo, P D C A, non l'alfabetico.
 */
export const PRIMO_VERSO: Record<Campo, Verso> = {
  ruolo: 'asc', nome: 'asc', club: 'asc', quotazione: 'desc',
};

const ORDINE_RUOLI = 'PDCA';

export function confronta(a: Ordinabile, b: Ordinabile, campo: Campo): number {
  switch (campo) {
    case 'ruolo': return ORDINE_RUOLI.indexOf(a.role) - ORDINE_RUOLI.indexOf(b.role);
    case 'nome': return a.name.localeCompare(b.name, 'it');
    case 'club': return a.club.localeCompare(b.club, 'it');
    case 'quotazione': return a.quotation - b.quotation;
  }
}

/**
 * Cosa succede quando si clicca su un'intestazione.
 *
 * 1º click · la colonna entra **in coda**: se ce n'è già una attiva, questa
 *   diventa la secondaria e ordina dentro i gruppi della prima.
 * 2º click · gira il verso.
 * 3º click · esce, e restano quelle di prima nel loro ordine. Se non ne resta
 *   nessuna si torna all'ordine di partenza.
 */
export function prossimoOrdine(ordini: Ordine[], campo: Campo): Ordine[] {
  const i = ordini.findIndex((o) => o.campo === campo);
  if (i < 0) return [...ordini, { campo, verso: PRIMO_VERSO[campo] }];
  if (ordini[i].verso === PRIMO_VERSO[campo]) {
    const copia = [...ordini];
    copia[i] = { campo, verso: PRIMO_VERSO[campo] === 'asc' ? 'desc' : 'asc' };
    return copia;
  }
  return ordini.filter((o) => o.campo !== campo);
}

/** Ordina senza toccare l'array in ingresso. Senza ordini attivi non fa niente. */
export function applicaOrdine<T extends Ordinabile>(righe: T[], ordini: Ordine[]): T[] {
  if (!ordini.length) return righe;
  return [...righe].sort((a, b) => {
    for (const o of ordini) {
      const c = confronta(a, b, o.campo);
      if (c !== 0) return o.verso === 'asc' ? c : -c;
    }
    return 0;
  });
}

export interface Filtri {
  testo: string;
  ruoli: Role[];
  club: string[];
  qMin: string;
  qMax: string;
}

export const FILTRI_VUOTI: Filtri = { testo: '', ruoli: [], club: [], qMin: '', qMax: '' };

/** Quanti filtri sono accesi: è il numero sulla pastiglia del pulsante. */
export function quantiFiltri(f: Filtri): number {
  return (f.testo.trim() ? 1 : 0)
    + (f.ruoli.length ? 1 : 0)
    + (f.club.length ? 1 : 0)
    + (f.qMin.trim() || f.qMax.trim() ? 1 : 0);
}

export function applicaFiltri<T extends Ordinabile>(righe: T[], f: Filtri): T[] {
  const testo = f.testo.trim().toLowerCase();
  // un campo vuoto o scritto male non filtra: meglio mostrare tutto che
  // mostrare zero righe senza spiegare perché
  const min = f.qMin.trim() === '' ? null : Number(f.qMin);
  const max = f.qMax.trim() === '' ? null : Number(f.qMax);
  const club = new Set(f.club);
  const ruoli = new Set(f.ruoli);

  return righe.filter((p) => {
    if (testo && !p.name.toLowerCase().includes(testo) && !p.club.toLowerCase().includes(testo)) {
      return false;
    }
    if (ruoli.size && !ruoli.has(p.role)) return false;
    if (club.size && !club.has(p.club)) return false;
    if (min != null && Number.isFinite(min) && p.quotation < min) return false;
    if (max != null && Number.isFinite(max) && p.quotation > max) return false;
    return true;
  });
}
