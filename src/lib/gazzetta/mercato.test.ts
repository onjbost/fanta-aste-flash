import { describe, expect, it } from 'vitest';
import {
  MASSIME_LICENZE, chiamante, costruisciPromptMercato, daJsonMercato,
  licenzeUsate, mercatoDiRipiego, numeriDelMercato, quandoApreLaSala, rivali, ruoloPerEsteso,
  titoloTrattativa, trattativaDiApertura, verificaMercato,
  type RichiestaMercato, type TestiMercato, type Trattativa,
  paroleCheIniziano,
} from './mercato';

/*
 * I dati sono quelli veri della sessione 1 in produzione: otto chiamate,
 * cinque club mossi, due duelli (Zhegrova e Mendy) e tre club fermi. Il
 * chiamato più caro valeva 8, ed è il motivo per cui l'apertura la decide un
 * duello e non una soglia sulla quotazione.
 */
const zhegrova: Trattativa = {
  lottoId: 'l-zhegrova', giocatore: 'ZHEGROVA', ruolo: 'C', club: 'Juventus',
  inCorsa: [
    { squadra: 'FC NTONIA', chiamante: true, ruoloInUscita: 'C' },
    { squadra: 'Montester United', chiamante: false, ruoloInUscita: 'C' },
  ],
};
const osmajic: Trattativa = {
  lottoId: 'a-osmajic', giocatore: 'OSMAJIC', ruolo: 'A', club: 'Genoa',
  inCorsa: [{ squadra: 'FC NTONIA', chiamante: true, ruoloInUscita: 'A' }],
};
const hainaut: Trattativa = {
  lottoId: 'b-hainaut', giocatore: 'HAINAUT', ruolo: 'D', club: 'Venezia',
  inCorsa: [{ squadra: 'FC Joga Benito', chiamante: true, ruoloInUscita: 'D' }],
};

const richiesta = (p: Partial<RichiestaMercato> = {}): RichiestaMercato => ({
  tono: 4, sessione: 1, quandoSiGioca: 'giovedì 1 ottobre alle 21.30',
  disposizione: 'sfondo',
  trattative: [osmajic, zhegrova, hainaut],
  apertura: 'l-zhegrova',
  fermi: ['DEPORTIVO APERITIVO', 'Qarabaggio', 'FC CANEPARDO'],
  paroleVietate: [],
  nomiVietati: ['RODRIGUEZ JE.', 'EL SHAARAWY', 'BOGA', 'ZAPPACOSTA'],
  ...p,
});

// ------------------------------------------------------------ apertura

describe('trattativaDiApertura', () => {
  it('apre col duello, non col giocatore più quotato', () => {
    // è la regola che fa esistere la pagina: nella sessione vera il chiamato
    // più caro valeva 8, e una soglia sulla quotazione l'avrebbe lasciata
    // senza apertura
    expect(trattativaDiApertura([osmajic, zhegrova, hainaut])).toBe('l-zhegrova');
  });

  it('senza duelli sceglie in modo stabile, non a caso', () => {
    expect(trattativaDiApertura([hainaut, osmajic])).toBe('a-osmajic');
    expect(trattativaDiApertura([osmajic, hainaut])).toBe('a-osmajic');
  });

  it('fra due duelli vince quello con più club in corsa', () => {
    const tre: Trattativa = {
      ...hainaut,
      inCorsa: [
        { squadra: 'A', chiamante: true, ruoloInUscita: null },
        { squadra: 'B', chiamante: false, ruoloInUscita: null },
        { squadra: 'C', chiamante: false, ruoloInUscita: null },
      ],
    };
    expect(trattativaDiApertura([zhegrova, tre])).toBe(tre.lottoId);
  });

  it('senza trattative non apre niente', () => {
    expect(trattativaDiApertura([])).toBeNull();
  });
});

describe('le righe che scriviamo noi', () => {
  it('il titoletto porta il club vero, non la fantasquadra', () => {
    expect(titoloTrattativa(zhegrova)).toBe('ZHEGROVA (Juventus)');
  });

  it('distingue chi ha bussato da chi si è inserito', () => {
    expect(chiamante(zhegrova)?.squadra).toBe('FC NTONIA');
    expect(rivali(zhegrova).map((c) => c.squadra)).toEqual(['Montester United']);
  });

  it('il ruolo si scrive per esteso, perché è quello che va in pagina', () => {
    expect(ruoloPerEsteso('C')).toBe('centrocampista');
    expect(ruoloPerEsteso(null)).toBe('giocatore');
  });
});

// -------------------------------------------------------------- prompt

describe('costruisciPromptMercato', () => {
  it('non contiene i nomi degli svincolandi: non li deve proprio vedere', () => {
    // è il vincolo che tiene in piedi l'asta. Chiedere al modello di tacerli
    // non basterebbe: quello che non gli si dà non può scriverlo
    const p = costruisciPromptMercato(richiesta());
    for (const nome of ['RODRIGUEZ JE.', 'EL SHAARAWY', 'BOGA', 'ZAPPACOSTA']) {
      expect(p).not.toContain(nome);
    }
  });

  it('di chi deve uscire non dice più niente, nemmeno il ruolo', () => {
    // era la riga che generava «dovrà privarsi di un centrocampista» in
    // fondo a ogni paragrafo, e che schiacciava la pagina sullo stesso stampo
    const p = costruisciPromptMercato(richiesta());
    expect(p).not.toContain('dovrebbe privarsi');
    expect(p).toContain('Non scrivere mai che un club dovrà privarsi di qualcuno');
  });

  it('mette in apertura la trattativa scelta, e le altre nelle sezioni giuste', () => {
    const p = costruisciPromptMercato(richiesta());
    const ap = p.slice(p.indexOf('## La trattativa di apertura'), p.indexOf('## Gli altri duelli'));
    expect(ap).toContain('ZHEGROVA');
    expect(ap).not.toContain('OSMAJIC');
  });

  it('raggruppa per club le trattative in esclusiva, coi nomi in fila', () => {
    const p = costruisciPromptMercato(richiesta());
    const sezione = p.slice(p.indexOf('## Le trattative in esclusiva'), p.indexOf('## I club che non'));
    expect(sezione).toContain('### FC NTONIA');
    expect(sezione).toContain('vuole: OSMAJIC (Genoa)');
    expect(sezione).toContain('### FC Joga Benito');
    expect(sezione).toContain('vuole: HAINAUT (Venezia)');
  });

  it('chiede un paragrafo per club, col nome esatto', () => {
    const p = costruisciPromptMercato(richiesta());
    // a parità di trattative l'ordine è alfabetico, non quello di arrivo:
    // due generazioni della stessa sessione devono impaginare uguale
    expect(p).toContain('"squadre": [{ "squadra": "FC Joga Benito"');
    expect(p).toContain('{ "squadra": "FC NTONIA"');
    expect(p).toContain('Ogni trattativa compare una volta sola');
  });

  it('dice che l\'asta non si è ancora giocata', () => {
    const p = costruisciPromptMercato(richiesta());
    expect(p).toContain('giovedì 1 ottobre alle 21.30');
    expect(p).toContain('condizionale');
  });

  it('elenca i club fermi, che sono una notizia', () => {
    const p = costruisciPromptMercato(richiesta());
    expect(p).toContain('DEPORTIVO APERITIVO, Qarabaggio, FC CANEPARDO');
  });

  it('riporta le correzioni del tentativo respinto', () => {
    const p = costruisciPromptMercato(richiesta({ correzioni: ['ha nominato uno svincolando'] }));
    expect(p).toContain('respinto');
    expect(p).toContain('ha nominato uno svincolando');
  });
});

// ------------------------------------------------------------- licenze

describe('licenzeUsate', () => {
  it('conta le formule che dichiarano la voce', () => {
    expect(licenzeUsate('Si dice che il club spinga, e nell\'ambiente si mormora altro.')).toBe(3);
  });

  it('non conta niente in un testo di soli fatti', () => {
    expect(licenzeUsate('Il club ha avviato i contatti per il centrocampista.')).toBe(0);
  });
});

// ------------------------------------------------------------ verifica

/*
 * La pagina nuova: nessun duello oltre all'apertura (Zhegrova è l'apertura),
 * quindi «contesi» resta vuoto; un paragrafo a testa per NTONIA e Joga
 * Benito, che hanno una trattativa in esclusiva ciascuno; un paragrafo per i
 * tre club fermi.
 */
const testi = (p: Partial<TestiMercato> = {}): TestiMercato => ({
  titolo: 'Zhegrova, è sfida',
  gancio: 'l\'NTONIA accelera',
  cappello: Array.from({ length: 34 }, () => 'parola').join(' '),
  contesi: '',
  squadre: [
    { squadra: 'FC NTONIA', testo: 'L\'NTONIA avrebbe avviato i contatti per il genoano, senza concorrenza.' },
    { squadra: 'FC Joga Benito', testo: 'Il Joga Benito si sarebbe mosso in silenzio sul difensore del Venezia.' },
  ],
  ferme: 'Fermi invece gli altri tre, che non avrebbero sondato nessuno.',
  spalla: null, ...p,
});

describe('verificaMercato', () => {
  it('lascia passare una pagina in regola', () => {
    expect(verificaMercato(testi(), richiesta()).problemi).toEqual([]);
  });

  it('boccia il pezzo che nomina uno svincolando', () => {
    const e = verificaMercato(
      testi({ cappello: `${Array.from({ length: 30 }, () => 'parola').join(' ')} e saluta El Shaarawy` }),
      richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('EL SHAARAWY');
  });

  it('riconosce lo svincolando anche col solo cognome', () => {
    const e = verificaMercato(
      testi({ cappello: `${Array.from({ length: 30 }, () => 'parola').join(' ')} con Rodriguez in uscita` }),
      richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('RODRIGUEZ JE.');
  });

  it('boccia le parole da fantacalcio, che fanno cadere il gioco', () => {
    const e = verificaMercato(
      testi({ gancio: 'venti crediti' }), richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('crediti');
  });

  it('ma NON boccia una parola che contiene una radice per caso', () => {
    // la regressione del 30 settembre: «guastare» contiene «asta», e la
    // prima pagina di indiscrezioni vera è finita al ripiego per questo
    const e = verificaMercato(
      testi({ squadre: [
        { squadra: 'FC NTONIA', testo: 'Il Joga Benito vuole guastare la festa all\'NTONIA.' },
        { squadra: 'FC Joga Benito', testo: 'Nessuno si sarebbe mosso sul difensore.' },
      ] }),
      richiesta(),
    );
    expect(e.problemi).toEqual([]);
  });

  it('conta le licenze di colore e boccia chi esagera', () => {
    const troppo = Array.from({ length: MASSIME_LICENZE + 1 }, () => 'si dice che').join(' ');
    const e = verificaMercato(
      testi({ squadre: [
        { squadra: 'FC NTONIA', testo: troppo },
        { squadra: 'FC Joga Benito', testo: 'ok' },
      ] }),
      richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('formule di colore');
  });

  it('tiene le licenze entro il limite senza lamentarsi', () => {
    const e = verificaMercato(
      testi({ squadre: [
        { squadra: 'FC NTONIA', testo: 'Si dice che il club abbia sondato il terreno.' },
        { squadra: 'FC Joga Benito', testo: 'Nell\'ambiente se ne parla da giorni.' },
      ] }),
      richiesta(),
    );
    expect(e.problemi).toEqual([]);
  });

  it('si accorge se manca il paragrafo di un club', () => {
    const e = verificaMercato(testi({ squadre: [] }), richiesta());
    expect(e.problemi.join(' ')).toContain('manca il paragrafo di FC NTONIA');
    expect(e.problemi.join(' ')).toContain('manca il paragrafo di FC Joga Benito');
  });

  it('e se ne arriva uno di un club che non ha trattative in esclusiva', () => {
    const e = verificaMercato(
      testi({ squadre: [...testi().squadre, { squadra: 'Qarabaggio', testo: 'boh' }] }),
      richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('c\'è un paragrafo di Qarabaggio');
  });

  it('boccia «dovrà privarsi di un centrocampista» e tutta la famiglia', () => {
    for (const frase of [
      'Il club dovrà privarsi di un centrocampista.',
      'Toccherà rinunciare a un attaccante.',
      'Dovrà sacrificare un difensore.',
      'Serve fare spazio in rosa.',
    ]) {
      const e = verificaMercato(
        testi({ squadre: [
          { squadra: 'FC NTONIA', testo: frase },
          { squadra: 'FC Joga Benito', testo: 'Il Joga Benito guarda al Venezia.' },
        ] }),
        richiesta(),
      );
      expect({ frase, detto: e.problemi.join(' ').includes('è sottinteso') })
        .toEqual({ frase, detto: true });
    }
  });

  it('si accorge di due paragrafi che cominciano allo stesso modo', () => {
    const e = verificaMercato(
      testi({ squadre: [
        { squadra: 'FC NTONIA', testo: 'Il club avrebbe avviato i contatti per il genoano.' },
        { squadra: 'FC Joga Benito', testo: 'Il club avrebbe avviato i contatti per il veneziano.' },
      ] }),
      richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('cominciano allo stesso modo');
  });

  it('boccia i numeri inventati', () => {
    const e = verificaMercato(
      testi({ cappello: `${Array.from({ length: 30 }, () => 'parola').join(' ')} per 42.5 e via` }),
      richiesta(),
    );
    expect(e.inventati).toContain(42.5);
  });

  it('ammette i numeri che gli abbiamo dato', () => {
    const n = numeriDelMercato(richiesta());
    expect(n.has(3)).toBe(true);   // le trattative, e i club fermi
    expect(n.has(2)).toBe(true);   // i club in corsa su Zhegrova
    expect(n.has(1)).toBe(true);   // la sessione
    expect(n.has(42)).toBe(false);
  });
});

// ------------------------------------------------------------- lettura

describe('daJsonMercato', () => {
  it('regge una risposta vuota', () => {
    const t = daJsonMercato({});
    expect(t.titolo).toBe('');
    expect(t.contesi).toBe('');
    expect(t.squadre).toEqual([]);
    expect(t.ferme).toBe('');
    expect(t.spalla).toBeNull();
  });

  it('butta la spalla senza numero', () => {
    expect(daJsonMercato({ spalla: { didascalia: 'x' } }).spalla).toBeNull();
  });

  it('non si fida del tipo dei paragrafi di squadra', () => {
    expect(daJsonMercato({ squadre: 'no' }).squadre).toEqual([]);
  });
});

// ------------------------------------------------------------- ripiego

describe('mercatoDiRipiego', () => {
  it('sta dentro i limiti che la verifica applica', () => {
    for (const disposizione of ['sfondo', 'affianco', 'riquadro', 'senzaFoto'] as const) {
      const r = richiesta({ disposizione });
      const e = verificaMercato(mercatoDiRipiego(r), r);
      expect({ disposizione, problemi: e.problemi }).toEqual({ disposizione, problemi: [] });
    }
  });

  it('non nomina nessuno svincolando: non li ha nemmeno', () => {
    const r = richiesta();
    const t = mercatoDiRipiego(r);
    const tutto = [t.titolo, t.gancio, t.cappello, t.contesi, t.ferme,
      ...t.squadre.map((b) => b.testo)].join(' ');
    for (const nome of r.nomiVietati) expect(tutto).not.toContain(nome);
  });

  it('parla al condizionale, perché l\'asta non si è giocata', () => {
    const t = mercatoDiRipiego(richiesta());
    expect(t.cappello).toMatch(/avrebbe|sarebbe/);
  });

  it('senza trattative non esplode', () => {
    const r = richiesta({ trattative: [], apertura: '' });
    expect(() => mercatoDiRipiego(r)).not.toThrow();
    expect(mercatoDiRipiego(r).spalla).toBeNull();
  });
});

describe('quandoApreLaSala', () => {
  it('scrive la data come la direbbe un lancio, in ora italiana', () => {
    // l'asta vera della sessione 1: nel database è 19:30 UTC, in Italia
    // sono le 21.30 — scriverla com'è nel database vorrebbe dire dare al
    // gruppo l'appuntamento sbagliato di due ore
    expect(quandoApreLaSala('2026-10-01T19:30:00+00:00')).toBe('giovedì 1 ottobre alle 21.30');
  });

  it('tiene conto dell\'ora solare, quando arriva', () => {
    // a dicembre l'Italia è a UTC+1, non +2
    expect(quandoApreLaSala('2026-12-02T19:30:00+00:00')).toBe('mercoledì 2 dicembre alle 20.30');
  });
});

describe('paroleCheIniziano — il difetto che ha mandato al ripiego il primo pezzo vero', () => {
  it('«guastare» non è un\'asta, e nemmeno «bastardo» o «catasta»', () => {
    // il pezzo del 30 settembre è finito al ripiego per questo: la verifica
    // cercava «asta» dentro le parole e l'ha trovata in «guastare»
    expect(paroleCheIniziano('vuole guastare la festa', ['asta'])).toEqual([]);
    expect(paroleCheIniziano('un bastardo dentro una catasta', ['asta'])).toEqual([]);
    expect(paroleCheIniziano('la rugiada sulle rose', ['rosa'])).toEqual([]);
  });

  it('ma la parola vera la prende, anche attaccata a un apostrofo', () => {
    expect(paroleCheIniziano('si va all\'asta giovedì', ['asta'])).toEqual(['asta']);
    expect(paroleCheIniziano('due aste in tre settimane', ['aste'])).toEqual(['aste']);
    expect(paroleCheIniziano('ha speso i crediti', ['credit'])).toEqual(['crediti']);
  });

  it('le radici restano prefissi: svincol prende svincolati e svincolando', () => {
    expect(paroleCheIniziano('gli svincolati e lo svincolando', ['svincol']))
      .toEqual(['svincolati', 'svincolando']);
  });

  it('torna la parola come l\'ha scritta il modello, non la radice', () => {
    expect(paroleCheIniziano('la sua QUOTAZIONE', ['quotazion'])).toEqual(['quotazione']);
  });

  it('niente radici, niente problemi', () => {
    expect(paroleCheIniziano('un testo qualunque', [])).toEqual([]);
    expect(paroleCheIniziano('', ['asta'])).toEqual([]);
  });
});


describe('cosa manda al ripiego, e cosa no', () => {
  it('nemmeno uno svincolando nominato butta via il pezzo: resta un avviso', () => {
    const e = verificaMercato(
      testi({ cappello: `${Array.from({ length: 30 }, () => 'parola').join(' ')} e saluta El Shaarawy` }),
      richiesta(),
    );
    expect(e.problemi.join(' ')).toContain('EL SHAARAWY');
    expect(e.gravi).toEqual([]);   // il pezzo esce, con l'avviso in cima
  });

  it('il registro e i numeri sono avvisi', () => {
    const e = verificaMercato(testi({ gancio: 'venti crediti' }), richiesta());
    expect(e.problemi.length).toBeGreaterThan(0);
    expect(e.gravi).toEqual([]);
  });

  it('l\'unica cosa grave è non avere un testo', () => {
    expect(verificaMercato(testi({ titolo: '', cappello: '' }), richiesta()).gravi)
      .toEqual(['manca il titolo', 'manca il cappello']);
  });
});
