import { describe, expect, it } from 'vitest';
import {
  costruisciPrompt, leggiPezzo, ScrittoreTemplate, tonoDellaSfida,
  type Pezzo, type RichiestaPezzo,
} from './scrittore';
import { contaParole, montaMessaggio, numeriDelTesto, verificaPezzo } from './verifica';
import type { Spunto } from './spunti';

function spunto(codice: string, peso: number, fixtureId: string | null, dati: Record<string, number | string> = {}): Spunto {
  return { codice, fixtureId, soggetto: 'Alfa', peso, dati, frase: `frase di ${codice}` };
}

function richiesta(extra: Partial<RichiestaPezzo> = {}): RichiestaPezzo {
  return {
    giornata: 5, serieA: 6, tono: 4, minParole: 20, paroleVietate: [],
    squadre: [
      { nome: 'Alfa', allenatore: 'anna', soprannomi: ['gli Alfisti'], tormentoni: null, puntiDeboli: null, intoccabile: 'il cognato' },
      { nome: 'Beta', allenatore: 'bruno', soprannomi: [], tormentoni: null, puntiDeboli: null, intoccabile: null },
    ],
    sfide: [{
      fixtureId: 'f1', casa: 'Alfa', ospite: 'Beta',
      golCasa: 1, golOspite: 0, fpCasa: 66.5, fpOspite: 65,
      moduloCasa: '4-3-3', moduloOspite: '3-5-2', competizione: 'campionato',
    }],
    spunti: [spunto('vittoria_misura', 70, 'f1', { scarto: 1.5 })],
    classifica: [{ teamId: 'a', nome: 'Alfa', punti: 12, posizione: 1 }],
    tipster: [{ teamId: 'a', nome: 'Alfa', punti: 23.9, giocate: 4, azzeccate: 2, esatti: 0, controSeStesso: null }],
    ...extra,
  };
}

/** Riempitivo senza cifre: le cifre le mettono i test che le vogliono. */
const lungo = (n: number) => Array.from({ length: n }, () => 'parola').join(' ');

function pezzo(extra: Partial<Pezzo> = {}): Pezzo {
  return {
    apertura: 'Una giornata da ricordare.',
    sfide: [{ fixtureId: 'f1', testo: lungo(25) }],
    classifica: 'Alfa in testa.',
    tipster: 'Bene Alfa.',
    ...extra,
  };
}

describe('tonoDellaSfida', () => {
  it('tiene il tono pieno quando c\'è uno spunto grosso', () => {
    expect(tonoDellaSfida(4, [spunto('x', 85, 'f1')])).toBe(4);
  });

  it('scende di un gradino dove non è successo niente', () => {
    expect(tonoDellaSfida(4, [spunto('x', 30, 'f1')])).toBe(3);
    expect(tonoDellaSfida(4, [])).toBe(3);
  });

  it('non scende sotto 1', () => {
    expect(tonoDellaSfida(1, [])).toBe(1);
  });
});

describe('costruisciPrompt', () => {
  it('mette dentro i fixtureId, che il modello deve restituire uguali', () => {
    expect(costruisciPrompt(richiesta())).toContain('fixtureId: f1');
  });

  it('passa soprannomi e argomenti intoccabili', () => {
    const p = costruisciPrompt(richiesta());
    expect(p).toContain('gli Alfisti');
    expect(p).toContain('NON scherzare su: il cognato');
  });

  it('dice chiaramente di non inventare numeri', () => {
    expect(costruisciPrompt(richiesta())).toContain('Non scrivere MAI un numero che non ti ho dato');
  });

  it('scrive il minimo di parole richiesto', () => {
    expect(costruisciPrompt(richiesta({ minParole: 150 }))).toContain('almeno 150 parole');
  });

  it('avverte quando una sfida non ha spunti, invece di chiedere cattiveria a vuoto', () => {
    const p = costruisciPrompt(richiesta({ spunti: [] }));
    expect(p).toContain('senza forzare la battuta');
    expect(p).toContain('tono per questa sfida: 3/5');
  });

  it('elenca le parole vietate solo se ce ne sono', () => {
    expect(costruisciPrompt(richiesta())).not.toContain('Parole vietate');
    expect(costruisciPrompt(richiesta({ paroleVietate: ['scarso'] }))).toContain('scarso');
  });
});

describe('leggiPezzo', () => {
  it('legge il JSON nudo', () => {
    const p = leggiPezzo('{"apertura":"a","sfide":[{"fixtureId":"f1","testo":"t"}],"classifica":"c","tipster":"x"}');
    expect(p.sfide[0].fixtureId).toBe('f1');
  });

  it('sopravvive al blocco di codice markdown', () => {
    const p = leggiPezzo('```json\n{"apertura":"a","sfide":[],"classifica":"","tipster":""}\n```');
    expect(p.apertura).toBe('a');
  });

  it('sopravvive a una riga di cortesia prima del JSON', () => {
    const p = leggiPezzo('Ecco il pezzo:\n{"apertura":"a","sfide":[],"classifica":"","tipster":""}');
    expect(p.apertura).toBe('a');
  });

  it('protesta se non c\'è JSON', () => {
    expect(() => leggiPezzo('mi dispiace, non posso')).toThrow();
  });

  it('protesta se manca l\'elenco delle sfide', () => {
    expect(() => leggiPezzo('{"apertura":"a"}')).toThrow();
  });
});

describe('ScrittoreTemplate', () => {
  it('produce comunque un pezzo per ogni sfida', async () => {
    const r = richiesta();
    const p = await new ScrittoreTemplate().scrivi(r);
    expect(p.sfide).toHaveLength(1);
    expect(p.sfide[0].testo).toContain('Alfa vince 1-0');
  });

  it('usa le frasi di riserva degli spunti', async () => {
    const p = await new ScrittoreTemplate().scrivi(richiesta());
    expect(p.sfide[0].testo).toContain('frase di vittoria_misura');
  });
});

describe('numeriDelTesto', () => {
  it('prende i decimali, che sono i fantapunti e i fantavoti', () => {
    expect(numeriDelTesto('ha fatto 66.5 con un 7,5 in pagella')).toEqual([66.5, 7.5]);
  });

  it('prende gli interi grandi, che sono i prezzi e i punteggi', () => {
    expect(numeriDelTesto('pagato 80 crediti')).toEqual([80]);
  });

  it('lascia stare gli interi piccoli del parlato', () => {
    // «tre punti», «in dieci», «un 6»: legittimi, e trattarli da sospetti
    // riempirebbe di falsi allarmi ogni pezzo
    expect(numeriDelTesto('vince 2-1, gioca in 10, prende 6')).toEqual([]);
  });

  it('non scambia un modulo per una statistica', () => {
    expect(numeriDelTesto('schierato col 4-3-3')).toEqual([]);
  });

  it('ignora le cifre dentro un nome', () => {
    expect(numeriDelTesto('gioca nell\'Under21 da anni')).toEqual([]);
  });
});

describe('verificaPezzo', () => {
  const leciti = new Set([66.5, 65, 23.9, 12]);

  it('promuove un pezzo completo e onesto', () => {
    const e = verificaPezzo(pezzo(), richiesta(), leciti);
    expect(e.ok).toBe(true);
    expect(e.problemi).toEqual([]);
  });

  it('boccia il numero inventato e lo nomina', () => {
    const e = verificaPezzo(
      pezzo({ sfide: [{ fixtureId: 'f1', testo: `${lungo(25)} media di 71.3` }] }),
      richiesta(), leciti,
    );
    expect(e.ok).toBe(false);
    expect(e.inventati).toContain(71.3);
    expect(e.problemi[0]).toContain('71.3');
  });

  it('accetta i fantapunti che gli abbiamo dato', () => {
    const e = verificaPezzo(
      pezzo({ sfide: [{ fixtureId: 'f1', testo: `${lungo(25)} 66.5 contro 65` }] }),
      richiesta(), leciti,
    );
    expect(e.ok).toBe(true);
  });

  it('boccia la sfida troppo corta e dice quanto manca', () => {
    const e = verificaPezzo(
      pezzo({ sfide: [{ fixtureId: 'f1', testo: 'due parole' }] }),
      richiesta(), leciti,
    );
    expect(e.problemi.some((p) => p.includes('2 parole invece di 20'))).toBe(true);
  });

  it('si accorge se una sfida non è stata scritta', () => {
    const e = verificaPezzo(pezzo({ sfide: [] }), richiesta(), leciti);
    expect(e.problemi.some((p) => p.includes('Alfa – Beta'))).toBe(true);
  });

  it('si accorge di una sfida inventata di sana pianta', () => {
    const e = verificaPezzo(
      pezzo({ sfide: [{ fixtureId: 'f1', testo: lungo(25) }, { fixtureId: 'f99', testo: lungo(25) }] }),
      richiesta(), leciti,
    );
    expect(e.problemi.some((p) => p.includes('f99'))).toBe(true);
  });

  it('trova la parola vietata anche con altre maiuscole', () => {
    const e = verificaPezzo(
      pezzo({ apertura: 'Che Scarso' }), richiesta({ paroleVietate: ['scarso'] }), leciti,
    );
    expect(e.problemi.some((p) => p.includes('scarso'))).toBe(true);
  });

  it('conta le parole di ogni sfida, così si vede quale è corta', () => {
    const e = verificaPezzo(pezzo(), richiesta(), leciti);
    expect(e.parole.f1).toBe(25);
  });
});

describe('montaMessaggio', () => {
  it('mette in fila apertura, sfide, classifica e tipster', () => {
    const m = montaMessaggio(pezzo(), richiesta());
    expect(m).toContain('GIORNATA 5');
    expect(m).toContain('Alfa 1-0 Beta');
    expect(m).toContain('66.5 · 65 fantapunti');
    expect(m.indexOf('LA CLASSIFICA')).toBeLessThan(m.indexOf('TORNEO DEI TIPSTER'));
  });

  it('segnala le sfide di coppa', () => {
    const r = richiesta();
    r.sfide[0].competizione = 'coppa';
    expect(montaMessaggio(pezzo(), r)).toContain('(Coppa Mansarda)');
  });

  it('salta i blocchi vuoti invece di lasciare un titolo orfano', () => {
    const m = montaMessaggio(pezzo({ classifica: '', tipster: '' }), richiesta());
    expect(m).not.toContain('LA CLASSIFICA');
  });
});

describe('contaParole', () => {
  it('non si fa ingannare dagli spazi doppi', () => {
    expect(contaParole('  una   due \n tre ')).toBe(3);
  });
});
