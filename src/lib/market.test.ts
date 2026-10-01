import { describe, it, expect } from 'vitest';
import { budgetForLot, type MarketState } from './market';
import { DEFAULT_CONFIG, type RosterPlayer } from './rules';

/**
 * Il budget su un lotto, con i numeri della prima asta vera.
 *
 * `budgetForLot` prende i crediti da `v_team_credits`, che è la somma di
 * tutti i movimenti: le aggiudicazioni di stasera sono già dentro. Il
 * primo ottobre non era così — si sottraevano una seconda volta — e dopo
 * tre lotti vinti FC Joga Benito si è trovato con un budget negativo e
 * l'ultimo lotto impossibile da assegnare. Questi test tengono quel conto
 * dove deve stare.
 */

const giocatore = (id: string, price: number, over: Partial<RosterPlayer> = {}): RosterPlayer => ({
  playerId: id, name: id, role: 'C', club: 'Serie A', status: 'active', price, ...over,
});

const stato = (credits: number, roster: RosterPlayer[]): MarketState => ({
  cfg: DEFAULT_CONFIG, credits, roster, releases: [], commitments: [],
});

describe('budget su un lotto', () => {
  it('è il saldo di adesso più il rimborso dello svincolando dichiarato', () => {
    // Borussia Alecchiomund su MENDY P.: 10 crediti, mette sul piatto
    // LONTANI pagato 1 — il 75% sarebbe zero, ma il minimo è 1
    const s = stato(10, [giocatore('lontani', 1)]);
    expect(budgetForLot(s, 'lontani')).toBe(11);
  });

  it('non sottrae una seconda volta i lotti già vinti stasera', () => {
    /*
     * FC Joga Benito, 1º ottobre, quarto lotto della serata: ha già vinto
     * tre aste (1, 3 e 12 crediti) incassando 7 di rimborsi, e il saldo
     * nella vista è 5. Su MENDY P. mette sul piatto BOBCEK, pagato 12:
     * rimborso 9, budget 14.
     *
     * Con la vecchia aritmetica i tre prezzi venivano tolti di nuovo —
     * 5 − 1 − 3 − 12 + 9 = −2 — e l'assegnazione veniva rifiutata per
     * crediti negativi.
     */
    const s = stato(5, [giocatore('bobcek', 12)]);
    expect(budgetForLot(s, 'bobcek')).toBe(14);
    expect(budgetForLot(s, 'bobcek')).toBeGreaterThan(0);
  });

  it('vale il prezzo pieno quando lo svincolo è gratuito', () => {
    const s = stato(5, [giocatore('bobcek', 12, { status: 'out_of_serie_a' })]);
    expect(budgetForLot(s, 'bobcek')).toBe(17);
  });

  it('è zero se lo svincolando non è più in rosa', () => {
    // succede solo su un lotto già chiuso: il rimborso è già nel saldo,
    // e un budget su quel lotto non serve più a nessuno
    const s = stato(5, [giocatore('altro', 20)]);
    expect(budgetForLot(s, 'bobcek')).toBe(0);
  });
});
