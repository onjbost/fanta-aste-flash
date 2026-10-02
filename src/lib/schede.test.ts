import { describe, expect, it } from 'vitest';
import { contaAutogol, piuGrave, type Indisponibile } from './schede';

const ind = (categoria: Indisponibile['categoria']): Indisponibile => ({ categoria, descrizione: '', rientroStimato: null });

describe('piuGrave', () => {
  it("fra infortunato e diffidato vince l'infortunio, in qualunque ordine", () => {
    expect(piuGrave(ind('diffidato'), ind('infortunato')).categoria).toBe('infortunato');
    expect(piuGrave(ind('infortunato'), ind('diffidato')).categoria).toBe('infortunato');
  });
  it('senza niente prima, tiene quello che arriva', () => {
    expect(piuGrave(null, ind('in_dubbio')).categoria).toBe('in_dubbio');
  });
});

describe('contaAutogol', () => {
  it('somma le giornate e conta una volta sola campionato e coppa della stessa giornata', () => {
    const n = contaAutogol([
      { playerId: 'a', serieA: 3, autogol: 1 },
      { playerId: 'a', serieA: 3, autogol: 1 },
      { playerId: 'a', serieA: 5, autogol: 2 },
      { playerId: 'b', serieA: 4, autogol: 0 },
      { playerId: 'c', serieA: null, autogol: 1 },
    ]);
    expect(n.get('a')).toBe(3);
    expect(n.has('b')).toBe(false);
    expect(n.has('c')).toBe(false);
  });
});
