import { describe, expect, it } from 'vitest';
import type { Spunto } from '../redazione/spunti';
import {
  LARGHEZZA_CARATTERE, costruisciPromptPrima, daJsonPrima, larghezzaApertura,
  limitiTitolo, montaPrima, numeriDellaPrima, occhielloDi, primaDiRipiego, riempi, righeStimate,
  sceltaApertura, sottotitoloDi, titolinoDi, verificaPrima,
  type RichiestaPrima, type SfidaPrima, type TestiPrima,
} from './testi';

const sfida = (n: number, p: Partial<SfidaPrima> = {}): SfidaPrima => ({
  fixtureId: `f${n}`, casa: `Casa${n}`, ospite: `Ospite${n}`,
  golCasa: 2, golOspite: 1, fpCasa: 70, fpOspite: 65,
  competizione: 'campionato', ...p,
});

const spunto = (fixtureId: string | null, peso: number): Spunto => ({
  codice: 'x', fixtureId, peso, frase: 'una frase', dati: {},
} as Spunto);

const richiesta = (p: Partial<RichiestaPrima> = {}): RichiestaPrima => ({
  tipo: 'settimanale', giornata: 3, tono: 4, disposizione: 'sfondo',
  squadre: [{ nome: 'Casa1', soprannomi: ['i gialli'] }, { nome: 'Ospite1', soprannomi: [] }],
  sfide: [sfida(1), sfida(2)], apertura: 'f1', spunti: [], migliore: null,
  paroleVietate: [], ...p,
});

// ---------------------------------------------------------------- misure

describe('righeStimate', () => {
  it('conta le righe impaginando parola per parola', () => {
    // 4 parole da 40px più 3 spazi da 10 fanno 190: in 220 ci stanno, in 100 no
    expect(righeStimate('aaaa aaaa aaaa aaaa', 220, 10)).toBe(1);
    expect(righeStimate('aaaa aaaa aaaa aaaa', 100, 10)).toBe(2);
  });

  it('una parola più larga della colonna si prende la sua riga', () => {
    // contando i caratteri e dividendo verrebbe 1 riga: sono 2
    expect(righeStimate('ab aaaaaaaaaaaaaaaaaaaaaaaa', 200, 10)).toBe(2);
  });

  it('un testo largo esattamente quanto la colonna ci sta', () => {
    // il confine è «più largo», non «largo quanto»: con >= un titolo che
    // riempie la riga al pixel andrebbe a capo per niente
    expect(righeStimate('aaaa aaaa', 90, 10)).toBe(1);
    expect(righeStimate('aaaa aaaa', 89, 10)).toBe(2);
  });

  it('un a capo scritto a mano è una riga vera', () => {
    // contarlo come uno spazio direbbe all'admin che il titolo ci sta su
    // una riga, mentre in pagina ne occupa due
    expect(righeStimate('aaaa\naaaa', 220, 10)).toBe(2);
    expect(righeStimate('aaaa aaaa', 220, 10)).toBe(1);
  });

  it('il testo vuoto non occupa righe', () => {
    expect(righeStimate('   ', 200, 10)).toBe(0);
  });
});

describe('limitiTitolo', () => {
  it('la colonna stretta accetta meno caratteri di quella larga', () => {
    expect(limitiTitolo('affianco').titolo).toBeLessThan(limitiTitolo('sfondo').titolo);
    expect(limitiTitolo('affianco').gancio).toBeLessThan(limitiTitolo('sfondo').gancio);
  });

  it('il limite discende dalla larghezza misurata, non da un numero a caso', () => {
    const l = limitiTitolo('sfondo');
    expect(l.gancio).toBe(Math.floor(larghezzaApertura('sfondo') / LARGHEZZA_CARATTERE.gancio44));
    expect(l.titolo).toBe(Math.floor((larghezzaApertura('sfondo') * 2) / LARGHEZZA_CARATTERE.titolo64));
  });
});

// ------------------------------------------------------------- apertura

describe('sceltaApertura', () => {
  it('apre con la partita dallo spunto più grosso, non col punteggio più alto', () => {
    const sfide = [sfida(1, { fpCasa: 90, fpOspite: 40 }), sfida(2, { fpCasa: 60, fpOspite: 59 })];
    expect(sceltaApertura(sfide, [spunto('f2', 80), spunto('f1', 20)])).toBe('f2');
  });

  it('senza spunti decide il fantapunteggio più alto messo in campo', () => {
    const sfide = [sfida(1, { fpCasa: 60, fpOspite: 59 }), sfida(2, { fpCasa: 88, fpOspite: 20 })];
    expect(sceltaApertura(sfide, [])).toBe('f2');
  });

  it('gli spunti di giornata non fanno aprire nessuna partita', () => {
    const sfide = [sfida(1, { fpCasa: 60, fpOspite: 59 }), sfida(2, { fpCasa: 88, fpOspite: 20 })];
    expect(sceltaApertura(sfide, [spunto(null, 99)])).toBe('f2');
  });

  it('a parità piena l\'ordine è stabile, non casuale', () => {
    const sfide = [sfida(2), sfida(1)];
    expect(sceltaApertura(sfide, [])).toBe('f1');
  });

  it('senza partite non apre niente', () => {
    expect(sceltaApertura([], [])).toBeNull();
  });
});

describe('le righe che scriviamo noi', () => {
  it('il sottotitolo è il risultato per esteso', () => {
    expect(sottotitoloDi(sfida(1))).toBe('Casa1 - Ospite1 2-1');
  });

  it('il titolino delle altre ha il punteggio in mezzo', () => {
    expect(titolinoDi(sfida(1))).toBe('Casa1 2-1 Ospite1');
  });

  it('l\'occhiello cambia con l\'edizione', () => {
    expect(occhielloDi({ tipo: 'settimanale', giornata: 3 })).toBe('LA GIORNATA 3');
    expect(occhielloDi({ tipo: 'fantamercato', giornata: 3 })).toBe('IL FANTAMERCATO');
  });
});

// --------------------------------------------------------------- prompt

describe('costruisciPromptPrima', () => {
  it('mette in apertura la sfida scelta e nelle altre il resto', () => {
    const p = costruisciPromptPrima(richiesta({ apertura: 'f2' }));
    const apertura = p.slice(p.indexOf("## L'apertura"), p.indexOf('## Le altre'));
    expect(apertura).toContain('fixtureId: f2');
    expect(apertura).not.toContain('fixtureId: f1');
    expect(p.slice(p.indexOf('## Le altre'))).toContain('fixtureId: f1');
  });

  it('chiede un blocco per ogni altra partita, coi fixtureId esatti', () => {
    const p = costruisciPromptPrima(richiesta({ sfide: [sfida(1), sfida(2), sfida(3)] }));
    expect(p).toContain('"fixtureId": "f2"');
    expect(p).toContain('"fixtureId": "f3"');
    expect(p).toContain('tutte e 2 le partite');
  });

  it('scrive i limiti che poi la verifica applica davvero', () => {
    const r = richiesta({ disposizione: 'affianco' });
    const p = costruisciPromptPrima(r);
    expect(p).toContain(`al massimo ${limitiTitolo('affianco').titolo} caratteri`);
    expect(p).toContain(`al massimo ${limitiTitolo('affianco').gancio} caratteri`);
  });

  it('riporta le correzioni del tentativo respinto', () => {
    const p = costruisciPromptPrima(richiesta({ correzioni: ['il titolo era lunghissimo'] }));
    expect(p).toContain('respinto');
    expect(p).toContain('il titolo era lunghissimo');
  });

  it('senza correzioni non parla di tentativi precedenti', () => {
    expect(costruisciPromptPrima(richiesta())).not.toContain('respinto');
  });

  it('passa l\'intoccabile della squadra', () => {
    const p = costruisciPromptPrima(richiesta({
      squadre: [{ nome: 'Casa1', soprannomi: [], intoccabile: 'suo nonno' }],
    }));
    expect(p).toContain('NON scherzare su: suo nonno');
  });
});

// --------------------------------------------------------------- lettura

describe('daJsonPrima', () => {
  it('regge una risposta vuota senza esplodere', () => {
    const t = daJsonPrima({});
    expect(t.titolo).toBe('');
    expect(t.altre).toEqual([]);
    expect(t.spalla).toBeNull();
  });

  it('butta via una spalla senza numero: il riquadro vuoto è peggio che assente', () => {
    expect(daJsonPrima({ spalla: { didascalia: 'qualcosa' } }).spalla).toBeNull();
  });

  it('tiene la spalla anche se la didascalia manca', () => {
    expect(daJsonPrima({ spalla: { numero: 18 } })?.spalla).toEqual({ numero: '18', didascalia: '' });
  });

  it('non si fida del tipo di «altre»', () => {
    expect(daJsonPrima({ altre: 'no' }).altre).toEqual([]);
    expect(daJsonPrima({ altre: [null] }).altre).toEqual([{ fixtureId: '', testo: '' }]);
  });
});

// -------------------------------------------------------------- verifica

const testi = (p: Partial<TestiPrima> = {}): TestiPrima => ({
  titolo: 'Casa1 passa', gancio: 'e Ospite1 resta a terra',
  cappello: Array.from({ length: 34 }, () => 'parola').join(' '),
  altre: [{ fixtureId: 'f2', testo: 'Due righe secche, niente di più.' }],
  spalla: null, ...p,
});

describe('verificaPrima', () => {
  it('lascia passare una pagina in regola', () => {
    const e = verificaPrima(testi(), richiesta(), new Set());
    expect(e.problemi).toEqual([]);
    expect(e.ok).toBe(true);
  });

  it('niente manda al ripiego, tranne una pagina vuota', () => {
    // il ripiego serve solo se il modello non risponde: tutto quello che si
    // può correggere nell'editor resta un avviso, e la pagina esce lo stesso

    // forma: titolo lungo
    const forma = verificaPrima(testi({ titolo: 'a'.repeat(200) }), richiesta(), new Set());
    expect(forma.problemi.length).toBeGreaterThan(0);
    expect(forma.gravi).toEqual([]);

    // sostanza: un numero che nessuno gli ha dato. Resta l'avviso più
    // importante dell'editor, ma la pagina la decidi tu
    const falso = verificaPrima(
      testi({ cappello: 'Ha chiuso a 4321 fantapunti, un record.' }), richiesta(), new Set(),
    );
    expect(falso.problemi.join(' ')).toContain('numeri che non ti ho dato');
    expect(falso.gravi).toEqual([]);

    // l'unica eccezione: senza titolo non c'è niente da correggere
    expect(verificaPrima(testi({ titolo: '' }), richiesta(), new Set()).gravi)
      .toContain('manca il titolo');
  });

  it('boccia il titolo troppo lungo', () => {
    const e = verificaPrima(testi({ titolo: 'a'.repeat(200) }), richiesta(), new Set());
    expect(e.problemi.join(' ')).toContain('il titolo è di 200 caratteri');
  });

  it('boccia il gancio che non sta su una riga', () => {
    // sotto il limite in caratteri ma fatto di parole che vanno a capo
    const g = 'ooooooooooooooo ooooooooooooooo';
    const e = verificaPrima(testi({ gancio: g }), richiesta(), new Set());
    expect(e.problemi.join(' ')).toContain('una riga sola');
  });

  it('boccia il cappello fuori dal conteggio parole', () => {
    const e = verificaPrima(testi({ cappello: 'tre parole soltanto' }), richiesta(), new Set());
    expect(e.problemi.join(' ')).toContain('3 parole');
  });

  it('boccia il cappello troppo lungo, che è il vincolo che taglia davvero', () => {
    // il minimo lascia un buco bianco; il massimo esce dal riquadro e viene
    // tagliato dall'immagine, e di quello nel gruppo non si accorge nessuno
    const lungo = Array.from({ length: 80 }, () => 'parola').join(' ');
    const e = verificaPrima(testi({ cappello: lungo }), richiesta(), new Set());
    expect(e.problemi.join(' ')).toContain('80 parole invece di 28-52');
  });

  it('si accorge che manca una partita', () => {
    const e = verificaPrima(testi({ altre: [] }), richiesta(), new Set());
    expect(e.problemi.join(' ')).toContain('manca il blocco su Casa2 – Ospite2');
  });

  it('si accorge di un blocco su una partita che non va in pagina', () => {
    const e = verificaPrima(
      testi({ altre: [{ fixtureId: 'f2', testo: 'ok' }, { fixtureId: 'f9', testo: 'ok' }] }),
      richiesta(), new Set(),
    );
    expect(e.problemi.join(' ')).toContain('(f9)');
  });

  it('boccia un blocco «altre» che sfora le tre righe', () => {
    const e = verificaPrima(
      testi({ altre: [{ fixtureId: 'f2', testo: 'parola '.repeat(70) }] }),
      richiesta(), new Set(),
    );
    expect(e.problemi.join(' ')).toContain('righe invece di 3');
  });

  it('boccia un numerone che nessuno ha dato', () => {
    const e = verificaPrima(
      testi({ spalla: { numero: '41', didascalia: 'un numero qualunque' } }),
      richiesta(), new Set(),
    );
    expect(e.problemi.join(' ')).toContain('il numerone 41 non è fra quelli');
  });

  it('accetta il numerone che è un fantapunteggio della giornata', () => {
    const e = verificaPrima(
      testi({ spalla: { numero: '70', didascalia: 'i fantapunti della capolista' } }),
      richiesta(), new Set(),
    );
    expect(e.problemi).toEqual([]);
  });

  it('accetta il numerone del migliore in campo', () => {
    const r = richiesta({ migliore: { nome: 'Malen', squadra: 'Casa1', fantapunti: 18 } });
    const e = verificaPrima(
      testi({ spalla: { numero: '18', didascalia: 'i fantapunti del migliore' } }), r, new Set(),
    );
    expect(e.problemi).toEqual([]);
  });

  it('trova i numeri inventati dentro il cappello', () => {
    const e = verificaPrima(
      testi({ cappello: `${Array.from({ length: 30 }, () => 'parola').join(' ')} e 93.5 fantapunti` }),
      richiesta(), new Set(),
    );
    expect(e.inventati).toContain(93.5);
  });

  it('trova le parole vietate ovunque, anche nella didascalia', () => {
    const r = richiesta({ migliore: { nome: 'Malen', squadra: 'Casa1', fantapunti: 18 }, paroleVietate: ['cala il sipario'] });
    const e = verificaPrima(
      testi({ spalla: { numero: '18', didascalia: 'e cala il sipario' } }), r, new Set(),
    );
    expect(e.problemi.join(' ')).toContain('cala il sipario');
  });

  it('si accorge se manca il titolo o il cappello', () => {
    const e = verificaPrima(testi({ titolo: '', cappello: '' }), richiesta(), new Set());
    expect(e.problemi).toContain('manca il titolo');
    expect(e.problemi).toContain('manca il cappello');
  });
});

describe('numeriDellaPrima', () => {
  it('ammette risultati, fantapunti, giornata e migliore in campo', () => {
    const r = richiesta({ migliore: { nome: 'M', squadra: 'Casa1', fantapunti: 18 } });
    const n = numeriDellaPrima(r, new Set([99]));
    for (const x of [2, 1, 70, 65, 3, 18, 99]) expect(n.has(x)).toBe(true);
    expect(n.has(41)).toBe(false);
  });
});

// --------------------------------------------------------------- ripiego

describe('primaDiRipiego', () => {
  it('sta sempre dentro i limiti che la verifica applica', () => {
    // la proprietà che conta: il ripiego serve quando il modello non c'è,
    // e una pagina di ripiego che sfora è una pagina tagliata nel gruppo
    for (const disposizione of ['sfondo', 'affianco', 'riquadro', 'senzaFoto'] as const) {
      const r = richiesta({
        disposizione,
        sfide: [sfida(1), sfida(2), sfida(3), sfida(4)],
        migliore: { nome: 'Mastantuono', squadra: 'Casa1', fantapunti: 18 },
      });
      const e = verificaPrima(primaDiRipiego(r), r, new Set());
      expect({ disposizione, problemi: e.problemi }).toEqual({ disposizione, problemi: [] });
    }
  });

  it('senza migliore in campo non inventa il numerone', () => {
    expect(primaDiRipiego(richiesta()).spalla).toBeNull();
  });

  it('non cita numeri che non gli sono stati dati', () => {
    const r = richiesta({ migliore: { nome: 'M', squadra: 'Casa1', fantapunti: 18 } });
    expect(verificaPrima(primaDiRipiego(r), r, new Set()).inventati).toEqual([]);
  });

  it('anche senza materiale non sfora mai i riquadri', () => {
    // con una partita sola e nessun migliore il cappello resta corto: il
    // minimo è un obiettivo, il massimo è un vincolo fisico
    const r = richiesta({ sfide: [sfida(1)], apertura: 'f1' });
    const problemi = verificaPrima(primaDiRipiego(r), r, new Set()).problemi;
    expect(problemi.filter((p) => !p.includes('parole invece di'))).toEqual([]);
  });

  it('senza partite non esplode', () => {
    const r = richiesta({ sfide: [], apertura: '' });
    expect(() => primaDiRipiego(r)).not.toThrow();
  });
});

describe('riempi', () => {
  it('smette appena il minimo è raggiunto', () => {
    expect(riempi(['una due tre', 'quattro cinque sei', 'sette otto'], 5, 20))
      .toBe('una due tre quattro cinque sei');
  });

  it('salta la frase che farebbe sforare e prova la successiva', () => {
    expect(riempi(['una due tre quattro cinque sei sette', 'otto'], 1, 3)).toBe('otto');
  });

  it('senza frasi torna vuoto invece di rompersi', () => {
    expect(riempi([], 10, 20)).toBe('');
  });
});

// ------------------------------------------------------------- montaggio

describe('montaPrima', () => {
  const pezzi = (r = richiesta()) => ({
    richiesta: r, classifica: [{ nome: 'Casa1', punti: 9 }],
    prossimi: [{ casa: 'Casa1', ospite: 'Ospite2' }], foto: null, numero: 3,
  });

  it('scrive lui il sottotitolo e i titolini, non il modello', () => {
    const d = montaPrima(testi({
      altre: [{ fixtureId: 'f2', testo: 'due righe' }],
    }), pezzi(), new Date('2026-09-28T12:00:00Z'));
    expect(d.sottotitolo).toBe('Casa1 - Ospite1 2-1');
    expect(d.altre[0].titolo).toBe('Casa2 2-1 Ospite2');
    expect(d.data).toBe('28 SETTEMBRE 2026');
    expect(d.numero).toBe('N. 3');
  });

  it('l\'apertura non finisce anche fra le altre', () => {
    const d = montaPrima(testi(), pezzi());
    expect(d.altre.map((a) => a.titolo)).toEqual(['Casa2 2-1 Ospite2']);
  });

  it('tiene l\'ordine delle sfide, non quello in cui ha risposto il modello', () => {
    const r = richiesta({ sfide: [sfida(1), sfida(2), sfida(3)] });
    const d = montaPrima(testi({
      altre: [{ fixtureId: 'f3', testo: 'terza' }, { fixtureId: 'f2', testo: 'seconda' }],
    }), pezzi(r));
    expect(d.altre.map((a) => a.testo)).toEqual(['seconda', 'terza']);
  });

  it('un blocco senza testo resta vuoto invece di diventare «undefined»', () => {
    const d = montaPrima(testi({ altre: [] }), pezzi());
    expect(d.altre[0].testo).toBe('');
  });

  it('senza sfide non esplode e lascia il sottotitolo vuoto', () => {
    const r = richiesta({ sfide: [], apertura: '' });
    const d = montaPrima(testi({ altre: [] }), pezzi(r));
    expect(d.sottotitolo).toBe('');
    expect(d.altre).toEqual([]);
  });

  it('porta dentro classifica, prossimi e spalla così come sono', () => {
    const d = montaPrima(
      testi({ spalla: { numero: '70', didascalia: 'i fantapunti della capolista' } }), pezzi(),
    );
    expect(d.classifica).toEqual([{ nome: 'Casa1', punti: 9 }]);
    expect(d.prossimi).toEqual([{ casa: 'Casa1', ospite: 'Ospite2' }]);
    expect(d.spalla?.numero).toBe('70');
  });
});
