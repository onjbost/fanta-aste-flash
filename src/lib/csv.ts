/**
 * Parser CSV minimale ma corretto: gestisce virgolette, separatori dentro le
 * virgolette e le virgolette doppie. Rileva da solo se il separatore è la
 * virgola o il punto e virgola, perché l'export italiano di Excel usa il ";".
 */

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => ({
    d,
    n: (firstLine.match(new RegExp(`\\${d}`, 'g')) ?? []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^﻿/, '');            // via il BOM di Excel
  const d = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === d) { row.push(field.trim()); field = ''; continue; }
    if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; continue; }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** Converte in oggetti usando la prima riga come intestazione, normalizzata. */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return o;
  });
}

export function normalizeHeader(h: string): string {
  return h.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Trova la prima colonna presente tra gli alias dati. */
export function pick(row: Record<string, string>, ...aliases: string[]): string | undefined {
  for (const a of aliases) {
    const key = normalizeHeader(a);
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

/** Il listone Fantacalcio.it usa P/D/C/A; alcuni export usano Por/Dif/Cen/Att. */
export function normalizeRole(raw: string): 'P' | 'D' | 'C' | 'A' | null {
  const r = raw.trim().toUpperCase();
  if (r.startsWith('P')) return 'P';
  if (r.startsWith('D')) return 'D';
  if (r.startsWith('C')) return 'C';
  if (r.startsWith('A')) return 'A';
  return null;
}

/** Nomi giocatore per il matching: maiuscolo, senza accenti e punteggiatura. */
export function nameKey(name: string): string {
  return name.trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
