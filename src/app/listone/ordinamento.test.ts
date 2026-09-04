import { describe, expect, it } from 'vitest';
import {
  applicaFiltri, applicaOrdine, prossimoOrdine, quantiFiltri,
  FILTRI_VUOTI, type Ordinabile,
} from './ordinamento';

const g = (name: string, role: Ordinabile['role'], club: string, quotation: number): Ordinabile =>
  ({ name, role, club, quotation });

const rosa: Ordinabile[] = [
  g('Bowie', 'A', 'Torino', 12),
  g('Akanji', 'D', 'Inter', 18),
  g('Maignan', 'P', 'Milan', 20),
  g('Zaccagni', 'C', 'Lazio', 18),
  g('Calò', 'C', 'Inter', 9),
  g('Obert', 'D', 'Cagliari', 6),
];

const nomi = (r: Ordinabile[]) => r.map((x) => x.name);

describe('il ciclo dei tre click su una colonna', () => {
  it('primo click: la colonna entra col suo verso naturale', () => {
    expect(prossimoOrdine([], 'quotazione')).toEqual([{ campo: 'quotazione', verso: 'desc' }]);
    expect(prossimoOrdine([], 'nome')).toEqual([{ campo: 'nome', verso: 'asc' }]);
  });

  it('secondo click: gira il verso', () => {
    const uno = prossimoOrdine([], 'quotazione');
    expect(prossimoOrdine(uno, 'quotazione')).toEqual([{ campo: 'quotazione', verso: 'asc' }]);
  });

  it('terzo click: la colonna esce', () => {
    let o = prossimoOrdine([], 'quotazione');
    o = prossimoOrdine(o, 'quotazione');
    expect(prossimoOrdine(o, 'quotazione')).toEqual([]);
  });

  it('la seconda colonna cliccata diventa secondaria, non sostituisce la prima', () => {
    const o = prossimoOrdine(prossimoOrdine([], 'ruolo'), 'quotazione');
    expect(o).toEqual([
      { campo: 'ruolo', verso: 'asc' },
      { campo: 'quotazione', verso: 'desc' },
    ]);
  });

  it('togliere la principale promuove quella che resta', () => {
    let o = prossimoOrdine(prossimoOrdine([], 'ruolo'), 'quotazione');
    o = prossimoOrdine(o, 'ruolo');   // gira
    o = prossimoOrdine(o, 'ruolo');   // esce
    expect(o).toEqual([{ campo: 'quotazione', verso: 'desc' }]);
  });

  it('girare la secondaria non tocca la principale', () => {
    let o = prossimoOrdine(prossimoOrdine([], 'ruolo'), 'quotazione');
    o = prossimoOrdine(o, 'quotazione');
    expect(o[0]).toEqual({ campo: 'ruolo', verso: 'asc' });
    expect(o[1]).toEqual({ campo: 'quotazione', verso: 'asc' });
  });
});

describe('come ordina davvero', () => {
  it('senza colonne attive lascia l\'ordine di partenza, e non copia l\'array', () => {
    expect(applicaOrdine(rosa, [])).toBe(rosa);
  });

  it('per ruolo usa P D C A, non l\'alfabetico', () => {
    const r = applicaOrdine(rosa, [{ campo: 'ruolo', verso: 'asc' }]);
    expect(r.map((x) => x.role)).toEqual(['P', 'D', 'D', 'C', 'C', 'A']);
  });

  it('il tuo esempio: prima ruolo, poi quotazione dentro ogni ruolo', () => {
    const r = applicaOrdine(rosa, [
      { campo: 'ruolo', verso: 'asc' },
      { campo: 'quotazione', verso: 'desc' },
    ]);
    expect(nomi(r)).toEqual(['Maignan', 'Akanji', 'Obert', 'Zaccagni', 'Calò', 'Bowie']);
  });

  it('club e poi quotazione', () => {
    const r = applicaOrdine(rosa, [
      { campo: 'club', verso: 'asc' },
      { campo: 'quotazione', verso: 'desc' },
    ]);
    expect(nomi(r)).toEqual(['Obert', 'Akanji', 'Calò', 'Zaccagni', 'Maignan', 'Bowie']);
  });

  it('la quotazione da sola parte dai più cari', () => {
    const r = applicaOrdine(rosa, [{ campo: 'quotazione', verso: 'desc' }]);
    expect(r[0].quotation).toBe(20);
    expect(r[r.length - 1].quotation).toBe(6);
  });

  it('il nome tiene conto degli accenti italiani', () => {
    const r = applicaOrdine(rosa, [{ campo: 'nome', verso: 'asc' }]);
    expect(nomi(r)).toEqual(['Akanji', 'Bowie', 'Calò', 'Maignan', 'Obert', 'Zaccagni']);
  });

  it('non modifica l\'array che riceve', () => {
    const copia = [...rosa];
    applicaOrdine(rosa, [{ campo: 'nome', verso: 'asc' }]);
    expect(rosa).toEqual(copia);
  });
});

describe('filtri', () => {
  it('il testo cerca nel nome e nel club', () => {
    expect(nomi(applicaFiltri(rosa, { ...FILTRI_VUOTI, testo: 'inter' })))
      .toEqual(['Akanji', 'Calò']);
    expect(nomi(applicaFiltri(rosa, { ...FILTRI_VUOTI, testo: 'zacc' })))
      .toEqual(['Zaccagni']);
  });

  it('più ruoli si sommano invece di escludersi', () => {
    const r = applicaFiltri(rosa, { ...FILTRI_VUOTI, ruoli: ['P', 'A'] });
    expect(nomi(r)).toEqual(['Bowie', 'Maignan']);
  });

  it('l\'intervallo di quotazione comprende gli estremi', () => {
    const r = applicaFiltri(rosa, { ...FILTRI_VUOTI, qMin: '12', qMax: '18' });
    expect(r.every((x) => x.quotation >= 12 && x.quotation <= 18)).toBe(true);
    expect(r).toHaveLength(3);
  });

  it('un estremo solo funziona lo stesso', () => {
    expect(applicaFiltri(rosa, { ...FILTRI_VUOTI, qMin: '18' })).toHaveLength(3);
    expect(applicaFiltri(rosa, { ...FILTRI_VUOTI, qMax: '9' })).toHaveLength(2);
  });

  it('un campo scritto male non azzera la lista', () => {
    // meglio mostrare tutto che mostrare zero righe senza dire perché
    expect(applicaFiltri(rosa, { ...FILTRI_VUOTI, qMin: 'abc' })).toHaveLength(rosa.length);
  });

  it('i filtri si combinano fra loro', () => {
    const r = applicaFiltri(rosa, { ...FILTRI_VUOTI, ruoli: ['D'], club: ['Inter'] });
    expect(nomi(r)).toEqual(['Akanji']);
  });

  it('conta i filtri accesi per la pastiglia', () => {
    expect(quantiFiltri(FILTRI_VUOTI)).toBe(0);
    expect(quantiFiltri({ ...FILTRI_VUOTI, ruoli: ['P'] })).toBe(1);
    expect(quantiFiltri({ ...FILTRI_VUOTI, ruoli: ['P'], qMin: '5', qMax: '9' })).toBe(2);
    expect(quantiFiltri({ ...FILTRI_VUOTI, testo: '  ' })).toBe(0);
  });
});
