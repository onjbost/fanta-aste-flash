import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvObjects, detectDelimiter, normalizeRole, nameKey, pick } from './csv';

describe('parser CSV', () => {
  it('riconosce il punto e virgola dell\'export italiano di Excel', () => {
    expect(detectDelimiter('Id;R;Nome;Squadra')).toBe(';');
    expect(detectDelimiter('Id,R,Nome,Squadra')).toBe(',');
  });

  it('gestisce virgolette e separatori dentro i campi', () => {
    const rows = parseCsv('nome,club\n"Bastoni, Alessandro",Inter\n');
    expect(rows[1]).toEqual(['Bastoni, Alessandro', 'Inter']);
  });

  it('gestisce le virgolette doppie', () => {
    expect(parseCsv('a\n"dice ""ciao"""')[1][0]).toBe('dice "ciao"');
  });

  it('ignora BOM e righe vuote', () => {
    const rows = parseCsv('﻿a,b\n1,2\n\n3,4\n');
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(['a', 'b']);
  });

  it('costruisce oggetti con intestazioni normalizzate', () => {
    const objs = parseCsvObjects('Id;R;Nome;Squadra;Qt.A\n2050;D;BASTONI;Inter;18\n');
    expect(objs[0].nome).toBe('BASTONI');
    expect(objs[0].qt_a).toBe('18');
  });

  it('trova la colonna giusta tra più alias', () => {
    const row = { qt_a: '18', nome: 'BASTONI' };
    expect(pick(row, 'Quotazione', 'Qt.A', 'QtA')).toBe('18');
    expect(pick(row, 'Prezzo')).toBeUndefined();
  });
});

describe('normalizzazioni', () => {
  it('riconosce i ruoli in tutte le forme usate dai listoni', () => {
    expect(normalizeRole('P')).toBe('P');
    expect(normalizeRole('Por')).toBe('P');
    expect(normalizeRole('difensore')).toBe('D');
    expect(normalizeRole('ATT')).toBe('A');
    expect(normalizeRole('X')).toBeNull();
  });

  it('confronta i nomi ignorando accenti e punteggiatura', () => {
    expect(nameKey('Perišić')).toBe(nameKey('PERISIC'));
    expect(nameKey('Thuram-Ulien')).toBe('THURAM ULIEN');
    expect(nameKey("  N'Dicka ")).toBe('N DICKA');
  });
});
