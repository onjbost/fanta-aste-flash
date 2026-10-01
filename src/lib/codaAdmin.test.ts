import { describe, expect, it } from 'vitest';
import {
  conteggi, corpoDeciso, frasePulita, gruppiDellaCoda, ordinaPerVista, rigaDaDecidere,
  soloSelezionate, type VoceCoda,
} from './codaAdmin';

/*
 * Le righe sono quelle vere della produzione del 1º ottobre, con le date
 * vere: quattro richieste di svincolo di settembre rimaste in coda per un
 * mese, le otto aggiudicazioni della prima asta, e la riga annullata.
 */
const voce = (p: Partial<VoceCoda> & { id: string }): VoceCoda => ({
  corpo: 'Nella rosa FC Joga Benito: svincolare ZALEWSKI (+1 cr), acquistare COULIBALY L. per 1 cr. Crediti: 14 → 14. Cambi CEN: 2 · lotto senza contendenti',
  fatto: false,
  fattoIl: null,
  creataIl: '2026-10-01T07:58:12.902Z',
  squadra: 'FC Joga Benito',
  squadraId: 's-joga',
  ...p,
});

const vere: VoceCoda[] = [
  voce({
    id: 'r1', corpo: 'Svincolo gratuito da decidere · FC CANEPARDO: NERES (A)',
    squadra: 'FC CANEPARDO', squadraId: 's-cane', creataIl: '2026-09-01T10:30:27.668Z',
  }),
  voce({ id: 'r2', creataIl: '2026-10-01T07:58:12.902Z' }),
  voce({
    id: 'r3', corpo: 'Nella rosa FC NTONIA: svincolare BOGA (+1 cr), acquistare OSMAJIC per 1 cr. Crediti: 0 → 0. Cambi ATT: 1 · lotto senza contendenti',
    squadra: 'FC NTONIA', squadraId: 's-ntonia', creataIl: '2026-10-01T07:58:13.433Z',
  }),
  voce({
    id: 'r4', corpo: 'Nella rosa FC Joga Benito: svincolare GAETANO (+3 cr), acquistare CAMBIAGHI per 3 cr. Crediti: 14 → 14. Cambi CEN: 1 · lotto senza contendenti',
    creataIl: '2026-10-01T07:58:13.978Z',
  }),
  voce({
    id: 'r5', corpo: 'ANNULLATO — Nella rosa FC Joga Benito: svincolare BOBCEK (+9 cr), acquistare MENDY P. per 9 cr. Crediti: 5 → 5. Cambi ATT: 1',
    fatto: true, fattoIl: '2026-10-01T16:32:47.352Z', creataIl: '2026-10-01T09:19:08.698Z',
  }),
  voce({
    id: 'r6', corpo: 'Controllare i crediti della lega prima dell\'asta',
    squadra: null, squadraId: null, creataIl: '2026-10-01T10:00:00.000Z',
  }),
];

describe('conteggi', () => {
  it('conta quante righe stanno in ciascuna vista', () => {
    expect(conteggi(vere)).toEqual({ daFare: 5, fatte: 1 });
  });

  it('su una coda vuota non inventa niente', () => {
    expect(conteggi([])).toEqual({ daFare: 0, fatte: 0 });
  });
});

describe('frasePulita', () => {
  it('toglie «Nella rosa <squadra>:» perché la squadra è già nel titolo del gruppo', () => {
    expect(frasePulita(vere[1])).toBe(
      'svincolare ZALEWSKI (+1 cr), acquistare COULIBALY L. per 1 cr. Crediti: 14 → 14. Cambi CEN: 2 · lotto senza contendenti',
    );
  });

  it('toglie la squadra anche dalle richieste di svincolo, che la scrivono dopo il punto', () => {
    expect(frasePulita(vere[0])).toBe('Svincolo gratuito da decidere · NERES (A)');
  });

  it('tiene «ANNULLATO —» davanti: è la prima cosa da vedere', () => {
    expect(frasePulita(vere[4])).toBe(
      'ANNULLATO — svincolare BOBCEK (+9 cr), acquistare MENDY P. per 9 cr. Crediti: 5 → 5. Cambi ATT: 1',
    );
  });

  it('lascia stare una frase che non nomina la squadra', () => {
    expect(frasePulita(vere[5])).toBe('Controllare i crediti della lega prima dell\'asta');
  });

  /*
   * Il caso che conta: una riga agganciata a una squadra il cui nome, nella
   * frase, non c'è. Succede se qualcuno rinomina la squadra dopo. Togliere
   * «alla cieca» i caratteri fino ai due punti mangerebbe mezza frase.
   */
  it('non taglia niente se il nome della squadra nella frase non c\'è', () => {
    const rinominata = voce({
      id: 'x', squadra: 'Joga Benito FC',
      corpo: 'Nella rosa FC Joga Benito: svincolare ZALEWSKI (+1 cr)',
    });
    expect(frasePulita(rinominata)).toBe('Nella rosa FC Joga Benito: svincolare ZALEWSKI (+1 cr)');
  });

  it('su una riga senza squadra non tocca niente', () => {
    const senza = voce({ id: 'y', squadra: null, squadraId: null, corpo: 'Nella rosa X: qualcosa' });
    expect(frasePulita(senza)).toBe('Nella rosa X: qualcosa');
  });
});

describe('ordinaPerVista', () => {
  it('da fare: le più vecchie in cima, perché il lavoro si fa in ordine', () => {
    const ids = ordinaPerVista(vere.filter((v) => !v.fatto), 'daFare').map((v) => v.id);
    expect(ids).toEqual(['r1', 'r2', 'r3', 'r4', 'r6']);
  });

  it('fatte: l\'ultima cosa fatta in cima, per ritrovare quello che hai appena spuntato', () => {
    const due = [
      voce({ id: 'a', fatto: true, fattoIl: '2026-10-01T10:00:00.000Z' }),
      voce({ id: 'b', fatto: true, fattoIl: '2026-10-01T18:00:00.000Z' }),
    ];
    expect(ordinaPerVista(due, 'fatte').map((v) => v.id)).toEqual(['b', 'a']);
  });

  /*
   * `done_at` è nullable, e nel database c'è già una riga fatta prima che
   * esistesse il bottone. Senza ricaduta sulla data di creazione quelle
   * righe si impilerebbero in un ordine qualsiasi.
   */
  it('fatte senza data: ricade sulla data di creazione invece di scompaginarsi', () => {
    const due = [
      voce({ id: 'a', fatto: true, fattoIl: null, creataIl: '2026-09-01T10:00:00.000Z' }),
      voce({ id: 'b', fatto: true, fattoIl: null, creataIl: '2026-09-30T10:00:00.000Z' }),
    ];
    expect(ordinaPerVista(due, 'fatte').map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('non cambia l\'elenco che le viene dato', () => {
    const originale = vere.filter((v) => !v.fatto);
    const copia = [...originale];
    ordinaPerVista(originale, 'daFare');
    expect(originale).toEqual(copia);
  });
});

describe('gruppiDellaCoda', () => {
  it('raggruppa per squadra, in ordine alfabetico italiano', () => {
    const g = gruppiDellaCoda(vere.filter((v) => !v.fatto), 'daFare');
    expect(g.map((x) => x.etichetta)).toEqual([
      'FC CANEPARDO', 'FC Joga Benito', 'FC NTONIA', 'Senza squadra',
    ]);
  });

  it('ordina alfabeticamente anche quando le righe arrivano al contrario', () => {
    // le righe arrivano nell'ordine del database, che non è quello dei nomi
    const g = gruppiDellaCoda([
      voce({ id: 'c', squadra: 'Qarabaggio', squadraId: 's-qara' }),
      voce({ id: 'b', squadra: 'Montester United', squadraId: 's-mont' }),
      voce({ id: 'a', squadra: 'Borussia Alecchiomund', squadraId: 's-boru' }),
    ], 'daFare');
    expect(g.map((x) => x.etichetta)).toEqual([
      'Borussia Alecchiomund', 'Montester United', 'Qarabaggio',
    ]);
  });

  /*
   * Con il confronto fra caratteri «Àlfa» starebbe dopo «Beta», perché la À
   * accentata viene dopo la Z nella tabella dei codici. Questa prova
   * smaschera quel confronto; non dice invece niente sulla locale italiana
   * in sé — su «Àlfa» e «Beta» qualunque `localeCompare` dà lo stesso
   * risultato, con o senza 'it'.
   */
  it('mette le accentate al posto giusto, non in fondo', () => {
    const g = gruppiDellaCoda([
      voce({ id: 'b', squadra: 'Beta', squadraId: 's-beta' }),
      voce({ id: 'a', squadra: 'Àlfa', squadraId: 's-alfa' }),
    ], 'daFare');
    expect(g.map((x) => x.etichetta)).toEqual(['Àlfa', 'Beta']);
  });

  it('dentro al gruppo tiene l\'ordine della vista', () => {
    const g = gruppiDellaCoda(vere.filter((v) => !v.fatto), 'daFare');
    const joga = g.find((x) => x.etichetta === 'FC Joga Benito')!;
    expect(joga.voci.map((v) => v.id)).toEqual(['r2', 'r4']);
  });

  it('le righe senza squadra stanno in fondo, non in mezzo all\'alfabeto', () => {
    const g = gruppiDellaCoda([
      voce({ id: 'z', squadra: null, squadraId: null }),
      voce({ id: 'q', squadra: 'Qarabaggio', squadraId: 's-qara' }),
    ], 'daFare');
    expect(g.map((x) => x.etichetta)).toEqual(['Qarabaggio', 'Senza squadra']);
  });

  it('su una coda vuota non fa nessun gruppo', () => {
    expect(gruppiDellaCoda([], 'daFare')).toEqual([]);
  });
});

describe('soloSelezionate', () => {
  it('tiene solo gli id che sono davvero nella vista', () => {
    // la selezione vive nel browser: cambiando vista o ricaricando può
    // contenere id che qui non ci sono più
    expect(soloSelezionate(['r2', 'r4', 'inventato'], vere)).toEqual(['r2', 'r4']);
  });

  it('senza niente di selezionato non manda niente', () => {
    expect(soloSelezionate([], vere)).toEqual([]);
  });
});

describe('la riga dello svincolo che si chiude da sé', () => {
  const corpo = 'Svincolo gratuito da decidere · FC CANEPARDO: NERES (A)';
  const conCoda = 'Svincolo gratuito da decidere · Montester United: YILDIZ (A)'
    + ' — congela la chiamata su ZHEGROVA';

  it('riconosce la riga di quella squadra su quel giocatore', () => {
    expect(rigaDaDecidere(corpo, 'FC CANEPARDO', 'NERES')).toBe(true);
    expect(rigaDaDecidere(conCoda, 'Montester United', 'YILDIZ')).toBe(true);
  });

  it('non riconosce quella di un altro giocatore', () => {
    expect(rigaDaDecidere(corpo, 'FC CANEPARDO', 'NOSLIN')).toBe(false);
  });

  /*
   * Il caso per cui serve la squadra. `players` è unica su (lega, ext_id) e
   * non sul nome: due giocatori omonimi nella stessa lega esistono. Senza
   * questo controllo la decisione di una squadra chiuderebbe — e
   * riscriverebbe col verbo sbagliato — la riga ancora aperta di un'altra.
   * Nel ritiro è peggio: a premere il bottone è un allenatore qualunque.
   */
  it('non riconosce la riga di un\'altra squadra sullo stesso nome', () => {
    expect(rigaDaDecidere(corpo, 'Qarabaggio', 'NERES')).toBe(false);
  });

  /*
   * Il nome del giocatore compare anche in altre righe della coda, e
   * chiuderle vorrebbe dire spuntare un movimento che nessuno ha riportato.
   * Questa è costruita apposta perché contenga «: NERES (»: altrimenti
   * cadrebbe sull'esordio della frase e non proverebbe niente sul resto.
   */
  it('non tocca le righe che non sono richieste di svincolo', () => {
    const acquisto = 'Nella rosa FC CANEPARDO: NERES (A) è entrato, svincolato TIZIO';
    expect(acquisto).toContain(': NERES (');
    expect(rigaDaDecidere(acquisto, 'FC CANEPARDO', 'NERES')).toBe(false);
  });

  /*
   * Un nome contenuto in un altro — MENDY dentro MENDY P. — non deve
   * agganciare la riga sbagliata: il confronto arriva fino alla parentesi
   * del ruolo. Lo stesso per la squadra: «FC» dentro «FC CANEPARDO».
   */
  it('non confonde un nome contenuto in un altro', () => {
    const mendyP = 'Svincolo gratuito da decidere · Qarabaggio: MENDY P. (A)';
    expect(rigaDaDecidere(mendyP, 'Qarabaggio', 'MENDY')).toBe(false);
    expect(rigaDaDecidere(mendyP, 'Qarabaggio', 'MENDY P.')).toBe(true);
  });

  it('non confonde una squadra contenuta in un\'altra', () => {
    expect(rigaDaDecidere(corpo, 'FC', 'NERES')).toBe(false);
  });

  /*
   * Una riga già decisa non deve farsi riscrivere una seconda volta. Oggi
   * non ci arriverebbe comunque — chi la cerca filtra le righe non fatte —
   * ma il riconoscimento deve reggere da sé: è l'unica cosa che distingue
   * una domanda aperta da una risposta già data.
   */
  it('non riapre una riga già decisa', () => {
    const gia = 'Svincolo gratuito approvato · FC CANEPARDO: NERES (A)';
    expect(rigaDaDecidere(gia, 'FC CANEPARDO', 'NERES')).toBe(false);
  });

  it('riscrive la riga con l\'esito, lasciando intatto il resto', () => {
    expect(corpoDeciso(corpo, 'approvato'))
      .toBe('Svincolo gratuito approvato · FC CANEPARDO: NERES (A)');
    expect(corpoDeciso(corpo, 'respinto'))
      .toBe('Svincolo gratuito respinto · FC CANEPARDO: NERES (A)');
    expect(corpoDeciso(conCoda, 'ritirato'))
      .toBe('Svincolo gratuito ritirato · Montester United: YILDIZ (A)'
        + ' — congela la chiamata su ZHEGROVA');
  });

  it('una riga che non comincia come previsto resta com\'è', () => {
    const altra = 'Nella rosa FC CANEPARDO: svincolare TIZIO (+1 cr)';
    expect(corpoDeciso(altra, 'approvato')).toBe(altra);
  });
});
