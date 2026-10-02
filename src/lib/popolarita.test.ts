import { describe, it, expect } from 'vitest';
import { popolaritaPerSfida } from './popolarita';

describe('cosa gioca la lega', () => {
  const g = (fixtureId: string, market: string, selection: string) => ({ fixtureId, market, selection });

  it('conta le caselle sfida per sfida, dalla più giocata', () => {
    const p = popolaritaPerSfida([
      g('a', '1x2', '1'), g('a', '1x2', '1'), g('a', '1x2', 'X'), g('a', 'gg', 'gg'),
      g('b', '1x2', '2'),
    ]);
    expect(p.get('a')?.map((c) => [c.selection, c.volte])).toEqual([['1', 2], ['X', 1], ['gg', 1]]);
    expect(p.get('b')?.[0].volte).toBe(1);
  });

  it('l\'intensità si misura dentro la sfida', () => {
    const p = popolaritaPerSfida([g('a', '1x2', '1'), g('a', '1x2', '1'), g('a', '1x2', 'X'), g('b', '1x2', '2')]);
    expect(p.get('a')?.find((c) => c.selection === 'X')?.intensita).toBe(0.5);
    expect(p.get('b')?.[0].intensita).toBe(1);
  });

  it('senza giocate non c\'è niente', () => {
    expect(popolaritaPerSfida([]).size).toBe(0);
  });
});
