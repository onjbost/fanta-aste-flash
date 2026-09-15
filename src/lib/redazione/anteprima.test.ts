import { describe, it, expect } from 'vitest';
import {
  MIN_PAROLE_SFIDA, anteprimaDiRipiego, classificaScontro, costruisciPromptAnteprima,
  daJsonAnteprima, etichettaScontro, montaAnteprima, numeriLecitiAnteprima, verificaAnteprima,
  type Anteprima, type RichiestaAnteprima, type SfidaDaPresentare,
} from './anteprima';

// =====================================================================
// Impalcatura
// =====================================================================

const OTTO = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];

const classifica = () => OTTO.map((nome, i) => ({
  nome, posizione: i + 1, punti: 20 - i * 2,
}));

function sfida(extra: Partial<SfidaDaPresentare> = {}): SfidaDaPresentare {
  return {
    fixtureId: 'f1', casa: 'Alfa', ospite: 'Beta', competizione: 'campionato',
    gruppo: null, posCasa: 1, posOspite: 2,
    favorita: 'Alfa', quotaFavorita: 1.93, quotaPari: 5.25,
    scontro: 'alta',
    ...extra,
  };
}

function richiesta(extra: Partial<RichiestaAnteprima> = {}): RichiestaAnteprima {
  return {
    giornata: 4, serieA: 5, tono: 4, paroleVietate: [],
    chiusura: 'venerdì 19 settembre, ore 19:30',
    classifica: classifica(),
    sfide: [sfida()],
    tipster: [{ nome: 'Alfa', punti: 41.5, posizione: 1 }],
    ...extra,
  };
}

/** Riempitivo senza cifre: le cifre le mettono i test che le vogliono. */
const lungo = (n: number) => Array.from({ length: n }, () => 'parola').join(' ');

function anteprima(extra: Partial<Anteprima> = {}): Anteprima {
  return {
    apertura: 'Le quote sono in lavagna.',
    classifica: 'Comanda chi comanda.',
    sfide: [{ fixtureId: 'f1', testo: lungo(MIN_PAROLE_SFIDA) }],
    chiusura: 'Si gioca.',
    ...extra,
  };
}

// =====================================================================

describe('che tipo di sfida è', () => {
  it('riconosce lo scontro d\'alta classifica', () => {
    expect(classificaScontro(1, 3, 8)).toBe('alta');
    expect(classificaScontro(2, 4, 8)).toBeNull();
  });

  it('riconosce la sfida in fondo', () => {
    expect(classificaScontro(7, 8, 8)).toBe('bassa');
    expect(classificaScontro(5, 8, 8)).toBeNull();
  });

  it('riconosce la prima contro l\'ultima', () => {
    expect(classificaScontro(1, 8, 8)).toBe('prima_ultima');
    expect(classificaScontro(1, 7, 8)).toBe('prima_ultima');
    expect(classificaScontro(1, 6, 8)).toBeNull();
  });

  it('senza classifica non inventa niente', () => {
    expect(classificaScontro(null, 2, 8)).toBeNull();
    expect(classificaScontro(1, null, 8)).toBeNull();
    // con tre squadre in classifica ogni sfida sarebbe «d'alta»: non si dice
    expect(classificaScontro(1, 2, 3)).toBeNull();
  });

  it('ogni tipo ha la sua etichetta, e il niente non ne ha', () => {
    expect(etichettaScontro('alta')).toContain('alta classifica');
    expect(etichettaScontro('bassa')).toContain('fondo');
    expect(etichettaScontro('prima_ultima')).toContain('ultima');
    expect(etichettaScontro(null)).toBeNull();
  });
});

describe('il prompt', () => {
  it('porta classifica, quote e scontro caldo', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p).toContain('1. Alfa — 20 punti');
    expect(p).toContain('favorita secondo le quote: Alfa, quota 1,93');
    expect(p).toContain('il pari paga 5,25');
    expect(p).toContain('scontro d\'alta classifica');
    expect(p).toContain('fixtureId: f1');
  });

  it('dice al modello che non si è ancora giocato', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p).toContain('non si è ancora giocato');
    expect(p).toContain('Non dare per avvenuto niente');
  });

  it('chiede il minimo di parole per sfida', () => {
    expect(costruisciPromptAnteprima(richiesta())).toContain(`almeno ${MIN_PAROLE_SFIDA} parole`);
  });

  it('riporta le correzioni quando il tentativo prima è stato respinto', () => {
    const p = costruisciPromptAnteprima(richiesta({ correzioni: ['numeri che non ti ho dato: 99'] }));
    expect(p).toContain('respinto');
    expect(p).toContain('99');
  });

  it('senza quote lo dice invece di tacere', () => {
    const p = costruisciPromptAnteprima(richiesta({
      sfide: [sfida({ favorita: null, quotaFavorita: null, quotaPari: null })],
    }));
    expect(p).toContain('quote non disponibili');
  });
});

describe('la verifica', () => {
  it('promuove un pezzo che cita solo numeri dati', () => {
    const a = anteprima({
      sfide: [{ fixtureId: 'f1', testo: `Alfa parte a 1,93 contro Beta. ${lungo(MIN_PAROLE_SFIDA)}` }],
    });
    const v = verificaAnteprima(a, richiesta());
    expect(v.problemi).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('boccia un numero inventato', () => {
    const a = anteprima({ classifica: 'Alfa viaggia a una media di 78,4 fantapunti.' });
    const v = verificaAnteprima(a, richiesta());
    expect(v.ok).toBe(false);
    expect(v.inventati).toContain(78.4);
  });

  it('boccia una sfida mancante e una di troppo', () => {
    const due = richiesta({ sfide: [sfida(), sfida({ fixtureId: 'f2', casa: 'Gamma', ospite: 'Delta' })] });
    const manca = verificaAnteprima(anteprima(), due);
    expect(manca.problemi.join(' ')).toContain('manca il lancio di Gamma – Delta');

    const troppa = verificaAnteprima(
      anteprima({ sfide: [{ fixtureId: 'f9', testo: lungo(30) }] }), richiesta(),
    );
    expect(troppa.problemi.join(' ')).toContain('non esiste');
  });

  it('boccia una sfida troppo corta', () => {
    const v = verificaAnteprima(
      anteprima({ sfide: [{ fixtureId: 'f1', testo: lungo(MIN_PAROLE_SFIDA - 1) }] }), richiesta(),
    );
    expect(v.problemi.join(' ')).toContain(`invece di ${MIN_PAROLE_SFIDA}`);
  });

  it('boccia le parole vietate', () => {
    const v = verificaAnteprima(
      anteprima({ apertura: 'Che schifo di giornata.' }),
      richiesta({ paroleVietate: ['schifo'] }),
    );
    expect(v.problemi.join(' ')).toContain('schifo');
  });

  it('boccia un\'apertura vuota', () => {
    expect(verificaAnteprima(anteprima({ apertura: '  ' }), richiesta()).ok).toBe(false);
  });

  it('le quote e le posizioni sono numeri leciti', () => {
    const n = numeriLecitiAnteprima(richiesta());
    expect(n.has(1.93)).toBe(true);
    expect(n.has(5.25)).toBe(true);
    expect(n.has(20)).toBe(true);     // punti in classifica
    expect(n.has(41.5)).toBe(true);   // punti del tipster
    expect(n.has(78.4)).toBe(false);
  });
});

describe('il ripiego', () => {
  it('non ha bisogno del modello e passa la sua stessa verifica', () => {
    const r = richiesta();
    const a = anteprimaDiRipiego(r);
    const v = verificaAnteprima(a, r);
    expect(v.inventati).toEqual([]);
    // il testo di ripiego è corto per costruzione: quello che conta è che i
    // numeri siano tutti leciti, non che superi il minimo di parole
    expect(v.problemi.filter((p) => !p.includes('parole invece di'))).toEqual([]);
  });

  it('dice chi comanda e a quanto paga la favorita', () => {
    const a = anteprimaDiRipiego(richiesta());
    expect(a.apertura).toContain('Alfa');
    expect(a.sfide[0].testo).toContain('1,93');
  });

  it('non si rompe a inizio stagione, senza classifica né tipster', () => {
    const a = anteprimaDiRipiego(richiesta({ classifica: [], tipster: [] }));
    expect(a.apertura).toContain('giornata 4');
    expect(a.classifica).toBe('');
  });
});

describe('il montaggio', () => {
  it('mette classifica, favorita e chiusura', () => {
    const m = montaAnteprima(anteprima(), richiesta());
    expect(m).toContain('GIORNATA 4');
    expect(m).toContain('COME SIAMO MESSI');
    expect(m).toContain('1. Alfa 20');
    expect(m).toContain('1. Alfa 41,5');          // i punti tipster con la virgola
    expect(m).toContain('favorita: Alfa @ 1,93');
    expect(m).toContain('scontro d\'alta classifica');
    expect(m).toContain('Si gioca fino a venerdì 19 settembre, ore 19:30');
  });

  it('separa campionato e coppa quando ci sono tutti e due', () => {
    const r = richiesta({
      sfide: [
        sfida({ fixtureId: 'f1' }),
        sfida({ fixtureId: 'f2', casa: 'Gamma', ospite: 'Delta', competizione: 'coppa', scontro: null }),
      ],
    });
    const a = anteprima({
      sfide: [{ fixtureId: 'f1', testo: lungo(30) }, { fixtureId: 'f2', testo: lungo(30) }],
    });
    const m = montaAnteprima(a, r);
    expect(m.indexOf('CAMPIONATO')).toBeLessThan(m.indexOf('COPPA MANSARDA'));
    expect(m.indexOf('Alfa – Beta')).toBeLessThan(m.indexOf('COPPA MANSARDA'));
    expect(m.indexOf('Gamma – Delta')).toBeGreaterThan(m.indexOf('COPPA MANSARDA'));
  });

  it('senza coppa non mette intestazioni di competizione', () => {
    const m = montaAnteprima(anteprima(), richiesta());
    expect(m).not.toContain('📅 CAMPIONATO');
    expect(m).not.toContain('COPPA MANSARDA');
    expect(m).toContain('⚽ Alfa – Beta');       // la sfida si presenta da sola
  });

  it('a inizio stagione salta il blocco della classifica invece di lasciarlo vuoto', () => {
    const m = montaAnteprima(anteprima(), richiesta({ classifica: [], tipster: [] }));
    expect(m).not.toContain('COME SIAMO MESSI');
    expect(m).not.toContain('TORNEO DEI TIPSTER');
  });
});

describe('lettura della risposta del modello', () => {
  it('mette in forma i campi e non si fida dei tipi', () => {
    const a = daJsonAnteprima({
      apertura: '  ciao  ', classifica: 1 as unknown as string,
      sfide: [{ fixtureId: 'f1', testo: ' x ' }], chiusura: null as unknown as string,
    });
    expect(a.apertura).toBe('ciao');
    expect(a.classifica).toBe('1');
    expect(a.sfide[0].testo).toBe('x');
    expect(a.chiusura).toBe('');
  });

  it('si rifiuta se non c\'è l\'elenco delle sfide', () => {
    expect(() => daJsonAnteprima({ apertura: 'x' })).toThrow();
  });
});
