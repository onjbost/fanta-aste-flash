import { describe, it, expect } from 'vitest';
import {
  AZIONI, ETICHETTA_AZIONE, chiFirma, fineGiornoRoma, inizioGiornoRoma, nomeAttore,
  quandoLeggibile, rigaDelRegistro,
  type VoceDelRegistro,
} from './registro';

/**
 * Le frasi del registro.
 *
 * Stanno qui e non nel database: una riga del registro è un fatto, e la frase
 * che lo racconta si compone in lettura. Così una formulazione sbagliata si
 * corregge per tutte le righe, comprese quelle di tre mesi fa, e il modo in
 * cui la lega racconta le proprie azioni resta in un posto solo.
 */

const voce = (over: Partial<VoceDelRegistro> = {}): VoceDelRegistro => ({
  avvenutoIl: '2026-10-01T07:22:00Z',
  azione: 'chiamata',
  attore: { nome: 'Mattia', squadra: 'FC Joga Benito' },
  daAdmin: false,
  giocatore: 'HAINAUT',
  dati: {},
  ...over,
});

describe('il nome di chi ha agito', () => {
  it('è l\'username, se se l\'è messo', () => {
    expect(nomeAttore({ username: 'Mattia', email: 'gattuccio.mattia@gmail.com' })).toBe('Mattia');
  });

  it('altrimenti è l\'email, come si era detto', () => {
    expect(nomeAttore({ username: null, email: 'gattuccio.mattia@gmail.com' }))
      .toBe('gattuccio.mattia@gmail.com');
  });

  it('per le righe vecchie vale il nome fotografato allora', () => {
    // il travaso dello storico non sa quale dei due allenatori avesse agito:
    // in quelle righe c'è la squadra, e va bene così
    expect(nomeAttore({ username: null, email: null, nomeSalvato: 'FC Joga Benito' }))
      .toBe('FC Joga Benito');
  });

  it('se non si sa niente non inventa un nome', () => {
    expect(nomeAttore({ username: null, email: null })).toBe('Qualcuno');
  });

  it('un username di soli spazi non conta come username', () => {
    expect(nomeAttore({ username: '   ', email: 'tizio@esempio.it' })).toBe('tizio@esempio.it');
  });
});

describe('la firma: nome e squadra', () => {
  it('mette la squadra fra parentesi, perché è quella che si ricorda', () => {
    expect(chiFirma('Mattia', 'FC Joga Benito')).toBe('Mattia (FC Joga Benito)');
  });

  it('senza squadra resta il nome', () => {
    expect(chiFirma('Mattia', null)).toBe('Mattia');
  });

  it('se il nome è già quello della squadra non lo ripete', () => {
    // succede per le righe travasate dallo storico
    expect(chiFirma('FC Joga Benito', 'FC Joga Benito')).toBe('FC Joga Benito');
  });
});

describe('la data, nell\'ora di Roma', () => {
  it('scrive giorno, mese e ora', () => {
    // 07:22 UTC d'estate sono le 09:22 a Roma
    expect(quandoLeggibile('2026-10-01T07:22:00Z')).toBe('1 ottobre, 09:22');
  });

  it('a gennaio l\'ora di Roma è un\'ora avanti, non due', () => {
    expect(quandoLeggibile('2027-01-15T07:22:00Z')).toBe('15 gennaio, 08:22');
  });

  it('non sposta il giorno sbagliando il fuso', () => {
    // 23:30 UTC del 31 dicembre a Roma è già l'1 gennaio
    expect(quandoLeggibile('2026-12-31T23:30:00Z')).toBe('1 gennaio, 00:30');
  });
});

describe('le frasi, una per azione', () => {
  it('la chiamata, senza svelare lo svincolando', () => {
    /*
     * Il registro è pubblico, e fino all'apertura della sala lo svincolando
     * dichiarato è segreto: è il cuore della segretezza dell'asta. Qui non
     * compare, né nelle chiamate né nelle adesioni.
     */
    const r = rigaDelRegistro(voce());
    expect(r).toBe('Mattia (FC Joga Benito) ha chiamato HAINAUT all\'asta');
    expect(r).not.toContain('svincola');
  });

  it('l\'adesione', () => {
    expect(rigaDelRegistro(voce({ azione: 'adesione', giocatore: 'MENDY P.' })))
      .toBe('Mattia (FC Joga Benito) ha aderito all\'asta per MENDY P.');
  });

  it('l\'acquisto, dove invece si dice tutto: è pubblico', () => {
    expect(rigaDelRegistro(voce({
      azione: 'acquisto_asta', giocatore: 'MENDY P.',
      dati: { prezzo: 14, uscito: 'BOBCEK', rimborso: 9 },
    }))).toBe('Mattia (FC Joga Benito) si è preso MENDY P. per 14 crediti, svincolando BOBCEK (+9)');
  });

  it('un credito solo è al singolare: metà dei lotti vanno a uno', () => {
    expect(rigaDelRegistro(voce({
      azione: 'acquisto_asta', giocatore: 'COULIBALY L.',
      dati: { prezzo: 1, uscito: 'ZALEWSKI', rimborso: 1 },
    }))).toBe('Mattia (FC Joga Benito) si è preso COULIBALY L. per 1 credito, svincolando ZALEWSKI (+1)');

    expect(rigaDelRegistro(voce({
      azione: 'rosa_aggiunto', giocatore: 'GATTI', daAdmin: true,
      dati: { squadra: 'Pirati', prezzo: 1 },
    }))).toContain('per 1 credito');
  });

  it('l\'acquisto senza contendenti lo dice', () => {
    expect(rigaDelRegistro(voce({
      azione: 'acquisto_asta', giocatore: 'ROMANO',
      dati: { prezzo: 2, uscito: 'LONTANI', rimborso: 2, senzaContendenti: true },
    }))).toBe('Mattia (FC Joga Benito) si è preso ROMANO per 2 crediti, svincolando LONTANI (+2) · nessuno se lo contendeva');
  });

  it('lo svincolo gratuito, chiesto e deciso', () => {
    expect(rigaDelRegistro(voce({ azione: 'svincolo_richiesto', giocatore: 'ORSOLINI' })))
      .toBe('Mattia (FC Joga Benito) ha chiesto lo svincolo gratuito di ORSOLINI');

    expect(rigaDelRegistro(voce({
      azione: 'svincolo_approvato', giocatore: 'ORSOLINI', daAdmin: true,
      attore: { nome: 'Mattia', squadra: 'FC Joga Benito' },
      dati: { squadra: 'Pirati' },
    }))).toBe('Mattia (FC Joga Benito) ha approvato lo svincolo gratuito di ORSOLINI chiesto da Pirati');

    expect(rigaDelRegistro(voce({
      azione: 'svincolo_respinto', giocatore: 'ORSOLINI', daAdmin: true,
      dati: { squadra: 'Pirati' },
    }))).toContain('ha respinto lo svincolo gratuito di ORSOLINI chiesto da Pirati');
  });

  it('la schedina', () => {
    expect(rigaDelRegistro(voce({
      azione: 'schedina', giocatore: null, dati: { giornata: 6, giocate: 4 },
    }))).toBe('Mattia (FC Joga Benito) ha giocato la schedina della giornata 6, con 4 pronostici');
  });

  it('una sola giocata si dice al singolare', () => {
    expect(rigaDelRegistro(voce({
      azione: 'schedina', giocatore: null, dati: { giornata: 6, giocate: 1 },
    }))).toContain('con 1 pronostico');
  });

  it('lo scambio nomina le due squadre, non chi ha premuto il bottone', () => {
    // lo scambio lo registra l'admin, ma il fatto è di chi scambia
    expect(rigaDelRegistro(voce({
      azione: 'scambio', giocatore: null, daAdmin: true,
      dati: { squadraA: 'Pirati', squadraB: 'Qarabaggio', da: ['CAMBIAGHI'], a: ['ESPOSITO S.'] },
    }))).toBe('Scambio fra Pirati e Qarabaggio: CAMBIAGHI a Qarabaggio, ESPOSITO S. a Pirati');
  });

  it('lo scambio col conguaglio dice chi paga', () => {
    expect(rigaDelRegistro(voce({
      azione: 'scambio', giocatore: null, daAdmin: true,
      dati: {
        squadraA: 'Pirati', squadraB: 'Qarabaggio',
        da: ['CAMBIAGHI'], a: ['ESPOSITO S.'], conguaglio: 5, paga: 'Pirati',
      },
    }))).toContain('· conguaglio 5 crediti da Pirati');
  });

  it('lo scambio disfatto', () => {
    expect(rigaDelRegistro(voce({
      azione: 'scambio_disfatto', giocatore: null, daAdmin: true,
      dati: { squadraA: 'Pirati', squadraB: 'Qarabaggio' },
    }))).toBe('Mattia (FC Joga Benito) ha disfatto lo scambio fra Pirati e Qarabaggio');
  });

  it('l\'apertura della sala', () => {
    expect(rigaDelRegistro(voce({
      azione: 'sala_aperta', giocatore: null, daAdmin: true,
      dati: { asta: 1, assegnatiSenzaAsta: 4 },
    }))).toBe('Mattia (FC Joga Benito) ha aperto la sala dell\'asta 1 · 4 lotti assegnati senza contendenti');
  });

  it('l\'apertura senza lotti d\'ufficio non aggiunge niente', () => {
    expect(rigaDelRegistro(voce({
      azione: 'sala_aperta', giocatore: null, daAdmin: true,
      dati: { asta: 2, assegnatiSenzaAsta: 0 },
    }))).toBe('Mattia (FC Joga Benito) ha aperto la sala dell\'asta 2');
  });

  it('l\'assegnazione a mano e l\'annullo', () => {
    expect(rigaDelRegistro(voce({
      azione: 'lotto_assegnato_a_mano', giocatore: 'MENDY P.', daAdmin: true,
      dati: { squadra: 'FC Joga Benito', prezzo: 14 },
    }))).toBe('Mattia (FC Joga Benito) ha assegnato MENDY P. a FC Joga Benito per 14 crediti, senza battere l\'asta');

    expect(rigaDelRegistro(voce({
      azione: 'lotto_annullato', giocatore: 'MENDY P.', daAdmin: true,
      dati: { squadra: 'FC Joga Benito', prezzo: 14 },
    }))).toBe('Mattia (FC Joga Benito) ha annullato l\'aggiudicazione di MENDY P. a FC Joga Benito');
  });

  it('le modifiche alle rose', () => {
    expect(rigaDelRegistro(voce({
      azione: 'rosa_prezzo', giocatore: 'SCALVINI', daAdmin: true,
      dati: { squadra: 'Pirati', prima: 32, dopo: 28 },
    }))).toBe('Mattia (FC Joga Benito) ha corretto il prezzo di SCALVINI nella rosa Pirati: da 32 a 28 crediti');

    expect(rigaDelRegistro(voce({
      azione: 'rosa_aggiunto', giocatore: 'GATTI', daAdmin: true,
      dati: { squadra: 'Pirati', prezzo: 20 },
    }))).toBe('Mattia (FC Joga Benito) ha aggiunto GATTI alla rosa Pirati per 20 crediti');

    expect(rigaDelRegistro(voce({
      azione: 'rosa_tolto', giocatore: 'GATTI', daAdmin: true,
      dati: { squadra: 'Pirati', rimborso: 20 },
    }))).toBe('Mattia (FC Joga Benito) ha tolto GATTI dalla rosa Pirati, restituendo 20 crediti');

    expect(rigaDelRegistro(voce({
      azione: 'rosa_tolto', giocatore: 'GATTI', daAdmin: true,
      dati: { squadra: 'Pirati' },
    }))).toBe('Mattia (FC Joga Benito) ha tolto GATTI dalla rosa Pirati');
  });

  it('l\'import e i crediti', () => {
    expect(rigaDelRegistro(voce({
      azione: 'rose_importate', giocatore: null, daAdmin: true,
      dati: { giocatori: 512, squadre: 8 },
    }))).toBe('Mattia (FC Joga Benito) ha importato le rose dal file della lega: 8 squadre, 512 giocatori');

    expect(rigaDelRegistro(voce({
      azione: 'crediti_impostati', giocatore: null, daAdmin: true,
      dati: { squadra: 'Pirati', prima: 18, dopo: 20 },
    }))).toBe('Mattia (FC Joga Benito) ha portato i crediti di Pirati da 18 a 20');
  });

  it('una nota dell\'admin, se c\'è, chiude la riga', () => {
    expect(rigaDelRegistro(voce({
      azione: 'crediti_impostati', giocatore: null, daAdmin: true,
      dati: { squadra: 'Pirati', prima: 18, dopo: 20, nota: 'errore di trascrizione' },
    }))).toContain('· errore di trascrizione');
  });
});

describe('le azioni come elenco', () => {
  it('ognuna ha la sua etichetta per il filtro', () => {
    for (const a of AZIONI) {
      expect(ETICHETTA_AZIONE[a], a).toBeTruthy();
    }
  });

  it('ognuna ha una frase: nessuna riga muta nel registro', () => {
    for (const a of AZIONI) {
      const r = rigaDelRegistro(voce({ azione: a, giocatore: 'TIZIO', dati: { squadra: 'Pirati' } }));
      expect(r, a).not.toBe('');
      // niente «undefined» o «[object Object]» sfuggiti in una frase
      expect(r, a).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});

describe('i confini di un giorno, nell\'ora di Roma', () => {
  it('conosce l\'ora legale e quella solare', () => {
    // d'estate Roma è due ore avanti, d'inverno una
    expect(inizioGiornoRoma('2026-07-15')).toBe('2026-07-14T22:00:00.000Z');
    expect(inizioGiornoRoma('2026-12-15')).toBe('2026-12-14T23:00:00.000Z');
  });

  it('il giorno del cambio d\'ora comincia con l\'offset di quella notte', () => {
    // il 25 ottobre 2026 Roma passa a +01:00 alle 03:00 locali, ma a
    // mezzanotte era ancora a +02:00: il giorno comincia alle 22:00 del 24
    expect(inizioGiornoRoma('2026-10-25')).toBe('2026-10-24T22:00:00.000Z');
  });

  it('l\'inizio del giorno è mezzanotte a Roma, non a Greenwich', () => {
    // mezzanotte del 2 ottobre a Roma sono le 22:00 UTC del 1º
    expect(new Date(inizioGiornoRoma('2026-10-02')).toISOString())
      .toBe('2026-10-01T22:00:00.000Z');
  });

  it('la fine del giorno arriva a mezzanotte, anche d\'inverno', () => {
    /*
     * È il difetto che questo risolve: con «+02:00» scritto a mano, «fino a
     * tutto il 30 novembre» si fermava alle 22:59 di Roma, e uno scambio
     * registrato alle 23:15 non compariva nel filtro.
     */
    expect(new Date(fineGiornoRoma('2026-11-30')).toISOString())
      .toBe('2026-11-30T22:59:59.999Z');
    expect(new Date(fineGiornoRoma('2026-07-15')).toISOString())
      .toBe('2026-07-15T21:59:59.999Z');
  });

  it('un giorno intero non lascia buchi né si sovrappone al successivo', () => {
    const fine = new Date(fineGiornoRoma('2026-10-24')).getTime();
    const dopo = new Date(inizioGiornoRoma('2026-10-25')).getTime();
    expect(dopo - fine).toBe(1);
  });
});

describe('un\'azione che questa versione non conosce', () => {
  it('non lascia una riga vuota nel registro', () => {
    const r = rigaDelRegistro({
      avvenutoIl: '2026-10-01T07:22:00Z',
      azione: 'qualcosa_di_nuovo' as never,
      attore: { nome: 'Mattia', squadra: 'FC Joga Benito' },
      daAdmin: false, giocatore: 'HAINAUT', dati: {},
    });
    expect(r).toBeTypeOf('string');
    expect(r).toContain('Mattia (FC Joga Benito)');
    expect(r).toContain('HAINAUT');
  });
});

describe('lo svincolo gratuito, ad asta ancora aperta', () => {
  /*
   * Il giocatore di una richiesta di svincolo gratuito è quasi sempre lo
   * svincolando già dichiarato su una chiamata: `requestFreeRelease` cerca la
   * partecipazione proprio per `release_player_id`. Pubblicare quel nome nel
   * registro, prima che la sala si apra, vorrebbe dire svelare a tutti lo
   * svincolando — e con lui il budget — di chi ha chiamato.
   */
  it('non nomina il giocatore finché l\'asta è in corso', () => {
    const r = rigaDelRegistro(voce({
      azione: 'svincolo_richiesto', giocatore: 'GATTI', riservato: true,
    }));
    expect(r).toBe('Mattia (FC Joga Benito) ha chiesto uno svincolo gratuito');
    expect(r).not.toContain('GATTI');
  });

  it('e non lo nomina nemmeno nella decisione dell\'admin', () => {
    const approvato = rigaDelRegistro(voce({
      azione: 'svincolo_approvato', giocatore: 'GATTI', riservato: true,
      daAdmin: true, dati: { squadra: 'Pirati' },
    }));
    expect(approvato).toBe('Mattia (FC Joga Benito) ha approvato uno svincolo gratuito chiesto da Pirati');
    expect(approvato).not.toContain('GATTI');

    expect(rigaDelRegistro(voce({
      azione: 'svincolo_respinto', giocatore: 'GATTI', riservato: true,
      daAdmin: true, dati: { squadra: 'Pirati' },
    }))).not.toContain('GATTI');
  });

  it('ad asta chiusa il nome compare: il segreto non c\'è più', () => {
    expect(rigaDelRegistro(voce({ azione: 'svincolo_richiesto', giocatore: 'GATTI' })))
      .toContain('GATTI');
  });
});
