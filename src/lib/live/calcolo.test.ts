import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodificaLive, type PartitaLive } from './protobuf';
import {
  bonusDaEventi, eventiSconosciuti, minuto, puntiCapitano, puntiModificatore, squadraLive, type Schierato,
} from './calcolo';
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

describe('le fasce della lega', () => {
  it('modificatore difesa', () => {
    expect([5.9, 6, 6.24, 6.25, 6.5, 6.75, 7, 7.25, 7.49, 7.5, 8].map(puntiModificatore))
      .toEqual([0, 0.5, 0.5, 1, 1.5, 2, 2.5, 3.5, 3.5, 4, 4]);
  });

  it('fattore capitano', () => {
    expect([4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map(puntiCapitano))
      .toEqual([0, 0, 0, 0, 0.5, 1, 1.5, 1.5]);
  });
});

describe('modificatore e capitano in diretta', () => {
  // un'unica partita finita, con voti scelti apposta
  const g = (id: number, position: string, vote: number | null, events: number[] = []) =>
    ({ id, name: String(id), position, vote, events, eventsMinutes: events.map(() => 10) });
  const partita = (giocatori: ReturnType<typeof g>[], status = 4): PartitaLive[] => [{
    matchId: 1, teamHome: 'Inter', teamAway: 'Milan', goalHome: 0, goalAway: 0, status,
    fhDate: 0, shDate: 0, matchDate: 0, playersHome: giocatori, playersAway: [],
  }];
  const ctx = (p: PartitaLive[]) => ({ partite: p, ora: 0, stessoClub: (a: string, b: string) => stessoClub(a, b) });
  const s = (id: number, ruolo: Schierato['ruolo'], fascia: Schierato['fascia'] = null, titolare = true): Schierato =>
    ({ playerId: String(id), extId: String(id), nome: `G${id}`, ruolo, club: 'Inter', titolare, ordine: 0, fascia });

  it('difesa a 4: media di portiere e tre migliori difensori, voti puri', () => {
    const live = partita([g(1, 'P', 6.5), g(2, 'D', 7, [3]), g(3, 'D', 6.5), g(4, 'D', 6), g(5, 'D', 5)]);
    const r = squadraLive([s(1, 'P'), s(2, 'D'), s(3, 'D'), s(4, 'D'), s(5, 'D')], ctx(live));
    // (6.5 + 7 + 6.5 + 6) / 4 = 6.5 → 1.5; il gol di 2 non entra nella media
    expect(r.modificatore.punti).toBe(1.5);
    expect(r.totale).toBe(7.5 + 10 + 6.5 + 6 + 5 + 1.5);
  });

  it('difesa a 3: niente modificatore', () => {
    const live = partita([g(1, 'P', 8), g(2, 'D', 8), g(3, 'D', 8), g(4, 'D', 8)]);
    const r = squadraLive([s(1, 'P'), s(2, 'D'), s(3, 'D'), s(4, 'D')], ctx(live));
    expect(r.modificatore.punti).toBe(0);
    expect(r.modificatore.spiegazione).toMatch(/difesa a 3/);
  });

  it('capitano col voto; senza voto passa al vice', () => {
    const live = partita([g(1, 'A', 7.5), g(2, 'C', 7)]);
    expect(squadraLive([s(1, 'A', 'C'), s(2, 'C', 'V')], ctx(live)).capitano.punti).toBe(1.5);
    const sv = partita([g(1, 'A', null), g(2, 'C', 7)]);
    const r = squadraLive([s(1, 'A', 'C'), s(2, 'C', 'V')], ctx(sv));
    expect(r.capitano.punti).toBe(1);
    expect(r.capitano.spiegazione).toMatch(/vice/);
  });

  it('a partita in corso il capitano senza voto si aspetta; la simulazione gli dà 6', () => {
    const live = partita([g(1, 'A', null)], 3);
    const r = squadraLive([s(1, 'A', 'C'), s(2, 'C', 'V')], ctx(live));
    expect(r.capitano.spiegazione).toMatch(/in attesa/);
    expect(r.capitanoSimulato.punti).toBe(0);
  });
});

describe('partite già giocate: comandano i voti archiviati', () => {
  it('il tabellino della lega vince sul live che non c\'è', () => {
    const s = (id: number, ruolo: Schierato['ruolo'], archivio: Schierato['archivio'], titolare = true): Schierato =>
      ({ playerId: String(id), extId: String(id), nome: `G${id}`, ruolo, club: 'Inter', titolare, ordine: id, archivio });
    const r = squadraLive([
      s(1, 'A', { voto: 7, fantavoto: 10, eventi: ['gol'] }),
      s(2, 'C', { voto: null, fantavoto: null }),
      s(3, 'C', { voto: 6, fantavoto: 6 }, false),
    ], { partite: [], ora: 0, stessoClub: () => false });
    expect(r.righe[0]).toMatchObject({ stato: 'voto', fantavoto: 10, bonus: 3, eventi: ['gol'], conta: true });
    expect(r.righe[1].stato).toBe('sv');
    expect(r.righe[2].conta).toBe(true);
    expect(r.totale).toBe(16);
  });
});
