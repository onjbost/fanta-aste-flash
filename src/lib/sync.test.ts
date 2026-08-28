import { describe, it, expect } from 'vitest';
import { diffRosters, diffListone, diffIsEmpty, conflictsWithMarket, type CurrentContract, type CurrentPlayer } from './sync';
import type { ListonePlayer } from './listone';

const inFile = (over: Partial<ListonePlayer> = {}): ListonePlayer => ({
  extId: '2764', name: 'MARTINEZ L.', role: 'A', club: 'Inter',
  quotation: 34, outOfList: false, teamName: 'Montester United', price: 160, ...over,
});

const inDb = (over: Partial<CurrentContract> = {}): CurrentContract => ({
  extId: '2764', name: 'MARTINEZ L.', role: 'A',
  teamName: 'Montester United', price: 160, fromFlashAuction: false, ...over,
});

describe('differenze tra file e database · rose', () => {
  it('non segnala niente quando tutto combacia', () => {
    const d = diffRosters([inDb()], [inFile()]);
    expect(diffIsEmpty(d)).toBe(true);
    expect(d.unchanged).toBe(1);
  });

  it('vede un acquisto: in rosa nel file, libero nel database', () => {
    const d = diffRosters([], [inFile()]);
    expect(d.added).toHaveLength(1);
    expect(d.added[0]).toMatchObject({ name: 'MARTINEZ L.', teamName: 'Montester United', price: 160 });
  });

  it('vede uno svincolo: in rosa nel database, libero nel file', () => {
    const d = diffRosters([inDb()], [inFile({ teamName: null, price: null })]);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0].teamName).toBe('Montester United');
  });

  it('vede un cambio di squadra', () => {
    const d = diffRosters([inDb()], [inFile({ teamName: 'Real Sballo' })]);
    expect(d.moved[0]).toMatchObject({ from: 'Montester United', to: 'Real Sballo' });
    expect(d.repriced).toHaveLength(0);
  });

  it('vede una correzione di prezzo', () => {
    const d = diffRosters([inDb({ price: 160 })], [inFile({ price: 150 })]);
    expect(d.repriced[0]).toMatchObject({ from: 160, to: 150, teamName: 'Montester United' });
  });

  it('un giocatore che il file non nomina resta dov\'è', () => {
    const d = diffRosters([inDb({ extId: '999', name: 'ALTRO' })], [inFile()]);
    expect(d.removed).toHaveLength(0);
    expect(d.added).toHaveLength(1);
  });

  it('segnala i conflitti con il mercato già giocato', () => {
    const d = diffRosters(
      [inDb({ fromFlashAuction: true })],
      [inFile({ teamName: null, price: null })],
    );
    const conflitti = conflictsWithMarket(d);
    expect(conflitti).toHaveLength(1);
    expect(conflitti[0].name).toBe('MARTINEZ L.');
  });

  it('regge un file intero con più tipi di differenza insieme', () => {
    const current = [
      inDb({ extId: '1', name: 'A' }),
      inDb({ extId: '2', name: 'B', price: 40 }),
      inDb({ extId: '3', name: 'C', teamName: 'Real Sballo' }),
    ];
    const incoming = [
      inFile({ extId: '1', name: 'A' }),                                  // invariato
      inFile({ extId: '2', name: 'B', price: 35 }),                       // prezzo
      inFile({ extId: '3', name: 'C', teamName: 'Montester United' }),    // squadra
      inFile({ extId: '4', name: 'D' }),                                  // nuovo
      inFile({ extId: '5', name: 'E', teamName: null, price: null }),     // svincolato mai avuto
    ];
    const d = diffRosters(current, incoming);
    expect(d.unchanged).toBe(1);
    expect(d.repriced).toHaveLength(1);
    expect(d.moved).toHaveLength(1);
    expect(d.added).toHaveLength(1);
    expect(d.removed).toHaveLength(0);
    expect(diffIsEmpty(d)).toBe(false);
  });
});

describe('differenze tra file e database · listone', () => {
  const dbPlayer = (over: Partial<CurrentPlayer> = {}): CurrentPlayer => ({
    extId: '2764', name: 'MARTINEZ L.', club: 'Inter', quotation: 34, outOfList: false, ...over,
  });

  it('trova i giocatori nuovi', () => {
    const d = diffListone([], [inFile()]);
    expect(d.newPlayers).toHaveLength(1);
  });

  it('elenca cosa è cambiato su chi c\'era già', () => {
    const d = diffListone([dbPlayer()], [inFile({ quotation: 31, club: 'Milan', outOfList: true })]);
    expect(d.updated[0].changes).toEqual([
      'quotazione 34 → 31', 'club Inter → Milan', 'ora fuori lista',
    ]);
  });

  it('non segnala niente se il giocatore è identico', () => {
    expect(diffListone([dbPlayer()], [inFile()]).updated).toHaveLength(0);
  });

  it('segnala chi è sparito dal listone', () => {
    const d = diffListone([dbPlayer({ extId: '99', name: 'SPARITO' })], [inFile()]);
    expect(d.disappeared[0].name).toBe('SPARITO');
  });

  it('vede quando qualcuno rientra in lista', () => {
    const d = diffListone([dbPlayer({ outOfList: true })], [inFile({ outOfList: false })]);
    expect(d.updated[0].changes).toEqual(['non più fuori lista']);
  });
});
