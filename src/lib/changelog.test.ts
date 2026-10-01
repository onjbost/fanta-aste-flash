import { describe, it, expect } from 'vitest';
import { inBlocchi, inLinea } from './changelog';

describe('una riga di changelog', () => {
  it('è testo, quando non c\'è niente da marcare', () => {
    expect(inLinea('La sala si apre il giorno dell\'asta.'))
      .toEqual([{ tipo: 'testo', testo: 'La sala si apre il giorno dell\'asta.' }]);
  });

  it('riconosce il grassetto e il codice', () => {
    expect(inLinea('Il **martello** lo batte `closeLot`.')).toEqual([
      { tipo: 'testo', testo: 'Il ' },
      { tipo: 'forte', testo: 'martello' },
      { tipo: 'testo', testo: ' lo batte ' },
      { tipo: 'codice', testo: 'closeLot' },
      { tipo: 'testo', testo: '.' },
    ]);
  });

  it('un delimitatore aperto e non chiuso resta testo', () => {
    // succede: una moltiplicazione scritta con gli asterischi, un backtick
    // dimenticato. Meglio una riga brutta che una riga mangiata.
    expect(inLinea('2 ** 10 crediti')).toEqual([{ tipo: 'testo', testo: '2 ** 10 crediti' }]);
    expect(inLinea('il carattere ` da solo')).toEqual([{ tipo: 'testo', testo: 'il carattere ` da solo' }]);
  });

  it('non lascia pezzi vuoti', () => {
    expect(inLinea('**tutto grassetto**')).toEqual([{ tipo: 'forte', testo: 'tutto grassetto' }]);
    expect(inLinea('')).toEqual([]);
  });
});

describe('il changelog in blocchi', () => {
  const md = [
    '# Aste Flash · Fanta Mansarda',
    '',
    '## v3.0 — 2 settembre 2026',
    '',
    'La Redazione. A giornata conclusa il tabellino entra nell\'app,',
    'e il pezzo arriva scritto.',
    '',
    '### Per l\'admin',
    '- Un preferito del browser importa la giornata.',
    '- «Scrivi il pezzo», con **più cattivo** accanto:',
    '  ogni pressione è una versione nuova.',
    '',
    'Fine.',
  ].join('\n');

  const blocchi = inBlocchi(md);

  it('riconosce i tre livelli di titolo', () => {
    expect(blocchi[0]).toEqual({ tipo: 'titolo', livello: 1, pezzi: [{ tipo: 'testo', testo: 'Aste Flash · Fanta Mansarda' }] });
    expect(blocchi[1].tipo).toBe('titolo');
    expect((blocchi[1] as { livello: number }).livello).toBe(2);
    expect((blocchi[3] as { livello: number }).livello).toBe(3);
  });

  it('unisce le righe di un paragrafo con uno spazio', () => {
    const p = blocchi[2] as { tipo: 'paragrafo'; pezzi: { testo: string }[] };
    expect(p.tipo).toBe('paragrafo');
    expect(p.pezzi[0].testo).toBe(
      'La Redazione. A giornata conclusa il tabellino entra nell\'app, e il pezzo arriva scritto.',
    );
  });

  it('tiene insieme un elenco, e attacca le continuazioni rientrate', () => {
    const e = blocchi[4] as { tipo: 'elenco'; voci: { testo: string }[][] };
    expect(e.tipo).toBe('elenco');
    expect(e.voci).toHaveLength(2);
    expect(e.voci[0][0].testo).toBe('Un preferito del browser importa la giornata.');
    // la seconda voce ha il grassetto e la riga rientrata attaccata
    expect(e.voci[1].map((p) => p.testo).join('')).toBe(
      '«Scrivi il pezzo», con più cattivo accanto: ogni pressione è una versione nuova.',
    );
  });

  it('chiude l\'elenco quando ricomincia il testo', () => {
    expect(blocchi.at(-1)).toEqual({ tipo: 'paragrafo', pezzi: [{ tipo: 'testo', testo: 'Fine.' }] });
  });

  it('un file vuoto non dà blocchi', () => {
    expect(inBlocchi('')).toEqual([]);
    expect(inBlocchi('\n\n   \n')).toEqual([]);
  });
});
