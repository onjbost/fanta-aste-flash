import { describe, expect, it } from 'vitest';
import { pianoAsta } from './mercato';

const squadre = new Map([
  ['Montester United', { id: 17100750, divisione: 'A', rosa: new Set(['5694', '6646']) }],
  ['FC NTONIA', { id: 17100751, divisione: 'A', rosa: new Set(['111']) }],
]);

describe('pianoAsta', () => {
  it('prima gli svincoli col rimborso, poi gli acquisti col prezzo, come il pannello della lega', () => {
    const p = pianoAsta(
      [{ extId: '6646', nome: 'ADAMS C.', teamName: 'Montester United', crediti: 2 }],
      [{ extId: '999', nome: 'NUOVO', teamName: 'Montester United', crediti: 14 }],
      squadre,
    );
    expect(p.richieste).toEqual([
      expect.objectContaining({ metodo: 'PUT', percorso: '/market/v1/admin/action/free/A/17100750', corpo: [{ id: '6646', cost: 2 }] }),
      expect.objectContaining({ metodo: 'POST', percorso: '/market/v1/admin/action/purchase/A/17100750', corpo: [{ id: 999, cost: 14 }] }),
    ]);
    expect(p.problemi).toEqual([]);
  });

  it('quello che nella lega è già a posto non si richiede di nuovo', () => {
    const p = pianoAsta(
      [{ extId: '777', nome: 'GIA FUORI', teamName: 'Montester United', crediti: 5 }],
      [{ extId: '5694', nome: 'BETO', teamName: 'Montester United', crediti: 26 }],
      squadre,
    );
    expect(p.richieste).toEqual([]);
    expect(p.giaFatti).toHaveLength(2);
  });

  it('non compra un giocatore che nella lega sta in un\'altra rosa', () => {
    const p = pianoAsta([], [{ extId: '111', nome: 'CONTESO', teamName: 'Montester United', crediti: 3 }], squadre);
    expect(p.richieste).toEqual([]);
    expect(p.problemi[0]).toContain('FC NTONIA');
  });

  it('una squadra che nella lega non c\'è è un problema, non una richiesta a vuoto', () => {
    const p = pianoAsta([], [{ extId: '1', nome: 'X', teamName: 'Sconosciuti', crediti: 1 }], squadre);
    expect(p.problemi).toEqual(['Sconosciuti: squadra non trovata nella lega']);
  });
});
