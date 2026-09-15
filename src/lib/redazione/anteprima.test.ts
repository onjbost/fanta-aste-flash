import { describe, it, expect } from 'vitest';
import {
  MAX_PAROLE, MIN_PAROLE, anteprimaDiRipiego, classificaScontro, costruisciPromptAnteprima,
  daJsonAnteprima, etichettaScontro, montaAnteprima, numeriLecitiAnteprima, squadreInCampo,
  verificaAnteprima,
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
    casa: 'Alfa', ospite: 'Beta', competizione: 'campionato',
    gruppo: null, posCasa: 1, posOspite: 2, scontro: 'alta',
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

/** Una panoramica valida: nomina tutte le squadre e sta nei limiti. */
function panoramicaBuona(r = richiesta()): string {
  const nomi = squadreInCampo(r).join(' contro ');
  return `${nomi}. ${lungo(MIN_PAROLE)}`;
}

function anteprima(extra: Partial<Anteprima> = {}): Anteprima {
  return {
    apertura: 'Le quote sono in lavagna.',
    panoramica: panoramicaBuona(),
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
  it('porta classifica, incroci e scontro caldo', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p).toContain('1. Alfa — 20 punti');
    expect(p).toContain('Alfa (1°) contro Beta (2°)');
    expect(p).toContain('scontro d\'alta classifica');
  });

  it('vieta i pronostici, che è il punto di questo messaggio', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p).toContain('Niente pronostici');
    expect(p).toContain('chi è favorito');
  });

  /*
   * Il messaggio nasceva con la favorita e la sua quota stampate sotto ogni
   * sfida. Tolte: sembrava una schedina. Se un giorno rientrassero dalla
   * finestra, questo test se ne accorge.
   */
  it('non dà al modello nessuna quota', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p.toLowerCase()).not.toContain('quota ');
    expect(p.toLowerCase()).not.toContain('favorita secondo');
  });

  it('dice al modello che non si è ancora giocato', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p).toContain('non si è ancora giocato');
    expect(p).toContain('Non dare per avvenuto niente');
  });

  it('chiede un paragrafo solo, della lunghezza giusta', () => {
    const p = costruisciPromptAnteprima(richiesta());
    expect(p).toContain('un paragrafo solo');
    expect(p).toContain(`fra ${MIN_PAROLE} e ${MAX_PAROLE} parole`);
    expect(p).toContain('niente elenchi puntati');
  });

  it('riporta le correzioni quando il tentativo prima è stato respinto', () => {
    const p = costruisciPromptAnteprima(richiesta({ correzioni: ['numeri che non ti ho dato: 99'] }));
    expect(p).toContain('respinto');
    expect(p).toContain('99');
  });
});

describe('la verifica', () => {
  it('promuove un paragrafo che nomina tutti e resta nei limiti', () => {
    const v = verificaAnteprima(anteprima(), richiesta());
    expect(v.problemi).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('boccia un numero inventato', () => {
    const v = verificaAnteprima(
      anteprima({ panoramica: `${panoramicaBuona()} Alfa viaggia a 78,4 di media.` }),
      richiesta(),
    );
    expect(v.ok).toBe(false);
    expect(v.inventati).toContain(78.4);
  });

  it('boccia una quota, che qui non deve proprio comparire', () => {
    const v = verificaAnteprima(
      anteprima({ panoramica: `${panoramicaBuona()} Alfa parte a 1,93.` }), richiesta(),
    );
    expect(v.inventati).toContain(1.93);
  });

  it('si accorge se una squadra resta fuori dal racconto', () => {
    const due = richiesta({
      sfide: [sfida(), sfida({ casa: 'Gamma', ospite: 'Delta', posCasa: 3, posOspite: 4, scontro: null })],
    });
    const v = verificaAnteprima(
      anteprima({ panoramica: `Alfa contro Beta. ${lungo(MIN_PAROLE)}` }), due,
    );
    expect(v.ok).toBe(false);
    expect(v.problemi.join(' ')).toContain('non nomina: Gamma, Delta');
  });

  it('boccia un paragrafo troppo corto e uno troppo lungo', () => {
    const corto = verificaAnteprima(
      anteprima({ panoramica: `${squadreInCampo(richiesta()).join(' e ')}. ${lungo(10)}` }), richiesta(),
    );
    expect(corto.problemi.join(' ')).toContain(`invece di ${MIN_PAROLE}`);

    const lunghissimo = verificaAnteprima(
      anteprima({ panoramica: `${panoramicaBuona()} ${lungo(MAX_PAROLE)}` }), richiesta(),
    );
    expect(lunghissimo.problemi.join(' ')).toContain(`il massimo è ${MAX_PAROLE}`);
  });

  it('conta le parole e le riporta', () => {
    const v = verificaAnteprima(anteprima(), richiesta());
    expect(v.parole).toBeGreaterThanOrEqual(MIN_PAROLE);
    expect(v.parole).toBeLessThanOrEqual(MAX_PAROLE);
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

  it('le posizioni e i punti sono leciti, le quote no', () => {
    const n = numeriLecitiAnteprima(richiesta());
    expect(n.has(20)).toBe(true);     // punti in classifica
    expect(n.has(41.5)).toBe(true);   // punti del tipster
    expect(n.has(1.93)).toBe(false);  // una quota: non gliel'abbiamo data
  });
});

describe('il ripiego', () => {
  it('non ha bisogno del modello e non inventa numeri', () => {
    const r = richiesta();
    const v = verificaAnteprima(anteprimaDiRipiego(r), r);
    expect(v.inventati).toEqual([]);
    // è corto per costruzione: quello che conta è che i numeri siano leciti
    // e che le squadre ci siano tutte, non che regga il minimo di parole
    expect(v.problemi.filter((p) => !p.includes('parole'))).toEqual([]);
  });

  it('nomina tutte le squadre in campo', () => {
    const r = richiesta({
      sfide: [sfida(), sfida({ casa: 'Gamma', ospite: 'Delta', posCasa: 3, posOspite: 4, scontro: null })],
    });
    const a = anteprimaDiRipiego(r);
    for (const nome of squadreInCampo(r)) expect(a.panoramica).toContain(nome);
  });

  it('dice chi comanda e segnala gli scontri caldi', () => {
    const a = anteprimaDiRipiego(richiesta());
    expect(a.apertura).toContain('giornata 4');
    expect(a.panoramica).toContain('Alfa');
    expect(a.panoramica).toContain('alta classifica');
  });

  it('non si rompe a inizio stagione, senza classifica né tipster', () => {
    const a = anteprimaDiRipiego(richiesta({ classifica: [], tipster: [] }));
    expect(a.panoramica).toContain('Alfa – Beta');
    expect(a.chiusura).not.toBe('');
  });
});

describe('il montaggio', () => {
  it('mette apertura, racconto, classifica e chiusura', () => {
    const m = montaAnteprima(anteprima(), richiesta());
    expect(m).toContain('GIORNATA 4');
    expect(m).toContain('Le quote sono in lavagna.');
    expect(m).toContain('1. Alfa 20');
    expect(m).toContain('Si gioca fino a venerdì 19 settembre, ore 19:30');
  });

  it('non incolonna le sfide: il racconto resta un blocco solo', () => {
    const m = montaAnteprima(anteprima(), richiesta());
    expect(m).not.toContain('⚽');
    expect(m).not.toContain('LE SFIDE');
    expect(m).not.toContain('favorita');
  });

  it('sta in una quindicina di righe', () => {
    const m = montaAnteprima(anteprima(), richiesta());
    // le righe vere sono poche: è il testo lungo che manda a capo sul telefono
    expect(m.split('\n').length).toBeLessThan(16);
  });

  it('a inizio stagione salta il blocco della classifica invece di lasciarlo vuoto', () => {
    const m = montaAnteprima(anteprima(), richiesta({ classifica: [] }));
    expect(m).not.toContain('📊');
  });
});

describe('lettura della risposta del modello', () => {
  it('mette in forma i campi e non si fida dei tipi', () => {
    const a = daJsonAnteprima({ apertura: '  ciao  ', panoramica: ' x ', chiusura: null });
    expect(a.apertura).toBe('ciao');
    expect(a.panoramica).toBe('x');
    expect(a.chiusura).toBe('');
  });

  it('si rifiuta se manca la panoramica', () => {
    expect(() => daJsonAnteprima({ apertura: 'x' })).toThrow();
    expect(() => daJsonAnteprima({ apertura: 'x', panoramica: '   ' })).toThrow();
  });
});
