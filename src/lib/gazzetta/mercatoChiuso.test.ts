import { describe, expect, it } from 'vitest';
import {
  astaDiApertura, chiusuraDiRipiego, contese, costruisciPromptChiusura, daJsonChiusura,
  montaChiusura, numeriDellaChiusura, paganteDi, senzaContendenti, titoloAsta,
  verificaChiusura,
  type AstaConclusa, type RichiestaChiusura, type ScambioFatto, type TestiChiusura,
} from './mercatoChiuso';

const asta = (p: Partial<AstaConclusa> & { lottoId: string }): AstaConclusa => ({
  giocatore: 'ROMANO', ruolo: 'C', club: 'Cremonese', quotazione: 9,
  vincitore: 'FC NTONIA', prezzo: 12, chiamante: 'FC NTONIA', battute: [],
  ...p,
});

const scambio = (p: Partial<ScambioFatto> & { id: string }): ScambioFatto => ({
  squadraA: 'Montester United', squadraB: 'Pirati dei Caracoli',
  versoB: ['DE BRUYNE'], versoA: ['ZACCAGNI'], conguaglio: 0, pagante: null,
  ...p,
});

const richiesta = (p: Partial<RichiestaChiusura> = {}): RichiestaChiusura => {
  const aste = p.aste ?? [asta({ lottoId: 'l1' })];
  return {
    tono: 4, sessione: 1, quando: 'giovedì 1 ottobre alle 21.30',
    disposizione: 'sfondo', aste, apertura: astaDiApertura(aste) ?? 'l1',
    scambi: [], fermi: [], paroleVietate: [], nomiVietati: [],
    ...p,
  };
};

describe('contese e svincolati', () => {
  it('un lotto con almeno un avversario è conteso, uno senza no', () => {
    const a = [
      asta({ lottoId: 'l1', battute: ['FC Joga Benito'] }),
      asta({ lottoId: 'l2' }),
    ];
    expect(contese(a).map((x) => x.lottoId)).toEqual(['l1']);
    expect(senzaContendenti(a).map((x) => x.lottoId)).toEqual(['l2']);
  });
});

describe('astaDiApertura', () => {
  it('apre la quotazione più alta FRA QUELLE CONTESE, non in assoluto', () => {
    const a = [
      // il più pregiato, ma nessuno gliel'ha conteso
      asta({ lottoId: 'liscio', quotazione: 30, prezzo: 1 }),
      asta({ lottoId: 'duello-piccolo', quotazione: 8, battute: ['Qarabaggio'] }),
      asta({ lottoId: 'duello-grosso', quotazione: 19, battute: ['Qarabaggio', 'Montester United'] }),
    ];
    expect(astaDiApertura(a)).toBe('duello-grosso');
  });

  it('a parità di quotazione apre chi è costato di più', () => {
    const a = [
      asta({ lottoId: 'a', quotazione: 12, prezzo: 14, battute: ['X'] }),
      asta({ lottoId: 'b', quotazione: 12, prezzo: 31, battute: ['Y'] }),
    ];
    expect(astaDiApertura(a)).toBe('b');
  });

  it('a parità di tutto l\'ordine è stabile, non casuale', () => {
    const a = [
      asta({ lottoId: 'bbb', quotazione: 12, prezzo: 14, battute: ['X'] }),
      asta({ lottoId: 'aaa', quotazione: 12, prezzo: 14, battute: ['Y'] }),
    ];
    expect(astaDiApertura(a)).toBe('aaa');
    expect(astaDiApertura(a.slice().reverse())).toBe('aaa');
  });

  it('se nessuna è stata contesa la pagina non resta senza apertura', () => {
    const a = [asta({ lottoId: 'x', quotazione: 4 }), asta({ lottoId: 'y', quotazione: 22 })];
    expect(astaDiApertura(a)).toBe('y');
  });

  it('senza aste non c\'è apertura', () => {
    expect(astaDiApertura([])).toBeNull();
  });
});

describe('il prompt', () => {
  const r = richiesta({
    aste: [
      asta({ lottoId: 'l1', giocatore: 'ZHEGROVA', quotazione: 19, prezzo: 34, battute: ['FC Joga Benito'] }),
      asta({ lottoId: 'l2', giocatore: 'OSMAJIC', quotazione: 11, prezzo: 21, battute: ['Qarabaggio'] }),
      asta({ lottoId: 'l3', giocatore: 'HAINAUT', quotazione: 5, prezzo: 1 }),
    ],
    scambi: [scambio({ id: 's1' })],
  });
  const p = costruisciPromptChiusura(r);

  it('mette in apertura l\'asta scelta e le altre contese in un paragrafo solo', () => {
    expect(p).toContain('## L\'asta di apertura');
    expect(p.split('## Le altre aste contese')[0]).toContain('ZHEGROVA');
    expect(p.split('## Le altre aste contese')[1].split('## Chi è passato')[0]).toContain('OSMAJIC');
    expect(p).toContain('vanno tutte in UN paragrafo solo');
  });

  it('i non contesi sono raggruppati per club, non lotto per lotto', () => {
    const senza = p.split('club per club — un paragrafo per club')[1].split('## I club usciti')[0];
    expect(senza).toContain('### FC NTONIA');
    expect(senza).toContain('si è preso: HAINAUT');
  });

  it('non dice mai che qualcuno è dovuto uscire', () => {
    expect(p).toContain('Non scrivere mai che un club ha dovuto privarsi di qualcuno');
  });

  it('chiede l\'indicativo e vieta il condizionale', () => {
    expect(p).toContain('non usare mai il condizionale');
  });

  it('gli scambi arrivano col loro id, per poterli rimettere al posto giusto', () => {
    expect(p).toContain('id: s1');
    expect(p).toContain('"id": "s1"');
  });

  it('le correzioni del tentativo precedente finiscono nel prompt', () => {
    const con = costruisciPromptChiusura({ ...r, correzioni: ['ha usato il condizionale'] });
    expect(con).toContain('ha usato il condizionale');
  });
});

describe('la verifica', () => {
  const r = richiesta({
    aste: [
      asta({ lottoId: 'l1', giocatore: 'ZHEGROVA', quotazione: 19, prezzo: 34, battute: ['FC Joga Benito'] }),
      asta({ lottoId: 'l2', giocatore: 'OSMAJIC', quotazione: 11, prezzo: 21, battute: ['Qarabaggio'] }),
    ],
    scambi: [scambio({ id: 's1' })],
    nomiVietati: ['LUKAKU'],
  });
  const buono = (): TestiChiusura => ({
    titolo: 'Zhegrova al Ntonia', gancio: 'per 34', 
    cappello: 'Il centrocampista della Cremonese è il colpo di questa finestra: il Ntonia se l\'è portato a casa per 34 dopo un duello lungo col Joga Benito, che ha alzato bandiera bianca quando i numeri hanno smesso di tornare e ha guardato gli altri festeggiare in silenzio.',
    contesi: 'Il Qarabaggio ci ha provato, ma Osmajic è finito al Ntonia per 21.',
    squadre: [],
    ferme: '',
    scambi: [{ id: 's1', testo: 'Montester e Pirati si sono scambiati De Bruyne e Zaccagni.' }],
    spalla: { numero: '34', didascalia: 'il prezzo più alto della sessione.' },
  });

  it('un pezzo giusto passa', () => {
    const e = verificaChiusura(buono(), r);
    expect(e.problemi).toEqual([]);
    expect(e.ok).toBe(true);
  });

  it('boccia un numero inventato', () => {
    const t = buono();
    t.contesi = 'Il Qarabaggio si era spinto fino a 17, ma Osmajic è finito al Ntonia per 21.';
    const e = verificaChiusura(t, r);
    expect(e.inventati).toContain(17);
    expect(e.ok).toBe(false);
  });

  it('boccia il condizionale: qui è tutto già successo', () => {
    const t = buono();
    t.contesi = 'Il Qarabaggio avrebbe provato a inserirsi.';
    expect(verificaChiusura(t, r).problemi.join(' ')).toContain('condizionale');
  });

  it('boccia un nome che in pagina non deve comparire', () => {
    const t = buono();
    t.contesi = 'Anche LUKAKU è passato senza opposizione.';
    expect(verificaChiusura(t, r).problemi.join(' ')).toContain('LUKAKU');
  });

  it('i crediti e le aste qui si possono nominare, il listone no', () => {
    const t = buono();
    t.scambi[0].testo = 'Un\'asta vera, chiusa a 34 crediti.';
    expect(verificaChiusura(t, r).ok).toBe(true);

    const t2 = buono();
    t2.scambi[0].testo = 'Un nome che sul listone valeva poco.';
    expect(verificaChiusura(t2, r).problemi.join(' ')).toContain('listone');
  });

  it('si accorge se manca il paragrafo delle aste contese', () => {
    const senza = buono(); senza.contesi = '';
    expect(verificaChiusura(senza, r).problemi.join(' ')).toContain('manca il paragrafo sulle altre aste contese');
  });

  it('e se ne arriva uno di un club che non ha preso nessuno in esclusiva', () => {
    const troppo = buono();
    troppo.squadre.push({ squadra: 'Qarabaggio', testo: 'boh' });
    expect(verificaChiusura(troppo, r).problemi.join(' ')).toContain('c\'è un paragrafo di Qarabaggio');
  });

  it('boccia «ha dovuto privarsi di un centrocampista» e la sua famiglia', () => {
    const t = buono();
    t.contesi = 'Il Ntonia l\'ha spuntata ma ha dovuto privarsi di un centrocampista.';
    expect(verificaChiusura(t, r).problemi.join(' ')).toContain('è sottinteso');
  });

  it('boccia uno scambio mancante: il riquadro resterebbe con un buco', () => {
    const t = buono(); t.scambi = [];
    expect(verificaChiusura(t, r).problemi.join(' ')).toContain('manca la riga dello scambio s1');
  });

  it('boccia un titolo troppo lungo', () => {
    const t = buono();
    t.titolo = 'Un titolo lunghissimo che non starebbe mai dentro la prima pagina';
    expect(verificaChiusura(t, r).problemi.join(' ')).toContain('caratteri invece di 44');
  });
});

describe('numeriDellaChiusura', () => {
  it('ammette prezzi, quotazioni, conguagli e le cifre della data', () => {
    const r = richiesta({
      aste: [asta({ lottoId: 'l1', quotazione: 19, prezzo: 34, battute: ['X'] })],
      scambi: [scambio({ id: 's1', conguaglio: 7, pagante: 'A' })],
    });
    const n = numeriDellaChiusura(r);
    expect(n.has(34)).toBe(true);
    expect(n.has(19)).toBe(true);
    expect(n.has(7)).toBe(true);
    expect(n.has(21.3)).toBe(true);   // «alle 21.30»
    expect(n.has(999)).toBe(false);
  });
});

describe('il ripiego', () => {
  const r = richiesta({
    aste: [
      asta({ lottoId: 'l1', giocatore: 'ZHEGROVA', quotazione: 19, prezzo: 34, battute: ['FC Joga Benito'] }),
      asta({ lottoId: 'l2', giocatore: 'OSMAJIC', quotazione: 11, prezzo: 21, battute: ['Qarabaggio'] }),
      asta({ lottoId: 'l3', giocatore: 'HAINAUT', quotazione: 5, prezzo: 1 }),
    ],
    scambi: [scambio({ id: 's1' })],
  });

  it('passa la sua stessa verifica: una pagina che non si può mandare non è un ripiego', () => {
    const e = verificaChiusura(chiusuraDiRipiego(r), r);
    expect(e.problemi).toEqual([]);
  });

  it('dice chi ha vinto, a quanto e contro chi', () => {
    const t = chiusuraDiRipiego(r);
    expect(t.titolo).toContain('ZHEGROVA');
    expect(t.gancio).toContain('34');
    expect(t.cappello).toContain('FC Joga Benito');
    expect(t.squadre.map((x) => x.squadra)).toEqual(['FC NTONIA']);
    expect(t.squadre[0].testo).toContain('HAINAUT');
    expect(t.contesi).toContain('OSMAJIC');
    expect(t.scambi.map((s) => s.id)).toEqual(['s1']);
  });

  it('regge anche una sessione senza scambi e senza contese', () => {
    const vuota = richiesta({ aste: [asta({ lottoId: 'solo' })], scambi: [] });
    const t = chiusuraDiRipiego(vuota);
    expect(verificaChiusura(t, vuota).problemi).toEqual([]);
    expect(t.scambi).toEqual([]);
  });
});

describe('il montaggio', () => {
  const r = richiesta({
    aste: [
      asta({ lottoId: 'l1', giocatore: 'ZHEGROVA', quotazione: 19, prezzo: 34, battute: ['FC Joga Benito'] }),
      asta({ lottoId: 'l2', giocatore: 'OSMAJIC', quotazione: 11, prezzo: 21, battute: ['Qarabaggio'] }),
      asta({ lottoId: 'l3', giocatore: 'HAINAUT', quotazione: 5, prezzo: 1, vincitore: 'Qarabaggio' }),
    ],
    scambi: [scambio({ id: 's1' })],
  });
  const d = montaChiusura(chiusuraDiRipiego(r), { richiesta: r, foto: null });

  it('è la sua edizione, e non finisce nel mazzo delle altre', () => {
    expect(d.tipo).toBe('mercato_chiuso');
    expect(d.titoloAltre).toBe('Squadra per squadra');
  });

  it('il riquadro di sinistra ha le altre aste e poi un paragrafo per club', () => {
    expect(d.altre.map((x) => x.titolo)).toEqual(['Le altre aste', 'Qarabaggio']);
    expect(d.altre[0].testo).toContain('OSMAJIC');
    expect(d.altre[1].testo).toContain('HAINAUT');
  });

  it('gli scambi stanno nella colonna di destra, che nelle indiscrezioni era vuota', () => {
    expect(d.colonna?.titolo).toBe('Gli scambi');
    expect(d.colonna?.voci[0].titolo).toBe('Montester United - Pirati dei Caracoli');
    expect(d.colonna?.voci[0].testo).toContain('DE BRUYNE');
  });

  it('senza scambi la colonna non c\'è, invece di esserci vuota', () => {
    const senza = richiesta({ aste: r.aste, scambi: [] });
    expect(montaChiusura(chiusuraDiRipiego(senza), { richiesta: senza, foto: null }).colonna).toBeNull();
  });

  it('niente classifiche né calendari: qui si parla solo di mercato', () => {
    expect(d.classifica).toEqual([]);
    expect(d.prossimi).toEqual([]);
    expect(d.gironi).toBeNull();
  });

  it('il sottotitolo dice il fatto principale per intero', () => {
    expect(d.sottotitolo).toBe('ZHEGROVA (Cremonese) al FC NTONIA per 34');
  });
});

describe('daJsonChiusura', () => {
  it('regge un JSON storto senza esplodere', () => {
    const t = daJsonChiusura({ titolo: 42, squadre: 'no', scambi: [{ id: 's1' }] });
    expect(t.titolo).toBe('42');
    expect(t.squadre).toEqual([]);
    expect(t.contesi).toBe('');
    expect(t.scambi).toEqual([{ id: 's1', testo: '' }]);
    expect(t.spalla).toBeNull();
  });
});

describe('le briciole', () => {
  it('il titoletto del blocco porta club e prezzo, che sono fatti nostri', () => {
    expect(titoloAsta(asta({ lottoId: 'x', giocatore: 'KEAN', club: 'Fiorentina', prezzo: 8 })))
      .toBe('KEAN (Fiorentina) · 8');
  });

  it('il conguaglio ha un nome solo quando c\'è davvero', () => {
    expect(paganteDi(scambio({ id: 's', conguaglio: 0, pagante: 'A' }))).toBeNull();
    expect(paganteDi(scambio({ id: 's', conguaglio: 5, pagante: 'B' }))).toBe('Pirati dei Caracoli');
  });
});


describe('cosa manda al ripiego, e cosa no', () => {
  const r = richiesta({ aste: [asta({ lottoId: 'l1', battute: ['X'] })], nomiVietati: ['LUKAKU'] });
  const buono = (): TestiChiusura => ({
    titolo: 'Romano al Ntonia', gancio: 'per 12',
    cappello: Array.from({ length: 30 }, () => 'parola').join(' '),
    contesi: '', squadre: [], ferme: '', scambi: [], spalla: null,
  });

  it('un numero inventato resta un avviso: la pagina la rileggi tu', () => {
    const t = buono();
    t.contesi = 'Un rilancio da 999 non lo aveva visto nessuno.';
    const e = verificaChiusura(t, r);
    expect(e.problemi.join(' ')).toContain('999');
    expect(e.gravi).toEqual([]);
  });

  it('e nemmeno un nome vietato o un condizionale', () => {
    const t = buono();
    t.contesi = 'Anche LUKAKU sarebbe passato senza opposizione.';
    const e = verificaChiusura(t, r);
    expect(e.problemi.length).toBeGreaterThan(0);
    expect(e.gravi).toEqual([]);
  });

  it('solo il vuoto è grave', () => {
    expect(verificaChiusura({ ...buono(), titolo: '', cappello: '' }, r).gravi)
      .toEqual(['manca il titolo', 'manca il cappello']);
  });
});
