import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verificaSfida } from '@/lib/redazione/tabellino';
import {
  bonusDiSquadra, capitaniApi, classificaApi, dataApi, eventiApi, giocatoriApi, moduloApi,
  risultatoApi, squadraApi, votoApi, type Anagrafica, type DettaglioApi, type LatoApi, type RigaApi,
} from './traduci';

// Risposte vere di `teamLineup/{comp}/{mday}/{cmday}/{casa}/{ospite}`, prima
// giornata di una lega del 2026/27, dai test di Leffettore/fantabot (MIT).
// Non sono della nostra lega: servono a fissare il significato dei campi.
const VERE: DettaglioApi[] = readdirSync(join(__dirname, 'fixtures'))
  .map((f) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8')));

describe('le risposte vere', () => {
  it('cscr è il fantavoto che conta: chi ha giocato somma esattamente il totale della lega', () => {
    // la piattaforma segna chi è uscito (U) e chi è entrato (E): con quelli, la
    // somma dei cscr deve fare `tot` in ogni formazione, al mezzo punto
    for (const d of VERE) {
      for (const lato of [d.home, d.away]) {
        const conta = (r: RigaApi) => (votoApi(r.scr) == null ? 0 : Number(r.cscr));
        const somma = (lato.starts ?? []).filter((r) => r.ptype !== 'U').reduce((s, r) => s + conta(r), 0)
          + (lato.bench ?? []).filter((r) => r.ptype === 'E').reduce((s, r) => s + conta(r), 0);
        expect(somma).toBe(lato.tot);
      }
    }
  });

  it('undici titolari e la panchina nell\'ordine, con i senza voto a null', () => {
    const lato = VERE[0].away;
    const g = giocatoriApi(lato, new Map());
    expect(g.filter((x) => x.titolare)).toHaveLength(11);
    expect(g.filter((x) => !x.titolare).map((x) => x.ordine)).toEqual(lato.bench!.map((_, i) => i));
    const sv = g.filter((x) => x.voto == null);
    expect(sv.length).toBeGreaterThan(0);
    expect(sv.every((x) => x.fantavoto == null)).toBe(true);
  });
});

describe('i pezzi', () => {
  it('voto: 55, 56 e 100 sono il senza voto', () => {
    expect([6.5, 55, 56, 100, null, 0].map(votoApi)).toEqual([6.5, null, null, null, null, null]);
  });

  it('eventi con i nomi delle icone del preferito', () => {
    expect(eventiApi('1;0;2;0;0;0;1;0;1;0;1;0;0;1;0;1')).toEqual({
      yellowCards: 1, scoredGoals: 2, scoredPenalties: 1, decisiveGoals: 1,
      cleanSheets: 1, assists: 1, motm: 1,
    });
    expect(eventiApi('0;0;0;0;0;0;0;1;0;0;0;0;0;0;0;0')).toEqual({ posizione7: 1 });
  });

  it('capitano e vice, in lista o in stringa', () => {
    expect(capitaniApi([10, 20])).toEqual({ c: 10, v: 20 });
    expect(capitaniApi('10;20')).toEqual({ c: 10, v: 20 });
    expect(capitaniApi(null)).toEqual({ c: null, v: null });
  });

  it('modulo, data di invio e risultato', () => {
    expect(moduloApi('343')).toBe('3-4-3');
    expect(dataApi('20260904125003261')).toBe('04/09/2026 12:50:03');
    expect(risultatoApi('3-2')).toEqual([3, 2]);
  });
});

/** Una formazione classica 4-4-2 con voti scelti, e un totale coerente. */
function lato(tot: number, capt: unknown = [10, 9]): { lato: LatoApi; anag: Map<string, Anagrafica> } {
  const ruoli: Anagrafica['ruolo'][] = ['P', 'D', 'D', 'D', 'D', 'C', 'C', 'C', 'C', 'A', 'A'];
  const voti = [6.5, 7, 6.5, 6, 5, 6, 6, 6, 6, 7.5, 6];
  const anag = new Map<string, Anagrafica>();
  const starts = ruoli.map((r, i) => {
    anag.set(String(i + 1), { nome: `G${i + 1}`, ruolo: r });
    return { pid: i + 1, scr: voti[i], cscr: voti[i], b: '', ptype: '-' };
  });
  anag.set('50', { nome: 'Riserva', ruolo: 'D' });
  return { lato: { tid: 1, starts, bench: [{ pid: 50, scr: 6, cscr: 6, b: '' }], capt, mdl: '442', tot }, anag };
}

describe('modificatore e capitano dal tabellino dell\'API', () => {
  it('difesa a 4: media di P e tre migliori D; capitano col suo voto', () => {
    const { lato: l, anag } = lato(0);
    const g = giocatoriApi(l, anag);
    // (6.5 + 7 + 6.5 + 6) / 4 = 6.5 → 1.5; il capitano (10, A) ha 7.5 → 1.5
    expect(bonusDiSquadra(g)).toEqual({ modificatore: 1.5, capitano: 1.5 });
  });

  it('capitano senza voto: vale il vice', () => {
    const { lato: l, anag } = lato(0, [3, 10]);   // capitano un D, vice l'attaccante da 7,5
    l.starts![2] = { ...l.starts![2], scr: 56, cscr: 100 };
    expect(bonusDiSquadra(giocatoriApi(l, anag)).capitano).toBe(1.5);
  });

  it('un tabellino coerente passa la verifica dei conti dell\'import, uno sbagliato no', () => {
    const somma = 6.5 + 7 + 6.5 + 6 + 5 + 6 * 4 + 7.5 + 6;
    // lega e calcolo d'accordo: somma + modificatore 1,5 + capitano 1,5
    const a = lato(somma + 3);
    const b = lato(somma + 3);
    const casa = squadraApi(a.lato, 3, { nome: 'Casa', allenatore: 'x' }, a.anag);
    const ospite = squadraApi(b.lato, 3, { nome: 'Ospite', allenatore: 'y' }, b.anag);
    const ok = verificaSfida({ indice: 0, dati: { casa, ospite } });
    expect(ok.ok && ok.valore.quadra).toBe(true);
    // la lega dice mezzo punto in più: l'import si ferma e dice dove
    const storta = squadraApi({ ...a.lato, tot: somma + 3.5 }, 3, { nome: 'Casa', allenatore: 'x' }, a.anag);
    const ko = verificaSfida({ indice: 0, dati: { casa: storta, ospite } });
    expect(ko.ok && ko.valore.quadra).toBe(false);
    expect(ko.ok && ko.valore.problemi[0]).toContain("scarto -0.5");
  });
});

describe('classificaApi', () => {
  const nomi = new Map([[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']]);
  const turni = [
    { matchDay: 1, championshipMatchDay: 3, calculated: true, matches: [
      { tIdH: 1, tIdA: 2, result: '2-0', ptH: 72, ptA: 60, standingPtH: 3, standingPtA: 0 },
      { tIdH: 3, tIdA: 4, result: '1-1', ptH: 68, ptA: 67, standingPtH: 1, standingPtA: 1 },
    ] },
    { matchDay: 2, championshipMatchDay: 4, calculated: true, matches: [
      { tIdH: 2, tIdA: 3, result: '3-1', ptH: 80, ptA: 66, standingPtH: 3, standingPtA: 0 },
      { tIdH: 4, tIdA: 1, result: '0-0', ptH: 60, ptA: 62, standingPtH: 1, standingPtA: 1 },
    ] },
    { matchDay: 3, championshipMatchDay: 5, calculated: false, matches: [
      { tIdH: 1, tIdA: 3, result: '9-0', ptH: 100, ptA: 0, standingPtH: 3, standingPtA: 0 },
    ] },
  ];

  it('punti, gol e fantapunti dalle partite calcolate, e solo da quelle', () => {
    const c = classificaApi(turni, nomi, { id: 9, nome: 'Campionato', tipo: 'campionato' });
    expect(c.righe.map((r) => [r.squadra, r.punti, r.fantapunti])).toEqual([
      ['A', 4, 134], ['B', 3, 140], ['D', 2, 127], ['C', 1, 134],
    ]);
    expect(c.righe[0]).toMatchObject({ posizione: 1, giocate: 2, vinte: 1, pari: 1, golFatti: 2, golSubiti: 0, differenza: 2 });
  });

  it('un girone di coppa conta solo le sue squadre', () => {
    const c = classificaApi(turni, nomi, { id: 9, nome: 'Coppa', tipo: 'coppa' }, { nome: 'A', squadre: new Set([1, 2]) });
    expect(c.righe.map((r) => r.squadra)).toEqual(['A', 'B']);
    expect(c.gruppo).toBe('A');
  });
});
