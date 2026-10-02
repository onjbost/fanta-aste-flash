import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodificaLive, type PartitaLive } from './protobuf';
import { bonusDaEventi, eventiSconosciuti, minuto, squadraLive, type Schierato } from './calcolo';
import { stessoClub } from '@/lib/fonti/pagine';

// Il messaggio vero della 4ª giornata 2023/24, tutte le partite finite. Lo
// stesso che usa andregri/fantacalcio-voti-live-js per i suoi test.
const VERO = decodificaLive(new Uint8Array(Buffer.from(
  readFileSync(join(__dirname, 'fixtures', 'live-2023-24-g4.b64'), 'utf8').trim(), 'base64',
)));

describe('decodificaLive', () => {
  it('legge tutte le partite, con risultato e stato', () => {
    expect(VERO.length).toBe(8);
    expect(VERO[3]).toMatchObject({ teamHome: 'Inter', teamAway: 'Milan', goalHome: 5, goalAway: 1, status: 4 });
  });

  it('legge voti, eventi e minuti negativi del primo tempo', () => {
    const mkh = VERO[3].playersHome.find((p) => p.name === 'Mkhitaryan')!;
    expect(mkh).toMatchObject({ id: expect.any(Number), position: 'C', vote: 8.5, events: [3, 3, 22] });
    expect(mkh.eventsMinutes[0]).toBe(-5);
  });

  it('il «55» di chi è entrato a fine partita è un senza voto', () => {
    expect(VERO[3].playersHome.find((p) => p.name === 'Asllani')!.vote).toBeNull();
  });
});

describe('eventi', () => {
  it('gol, assist, cartellini e gol subiti valgono come nel classico', () => {
    expect(bonusDaEventi([3, 3, 22]).bonus).toBe(7);
    expect(bonusDaEventi([4, 4, 4, 4, 4]).bonus).toBe(-5);
    expect(bonusDaEventi([1, 9, 14]).bonus).toBe(2.5);
  });

  it('il rosso diretto è il 10', () => {
    expect(bonusDaEventi([10]).bonus).toBe(-1);
  });

  it('nel messaggio vero resta da capire solo il 2, e lo dice', () => {
    expect(eventiSconosciuti(VERO)).toEqual([2]);
  });
});

const chi = (extId: number | string, ruolo: Schierato['ruolo'], club: string, titolare = true, ordine = 0): Schierato => ({
  playerId: String(extId), extId: String(extId), nome: String(extId), ruolo, club, titolare, ordine,
});
const id = (club: 'playersHome' | 'playersAway', partita: number, nome: string) =>
  VERO[partita][club].find((p) => p.name === nome)!.id;

describe('squadraLive', () => {
  const ctx = { partite: VERO, ora: Date.now(), stessoClub: (a: string, b: string) => stessoClub(a, b) };

  it('somma i fantavoti, con la porta inviolata per chi non ha preso gol', () => {
    const s = squadraLive([
      chi(id('playersHome', 3, 'Mkhitaryan'), 'C', 'Inter'),   // 8.5 + 7
      chi(id('playersAway', 3, 'Maignan'), 'P', 'Milan'),      // 6 - 5
    ], ctx);
    expect(s.totale).toBe(16.5);
  });

  it('chi finisce senza voto lascia il posto alla riserva dello stesso ruolo', () => {
    const s = squadraLive([
      chi(id('playersHome', 3, 'Asllani'), 'C', 'Inter'),                 // s.v.
      chi(id('playersHome', 3, 'Barella'), 'C', 'Inter', false, 1),       // 6.5
      chi(id('playersHome', 3, 'Sommer'), 'P', 'Inter', false, 0),        // ruolo sbagliato
    ], ctx);
    expect(s.righe[0].stato).toBe('sv');
    expect(s.righe[1].conta).toBe(true);
    expect(s.righe[2].conta).toBe(false);
    expect(s.totale).toBe(6.5);
    expect(s.sostituzioni).toBe(1);
  });

  it('a partita da giocare conta zero, la simulazione dà il 6', () => {
    const futura: PartitaLive[] = [{ ...VERO[3], status: 0, playersHome: [], playersAway: [] }];
    const s = squadraLive([chi('1', 'A', 'Inter'), chi('2', 'D', 'Milan')], { ...ctx, partite: futura });
    expect(s.totale).toBe(0);
    expect(s.totaleSimulato).toBe(12);
    expect(s.righe.every((r) => r.stato === 'da_giocare')).toBe(true);
  });

  it('in campo senza voto: il 6 della simulazione tiene conto del gol già fatto', () => {
    const live: PartitaLive[] = [{
      ...VERO[3], status: 3,
      playersHome: [{ id: 7, name: 'X', position: 'A', vote: null, events: [3], eventsMinutes: [60] }],
      playersAway: [],
    }];
    const s = squadraLive([chi(7, 'A', 'Inter')], { ...ctx, partite: live });
    expect(s.righe[0]).toMatchObject({ stato: 'in_campo', simulato: 9, fantavoto: null });
  });

  it('in panchina a partita in corso non prende il 6: entra la riserva', () => {
    const live: PartitaLive[] = [{ ...VERO[3], status: 3, playersHome: [], playersAway: [] }];
    const s = squadraLive([chi('1', 'A', 'Inter'), chi('2', 'A', 'Juventus', false, 0)], {
      ...ctx, partite: [...live, { ...VERO[4], status: 0, playersHome: [], playersAway: [] }],
    });
    expect(s.righe[0].stato).toBe('fuori');
    expect(s.righe[1].contaSimulato).toBe(true);
    expect(s.totaleSimulato).toBe(6);
  });

  it('i gol seguono la scala del fanta', () => {
    const s = squadraLive(Array.from({ length: 11 }, () => chi(id('playersHome', 3, 'Mkhitaryan'), 'C', 'Inter')), ctx);
    expect(s.totale).toBe(15.5 * 11);
    expect(s.gol).toBeGreaterThan(10);
  });
});

describe('minuto', () => {
  it('conta dal fischio di ogni tempo', () => {
    const p = { status: 3, fhDate: 0, shDate: 1_000_000 };
    expect(minuto(p, 1_000_000 + 10 * 60_000)).toBe(55);
    expect(minuto({ status: 2, fhDate: 0, shDate: 0 }, 0)).toBe(45);
  });
});
