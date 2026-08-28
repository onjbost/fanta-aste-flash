import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG, refundValue, changesLeft, creditsAfter, resolveProxyBid,
  type ReleaseRecord, type RosterPlayer, type Role, type SettledLot,
} from './rules';

/**
 * Simulazione di una serata intera: tre lotti, quattro squadre, offerte
 * massime automatiche e crediti che si aggiornano lotto dopo lotto.
 *
 * È il test che tiene insieme tutte le regole: se una cambia e rompe
 * l'aritmetica della serata, qui salta fuori subito.
 */

interface Team {
  id: string;
  credits: number;
  roster: RosterPlayer[];
  releases: ReleaseRecord[];
  settled: SettledLot[];
}

const player = (id: string, role: Role, price: number, over: Partial<RosterPlayer> = {}): RosterPlayer => ({
  playerId: id, name: id.toUpperCase(), role, club: 'Serie A', status: 'active', price, ...over,
});

function team(id: string, credits: number, roster: RosterPlayer[], releases: ReleaseRecord[] = []): Team {
  return { id, credits, roster, releases, settled: [] };
}

const cfg = DEFAULT_CONFIG;

/** Budget su un lotto: crediti aggiornati dalla serata + rimborso dello svincolando. */
function budget(t: Team, releaseId: string): number {
  const rel = t.roster.find((r) => r.playerId === releaseId)!;
  return creditsAfter(t.credits, t.settled) + refundValue(rel, cfg).value;
}

/** Aggiudicazione: svincolo, incasso, pagamento, contatore del ruolo. */
function settle(t: Team, lotId: string, releaseId: string, price: number, wonRole: Role) {
  const rel = t.roster.find((r) => r.playerId === releaseId)!;
  const refund = refundValue(rel, cfg);
  t.settled.push({ lotId, won: true, price, refund: refund.value });
  t.roster = t.roster.filter((r) => r.playerId !== releaseId);
  t.releases.push({ role: rel.role, type: refund.type, at: '2026-10-29' });
  t.roster.push(player(`nuovo-${lotId}`, wonRole, price));
}

function lose(t: Team, lotId: string) {
  t.settled.push({ lotId, won: false });
}

describe('una serata d\'asta completa', () => {
  // 4 squadre, tutte con qualche difensore e centrocampista da mettere sul piatto
  const monte = team('monte', 50, [
    player('scalvini', 'D', 32),
    player('orsolini', 'C', 14),
    player('piccoli', 'A', 40),
  ]);
  const real = team('real', 40, [
    player('biraghi', 'D', 24),
    player('frattesi', 'C', 30),
  ]);
  const atletico = team('atletico', 22, [
    player('dodo', 'D', 18),
    player('ederson', 'C', 26, { status: 'out_of_serie_a' }),   // cambio gratuito
  ]);
  const deportivo = team('deportivo', 8, [
    player('gatti', 'D', 20),
  ]);

  it('lotto 1 · asta vera tra due, vince chi ha più budget', () => {
    // Monte chiama un difensore mettendo sul piatto Scalvini (32 → 24)
    expect(budget(monte, 'scalvini')).toBe(74);
    // Real aderisce con Biraghi (24 → 18)
    expect(budget(real, 'biraghi')).toBe(58);

    // rilanci: Real arriva a 58, Monte lo supera
    const price = 59;
    expect(price).toBeLessThanOrEqual(budget(monte, 'scalvini'));

    settle(monte, 'l1', 'scalvini', price, 'D');
    lose(real, 'l1');

    // Monte: 50 + 24 − 59 = 15
    expect(creditsAfter(monte.credits, monte.settled)).toBe(15);
    // Real non muove nulla e tiene Biraghi al prezzo pagato
    expect(creditsAfter(real.credits, real.settled)).toBe(40);
    expect(real.roster.find((r) => r.playerId === 'biraghi')!.price).toBe(24);
  });

  it('lotto 2 · Monte riparte dai crediti aggiornati, non da quelli di ieri', () => {
    // ora mette sul piatto Orsolini (14 → 10): 15 + 10 = 25
    expect(budget(monte, 'orsolini')).toBe(25);
    // Real invece è ancora intatto: 40 + 22 (Frattesi 30 → 22) = 62
    expect(budget(real, 'frattesi')).toBe(62);

    settle(real, 'l2', 'frattesi', 26, 'C');
    lose(monte, 'l2');

    expect(creditsAfter(real.credits, real.settled)).toBe(36);   // 40 +22 −26
    expect(creditsAfter(monte.credits, monte.settled)).toBe(15);
  });

  it('lotto 3 · il cambio gratuito porta il 100% e non consuma il contatore', () => {
    // Atletico mette sul piatto Ederson, che ha lasciato la Serie A: rende 26 pieni
    expect(budget(atletico, 'ederson')).toBe(48);   // 22 + 26

    const before = changesLeft(atletico.releases, 'C', new Date('2026-10-29'), cfg);
    settle(atletico, 'l3', 'ederson', 30, 'C');
    const after = changesLeft(atletico.releases, 'C', new Date('2026-10-29'), cfg);

    expect(before).toBe(3);
    expect(after).toBe(3);                                   // il contatore non scende
    expect(creditsAfter(atletico.credits, atletico.settled)).toBe(18);  // 22 +26 −30
  });

  it('le offerte massime automatiche rispettano il budget vero, non quello dichiarato', () => {
    // Deportivo ha 8 crediti e mette sul piatto Gatti (20 → 15): budget 23,
    // ma aveva lasciato un tetto di 40. Vale il minore dei due.
    expect(budget(deportivo, 'gatti')).toBe(23);

    const out = resolveProxyBid(10, 'monte', [
      { teamId: 'deportivo', max: 40, budget: budget(deportivo, 'gatti') },
    ], cfg);
    expect(out).toEqual({ teamId: 'deportivo', amount: 11 });

    // e non può mai superare 23
    const out2 = resolveProxyBid(23, 'monte', [
      { teamId: 'deportivo', max: 40, budget: 23 },
    ], cfg);
    expect(out2).toBeNull();
  });

  it('a fine serata i conti della lega tornano', () => {
    const totals = [monte, real, atletico, deportivo]
      .map((t) => creditsAfter(t.credits, t.settled));
    expect(totals).toEqual([15, 36, 18, 8]);

    // ogni squadra che ha vinto ha esattamente un cambio in meno nel ruolo,
    // tranne chi ha usato un cambio gratuito
    expect(changesLeft(monte.releases, 'D', new Date('2026-10-29'), cfg)).toBe(2);
    expect(changesLeft(real.releases, 'C', new Date('2026-10-29'), cfg)).toBe(2);
    expect(changesLeft(atletico.releases, 'C', new Date('2026-10-29'), cfg)).toBe(3);
    expect(changesLeft(deportivo.releases, 'D', new Date('2026-10-29'), cfg)).toBe(3);
  });

  it('le rose restano della dimensione giusta: uno esce, uno entra', () => {
    expect(monte.roster.map((p) => p.playerId).sort())
      .toEqual(['nuovo-l1', 'orsolini', 'piccoli']);
    expect(real.roster.map((p) => p.playerId).sort())
      .toEqual(['biraghi', 'nuovo-l2']);
  });
});

describe('lotto senza contendenti', () => {
  it('è a saldo neutro: quello che rientra è quello che esce', () => {
    const t = team('solo', 37, [player('bastoni', 'D', 32)]);
    const prezzo = refundValue(t.roster[0], cfg).value;   // 24
    settle(t, 'l1', 'bastoni', prezzo, 'D');
    expect(creditsAfter(t.credits, t.settled)).toBe(37);
    expect(changesLeft(t.releases, 'D', new Date('2026-10-29'), cfg)).toBe(2);
  });
});
