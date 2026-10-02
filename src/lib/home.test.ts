import { describe, it, expect } from 'vitest';
import {
  esitoPer, formaUltime, precedenti, prossimaPartita, scadenzeDellaHome, titoloPartita,
  type Partita,
} from './home';

/**
 * La Home: la prossima partita della squadra, la forma, i precedenti e le
 * quattro scadenze. Tutto calcolato qui, da dati già letti: il componente
 * disegna e basta.
 */

const NOI = 'noi';
const LORO = 'loro';
const ALTRI = 'altri';

let n = 0;
const partita = (over: Partial<Partita> = {}): Partita => ({
  id: `p${++n}`,
  competition: 'campionato',
  phase: 'regular',
  groupName: null,
  round: 1,
  serieA: 5,
  fanta: 4,
  kickoff: '2026-10-11T13:00:00Z',
  homeId: NOI,
  awayId: LORO,
  homeGoals: null,
  awayGoals: null,
  ...over,
});

describe('esitoPer', () => {
  it('dice vinta, pari o persa dal punto di vista della squadra, in casa e fuori', () => {
    expect(esitoPer(partita({ homeGoals: 2, awayGoals: 1 }), NOI)).toBe('V');
    expect(esitoPer(partita({ homeGoals: 2, awayGoals: 1 }), LORO)).toBe('P');
    expect(esitoPer(partita({ homeGoals: 1, awayGoals: 1 }), LORO)).toBe('N');
    expect(esitoPer(partita({ homeId: LORO, awayId: NOI, homeGoals: 0, awayGoals: 3 }), NOI)).toBe('V');
  });

  it('una partita non giocata non ha esito', () => {
    expect(esitoPer(partita(), NOI)).toBeNull();
  });
});

describe('prossimaPartita', () => {
  it('prende la prima non giocata della competizione, in ordine di calcio d\'inizio', () => {
    const lista = [
      partita({ id: 'giocata', kickoff: '2026-10-04T13:00:00Z', homeGoals: 1, awayGoals: 0 }),
      partita({ id: 'dopo', kickoff: '2026-10-18T13:00:00Z' }),
      partita({ id: 'prima', kickoff: '2026-10-11T13:00:00Z' }),
      partita({ id: 'coppa', competition: 'coppa', phase: 'gruppi', kickoff: '2026-10-08T13:00:00Z' }),
    ];
    expect(prossimaPartita(lista, NOI, 'campionato')?.id).toBe('prima');
    expect(prossimaPartita(lista, NOI, 'coppa')?.id).toBe('coppa');
  });

  it('ignora le partite delle altre squadre e quelle senza avversario deciso', () => {
    const lista = [
      partita({ id: 'altrui', homeId: ALTRI, awayId: LORO }),
      partita({ id: 'semifinale', competition: 'coppa', phase: 'semifinale', homeId: null, awayId: null }),
    ];
    expect(prossimaPartita(lista, NOI, 'campionato')).toBeNull();
    expect(prossimaPartita(lista, NOI, 'coppa')).toBeNull();
  });
});

describe('formaUltime', () => {
  it('le ultime cinque giocate, dalla più recente, di qualunque competizione', () => {
    const lista = [
      partita({ kickoff: '2026-09-01T13:00:00Z', homeGoals: 0, awayGoals: 1 }),
      partita({ kickoff: '2026-09-08T13:00:00Z', homeGoals: 1, awayGoals: 1 }),
      partita({ kickoff: '2026-09-15T13:00:00Z', homeGoals: 2, awayGoals: 0, competition: 'coppa' }),
      partita({ kickoff: '2026-09-22T13:00:00Z', homeGoals: 3, awayGoals: 0 }),
      partita({ kickoff: '2026-09-29T13:00:00Z', homeGoals: 0, awayGoals: 2 }),
      partita({ kickoff: '2026-10-06T13:00:00Z', homeGoals: 1, awayGoals: 0 }),
      partita({ kickoff: '2026-10-13T13:00:00Z' }), // non ancora giocata
    ];
    expect(formaUltime(lista, NOI)).toEqual(['V', 'P', 'V', 'V', 'N']);
  });

  it('con meno di cinque partite restituisce quelle che ci sono', () => {
    expect(formaUltime([partita({ homeGoals: 1, awayGoals: 0 })], LORO)).toEqual(['P']);
  });
});

describe('precedenti', () => {
  it('solo gli scontri diretti giocati, dal più recente, in casa e fuori', () => {
    const lista = [
      partita({ id: 'andata', kickoff: '2026-09-01T13:00:00Z', homeGoals: 2, awayGoals: 1 }),
      partita({ id: 'ritorno', kickoff: '2026-10-01T13:00:00Z', homeId: LORO, awayId: NOI, homeGoals: 0, awayGoals: 0 }),
      partita({ id: 'altra', homeId: NOI, awayId: ALTRI, homeGoals: 1, awayGoals: 0 }),
      partita({ id: 'futura', kickoff: '2026-11-01T13:00:00Z' }),
    ];
    expect(precedenti(lista, NOI, LORO).map((p) => p.id)).toEqual(['ritorno', 'andata']);
  });
});

describe('titoloPartita', () => {
  it('nomina la giornata, il turno del girone o la fase finale', () => {
    expect(titoloPartita(partita({ fanta: 6 }))).toBe('6ª giornata');
    expect(titoloPartita(partita({ competition: 'coppa', phase: 'gruppi', groupName: 'A', round: 3 }))).toBe('Girone A · 3° turno');
    expect(titoloPartita(partita({ competition: 'coppa', phase: 'semifinale' }))).toBe('Semifinale');
    expect(titoloPartita(partita({ competition: 'coppa', phase: 'finale' }))).toBe('Finale');
  });
});

describe('scadenzeDellaHome', () => {
  const ora = new Date('2026-10-02T10:00:00Z');
  const asta = { number: 2, auctionAt: '2026-10-22T17:30:00Z', status: 'calls_open' as const };
  const giornate = [
    { firstKickoffAt: '2026-09-27T10:30:00Z', lockAt: '2026-09-27T09:30:00Z', fanta: 3 },
    { firstKickoffAt: '2026-10-04T10:30:00Z', lockAt: '2026-10-04T09:30:00Z', fanta: 4 },
    { firstKickoffAt: '2026-10-11T10:30:00Z', lockAt: '2026-10-11T09:30:00Z', fanta: 5 },
  ];

  it('quattro tessere in ordine fisso, con le date giuste', () => {
    const s = scadenzeDellaHome({ ora, asta, giornate, giorniChiamate: 5, giorniAdesioni: 1 });
    expect(s.map((x) => x.chiave)).toEqual(['chiamate', 'adesioni', 'formazione', 'schedine']);
    expect(s[0].quando).toBe('2026-10-17T17:30:00.000Z');
    expect(s[1].quando).toBe('2026-10-21T17:30:00.000Z');
    // quindici minuti prima della prima partita della prossima giornata
    expect(s[2].quando).toBe('2026-10-04T10:15:00.000Z');
    expect(s[3].quando).toBe('2026-10-04T09:30:00.000Z');
  });

  it('accende solo la più vicina fra quelle ancora aperte', () => {
    const s = scadenzeDellaHome({ ora, asta, giornate, giorniChiamate: 5, giorniAdesioni: 1 });
    expect(s.filter((x) => x.prossima).map((x) => x.chiave)).toEqual(['schedine']);
  });

  it('una scadenza passata o senza asta resta in tessera, ma vuota', () => {
    const s = scadenzeDellaHome({
      ora: new Date('2026-10-19T10:00:00Z'), asta, giornate, giorniChiamate: 5, giorniAdesioni: 1,
    });
    expect(s[0].quando).toBeNull();
    expect(s[1].quando).toBe('2026-10-21T17:30:00.000Z');
    const senza = scadenzeDellaHome({ ora, asta: null, giornate: [], giorniChiamate: 5, giorniAdesioni: 1 });
    expect(senza.map((x) => x.quando)).toEqual([null, null, null, null]);
  });

  it('salta le giornate in cui il fanta non gioca, per la formazione', () => {
    const s = scadenzeDellaHome({
      ora, asta: null, giorniChiamate: 5, giorniAdesioni: 1,
      giornate: [
        { firstKickoffAt: '2026-10-04T10:30:00Z', lockAt: '2026-10-04T09:30:00Z', fanta: null },
        { firstKickoffAt: '2026-10-11T10:30:00Z', lockAt: '2026-10-11T09:30:00Z', fanta: 5 },
      ],
    });
    expect(s[2].quando).toBe('2026-10-11T10:15:00.000Z');
  });
});
