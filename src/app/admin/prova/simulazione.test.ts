import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/rules';
import {
  IO, apriSala, apriLotto, budget, chiudiLotto, chiudiSerata, lottoLive,
  mossaAvversari, prossimoLotto, rilancia, rimborso, squadra, statoIniziale,
  type StatoProva,
} from './simulazione';

/**
 * La sala di prova deve comportarsi come quella vera, altrimenti mostra una
 * cosa e ne succede un'altra — che è peggio di non mostrarla affatto.
 */

const T0 = 1_800_000_000_000;

const iniziale = () => statoIniziale(DEFAULT_CONFIG, 10);

/** Apre la sala e manda all'asta il primo lotto contendibile. */
function alPrimoLotto(): StatoProva {
  const aperta = apriSala(iniziale());
  const l = prossimoLotto(aperta)!;
  const r = apriLotto(aperta, l.id, T0);
  expect(r.errore).toBeNull();
  return r.stato;
}

describe('apertura della sala', () => {
  it('il lotto con un solo partecipante si chiude subito, al 75% dello svincolando', () => {
    const s = apriSala(iniziale());
    const l3 = s.lotti.find((x) => x.id === 'l3')!;
    expect(l3.stato).toBe('assigned');
    expect(l3.vincitore).toBe(IO);
    // Peretti pagato 16 → 75% arrotondato per difetto = 12
    expect(l3.prezzoFinale).toBe(12);
  });

  it('un lotto senza contendenti non muove i crediti: incassa e paga la stessa cifra', () => {
    const prima = iniziale();
    const dopo = apriSala(prima);
    expect(squadra(dopo, IO).crediti).toBe(squadra(prima, IO).crediti);
  });

  it('i lotti contesi restano in attesa', () => {
    const s = apriSala(iniziale());
    expect(s.lotti.filter((l) => l.stato === 'called').map((l) => l.id)).toEqual(['l1', 'l2']);
  });
});

describe('apertura di un lotto', () => {
  it('senza sala aperta non si apre niente', () => {
    const r = apriLotto(iniziale(), 'l1', T0);
    expect(r.errore).toBe('La sala non è aperta.');
  });

  it('un lotto alla volta', () => {
    const s = alPrimoLotto();
    const r = apriLotto(s, 'l2', T0);
    expect(r.errore).toMatch(/già un lotto/);
  });

  it('il timer parte dal momento dell\'apertura', () => {
    const s = alPrimoLotto();
    expect(lottoLive(s)!.scadenza).toBe(T0 + 10_000);
  });
});

describe('rilanci', () => {
  it('la prima offerta parte dal prezzo base', () => {
    const s = alPrimoLotto();
    expect(rilancia(s, 'l1', IO, 0, T0).errore).toMatch(/offerta minima/);
    expect(rilancia(s, 'l1', IO, 1, T0).errore).toBeNull();
  });

  it('ogni offerta buona riporta il timer a zero', () => {
    const s = alPrimoLotto();
    const dopo = rilancia(s, 'l1', IO, 1, T0 + 4_000).stato;
    expect(lottoLive(dopo)!.scadenza).toBe(T0 + 14_000);
  });

  it('non si rilancia su sé stessi', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 3, T0).stato;
    expect(rilancia(s, 'l1', IO, 4, T0).errore).toMatch(/migliore offerente/);
  });

  it('sopra il proprio budget l\'offerta non passa', () => {
    const s = alPrimoLotto();
    // 34 crediti + 21 di rimborso su Bardelli (28 → 75% = 21) = 55
    expect(budget(s, lottoLive(s)!, IO)).toBe(55);
    expect(rilancia(s, 'l1', IO, 56, T0).errore).toMatch(/budget/);
    expect(rilancia(s, 'l1', IO, 55, T0).errore).toBeNull();
  });

  it('a timer scaduto non si offre più', () => {
    const s = alPrimoLotto();
    expect(rilancia(s, 'l1', IO, 5, T0 + 11_000).errore).toBe('Tempo scaduto.');
  });

  it('chi non partecipa al lotto non può offrire', () => {
    const s = alPrimoLotto();
    expect(rilancia(s, 'l1', 'bot3', 5, T0).errore).toMatch(/Non partecipi/);
  });
});

describe('avversari automatici', () => {
  it('rispondono al tuo rilancio senza sparare il proprio massimo', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 10, T0).stato;
    const { stato, mossa } = mossaAvversari(s, 'l1', T0);
    // Sparring Club arriva a 63, Prova Calcio a 26: basta battere il secondo
    expect(mossa!.squadraId).toBe('bot1');
    expect(mossa!.importo).toBe(27);
    expect(lottoLive(stato)!.leader).toBe('bot1');
  });

  it('non rilanciano su sé stessi', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 10, T0).stato;
    s = mossaAvversari(s, 'l1', T0).stato;
    expect(mossaAvversari(s, 'l1', T0).mossa).toBeNull();
  });

  it('non superano mai il proprio tetto', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 55, T0).stato;   // tutto il tuo budget
    const { stato, mossa } = mossaAvversari(s, 'l1', T0);
    // può arrivare a 63, ma per stare davanti gliene basta uno in più
    expect(mossa).toEqual({ squadraId: 'bot1', importo: 56 });
    expect(chiudiLotto(stato, 'l1').stato.lotti.find((l) => l.id === 'l1')!.prezzoFinale).toBe(56);
  });

  it('il tetto non vale più del budget vero della squadra', () => {
    let s = alPrimoLotto();
    // Prova Calcio ha tetto 26 ma soli 19 crediti + 9 di rimborso (Nardi 12) = 28,
    // quindi il tetto regge; Sparring Club invece ha 51 + 30 = 81 e tetto 63
    const l = lottoLive(s)!;
    expect(budget(s, l, 'bot2')).toBe(28);
    expect(budget(s, l, 'bot1')).toBe(81);
    s = rilancia(s, 'l1', IO, 30, T0).stato;
    // sopra il tetto di Prova Calcio resta solo Sparring Club, che offre il minimo
    expect(mossaAvversari(s, 'l1', T0).mossa).toEqual({ squadraId: 'bot1', importo: 31 });
  });

  it('fra due bot si sfidano da soli, senza di te', () => {
    let s = apriSala(iniziale());
    s = apriLotto(s, 'l2', T0).stato;
    const { mossa } = mossaAvversari(s, 'l2', T0);
    // Sparring Club (70) batte Manichini (58) pagando 59
    expect(mossa).toEqual({ squadraId: 'bot1', importo: 59 });
  });

  it('si fermano quando il prezzo supera ogni tetto rimasto', () => {
    let s = apriSala(iniziale());
    s = apriLotto(s, 'l2', T0).stato;
    s = mossaAvversari(s, 'l2', T0).stato;      // Sparring Club a 59
    // Manichini arriva a 58: per stare davanti servirebbe 60, quindi si arrende
    expect(mossaAvversari(s, 'l2', T0).mossa).toBeNull();
  });
});

describe('chiusura del lotto', () => {
  it('senza offerte va al chiamante al 75% del suo svincolando', () => {
    const s = alPrimoLotto();
    const dopo = chiudiLotto(s, 'l1').stato;
    const l = dopo.lotti.find((x) => x.id === 'l1')!;
    expect(l.vincitore).toBe(IO);
    expect(l.prezzoFinale).toBe(21);     // Bardelli 28 → 21
    expect(squadra(dopo, IO).crediti).toBe(34);   // incassa 21 e paga 21
  });

  it('con offerte va a chi guida, e i crediti si muovono davvero', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 40, T0).stato;
    const dopo = chiudiLotto(s, 'l1').stato;
    // 34 + 21 di rimborso − 40 pagati = 15
    expect(squadra(dopo, IO).crediti).toBe(15);
    expect(dopo.lotti.find((x) => x.id === 'l1')!.vincitore).toBe(IO);
  });

  it('chi perde non paga niente', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 40, T0).stato;
    const prima = squadra(s, 'bot1').crediti;
    const dopo = chiudiLotto(s, 'l1').stato;
    expect(squadra(dopo, 'bot1').crediti).toBe(prima);
  });

  it('chiudere due volte non raddoppia i movimenti', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 40, T0).stato;
    const uno = chiudiLotto(s, 'l1').stato;
    const due = chiudiLotto(uno, 'l1').stato;
    expect(squadra(due, IO).crediti).toBe(squadra(uno, IO).crediti);
  });
});

describe('fine serata', () => {
  it('non lascia lotti appesi', () => {
    let s = alPrimoLotto();
    s = rilancia(s, 'l1', IO, 12, T0).stato;
    const fine = chiudiSerata(s);
    expect(fine.lotti.every((l) => l.stato === 'assigned' || l.stato === 'cancelled')).toBe(true);
  });

  it('il diario racconta tutta la serata', () => {
    const fine = chiudiSerata(alPrimoLotto());
    expect(fine.diario[0]).toContain('si prende Zambelli');   // il lotto senza contendenti
    expect(fine.diario.at(-1)).toBe('Serata chiusa.');
  });
});

describe('conti di base', () => {
  it('il rimborso segue la regola della lega, non un numero scritto a mano', () => {
    const s = iniziale();
    expect(rimborso({ nome: 'x', ruolo: 'D', club: 'y', prezzo: 28 }, s.cfg)).toBe(21);
    expect(rimborso({ nome: 'x', ruolo: 'D', club: 'y', prezzo: 1 }, s.cfg)).toBe(1);
    expect(rimborso({ nome: 'x', ruolo: 'D', club: 'y', prezzo: 0 }, s.cfg)).toBe(0);
  });

  it('lo stato non si modifica sul posto', () => {
    const s = alPrimoLotto();
    const copia = JSON.stringify(s);
    rilancia(s, 'l1', IO, 20, T0);
    chiudiLotto(s, 'l1');
    expect(JSON.stringify(s)).toBe(copia);
  });
});
