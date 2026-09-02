import { describe, expect, it } from 'vitest';
import {
  oraInvio, ricostruisci, righeTabellino, traduciEventi, validaPayload, verificaSfida,
  type GiocatoreGrezzo, type Ruolo, type SquadraGrezza,
} from './tabellino';

// =====================================================================
// Materiale vero: Fanta Mansarda 2ed, giornata 1, letta dalla lega.
// I numeri non sono inventati — se questi test passano, l'estrazione di
// quella giornata è ricostruibile da capo.
// =====================================================================

function g(
  nome: string, ruolo: Ruolo, titolare: boolean, ordine: number,
  voto: number | null, fantavoto: number | null,
  extra: Partial<GiocatoreGrezzo> = {},
): GiocatoreGrezzo {
  return {
    extId: extra.extId ?? null, nome, ruolo, titolare, ordine,
    voto, fantavoto, fascia: extra.fascia ?? null, eventi: extra.eventi ?? {},
  };
}

function squadra(nome: string, giocatori: GiocatoreGrezzo[], extra: Partial<SquadraGrezza> = {}): SquadraGrezza {
  return {
    nome, allenatore: extra.allenatore ?? 'mister', gol: extra.gol ?? 0,
    modulo: extra.modulo ?? '4-3-3', fantapunti: extra.fantapunti ?? null,
    soloVoti: extra.soloVoti ?? null,
    modificatore: extra.modificatore ?? 0, bonusCapitano: extra.bonusCapitano ?? 0,
    inviataIl: extra.inviataIl ?? null, giocatori,
  };
}

/** Pirati dei Caracoli, giornata 1: 63,5 fantapunti, N'Dicka senza voto. */
function pirati(): SquadraGrezza {
  return squadra('Pirati dei Caracoli', [
    g('Maignan', 'P', true, 0, 6, 7, { extId: '4312', eventi: { cleanSheets: 1 } }),
    g('Spinazzola', 'D', true, 1, 6, 6, { extId: '1852' }),
    g("N'Dicka", 'D', true, 2, null, null, { extId: '4317' }),
    g('Akanji', 'D', true, 3, 5.5, 5, { extId: '4159', eventi: { yellowCards: 1 } }),
    g('Bartesaghi', 'D', true, 4, 6, 6, { extId: '6496' }),
    g('Orsolini', 'C', true, 5, 6, 6, { extId: '2167', fascia: 'V' }),
    g('Jashari', 'C', true, 6, 6, 6, { extId: '7203' }),
    g('Zaccagni', 'C', true, 7, 6, 5.5, { extId: '632', eventi: { yellowCards: 1 } }),
    g('Krstovic', 'A', true, 8, 5.5, 5, { extId: '6435', eventi: { yellowCards: 1 } }),
    g('Kolo Muani', 'A', true, 9, 6, 6, { extId: '5951', fascia: 'C' }),
    g('Bowie', 'A', true, 10, 5.5, 5.5, { extId: '7347' }),
    // panchina, nell'ordine deciso dall'allenatore
    g('Mandas', 'P', false, 0, 6, 7, { extId: '6482', eventi: { cleanSheets: 1 } }),
    g('Miranda J.', 'D', false, 1, null, null, { extId: '4734' }),
    g('Obert', 'D', false, 2, 5.5, 5.5, { extId: '5701' }),
    g('Calò', 'C', false, 3, 7, 8, { extId: '7472', eventi: { softAssists: 1 } }),
    g('Frattesi', 'C', false, 4, 7, 10.5, { extId: '2848', eventi: { scoredGoals: 1, decisiveGoals: 1 } }),
    g('Bonny', 'A', false, 5, null, null, { extId: '6669' }),
    g('Piccoli', 'A', false, 6, 5, 5, { extId: '4359' }),
    g('Terracciano', 'P', false, 7, null, null, { extId: '2815' }),
  ], { fantapunti: 63.5, soloVoti: 64, gol: 0, inviataIl: '28/08/2026 20:04:23' });
}

describe('ricostruisci — le sostituzioni del Classico', () => {
  it('rileva il titolare senza voto col primo pari ruolo della panchina che ha giocato', () => {
    const f = ricostruisci(pirati());
    expect(f.subentrati).toHaveLength(1);
    expect(f.subentrati[0].dentro.nome).toBe('Obert');
    expect(f.subentrati[0].alPostoDi.nome).toBe("N'Dicka");
  });

  it('salta il panchinaro dello stesso ruolo che è a sua volta senza voto', () => {
    // Miranda J. è difensore ma senza voto: tocca a Obert, che viene dopo
    const f = ricostruisci(pirati());
    expect(f.subentrati.map((s) => s.dentro.nome)).not.toContain('Miranda J.');
  });

  it('non pesca un panchinaro di ruolo diverso solo perché farebbe quadrare il conto', () => {
    // Calò (C) vale 8 e Frattesi (C) 10.5: entrambi hanno giocato e sono
    // più in alto di Piccoli in panchina, ma il buco è di un difensore.
    const f = ricostruisci(pirati());
    expect(f.subentrati.map((s) => s.dentro.ruolo)).toEqual(['D']);
  });

  it('i conti tornano col totale scritto dalla lega', () => {
    const f = ricostruisci(pirati());
    expect(f.calcolato).toBe(63.5);
    expect(f.atteso).toBe(63.5);
    expect(f.quadra).toBe(true);
    expect(f.scarto).toBe(0);
  });

  it('gioca in dieci se in panchina quel ruolo è finito', () => {
    // un centrocampista senza voto, e in panchina nessun centrocampista
    const s = squadra('In Dieci', [
      g('Portiere', 'P', true, 0, 6, 6),
      ...[1, 2, 3, 4].map((i) => g('Dif' + i, 'D', true, i, 6, 6)),
      ...[5, 6].map((i) => g('Cen' + i, 'C', true, i, 6, 6)),
      g('CenFermo', 'C', true, 7, null, null),
      ...[8, 9, 10].map((i) => g('Att' + i, 'A', true, i, 6, 6, i === 8 ? { fascia: 'C' } : {})),
      g('DifPanca', 'D', false, 0, 6, 6),
      g('AttPanca', 'A', false, 1, 6, 6),
    ], { fantapunti: 60 });   // 10 × 6, nessun subentro

    const f = ricostruisci(s);
    expect(f.subentrati).toHaveLength(0);
    expect(f.inDieci.map((x) => x.nome)).toEqual(['CenFermo']);
    expect(f.scesiInCampo).toHaveLength(10);
    expect(f.quadra).toBe(true);
  });

  it('si ferma al tetto di sostituzioni del regolamento', () => {
    const s = squadra('Tanti Fermi', [
      g('Portiere', 'P', true, 0, 6, 6),
      ...[1, 2, 3, 4].map((i) => g('DifFermo' + i, 'D', true, i, null, null)),
      ...[5, 6, 7].map((i) => g('Cen' + i, 'C', true, i, 6, 6)),
      ...[8, 9, 10].map((i) => g('Att' + i, 'A', true, i, 6, 6, i === 8 ? { fascia: 'C' } : {})),
      ...[0, 1, 2, 3].map((i) => g('DifPanca' + i, 'D', false, i, 6, 6)),
    ], { fantapunti: 60 });   // 7 titolari + 3 subentrati, il quarto resta fuori

    const f = ricostruisci(s);
    expect(f.subentrati).toHaveLength(3);
    expect(f.inDieci).toHaveLength(1);
    expect(f.quadra).toBe(true);
  });

  it('tiene conto di modificatore difesa e fattore capitano', () => {
    const s = pirati();
    s.modificatore = 1;
    s.bonusCapitano = 0.5;
    s.fantapunti = 65;
    expect(ricostruisci(s).quadra).toBe(true);
  });
});

describe('righeTabellino', () => {
  it('segna chi ha contato e chi è entrato', () => {
    const s = pirati();
    const righe = righeTabellino(s, ricostruisci(s));

    const ndicka = righe.find((r) => r.playerName === "N'Dicka")!;
    expect(ndicka.counted).toBe(false);
    expect(ndicka.starter).toBe(true);

    const obert = righe.find((r) => r.playerName === 'Obert')!;
    expect(obert.counted).toBe(true);
    expect(obert.entered).toBe(true);
    expect(obert.starter).toBe(false);

    // Frattesi ha fatto 10,5 in panchina ma non è mai entrato
    const frattesi = righe.find((r) => r.playerName === 'Frattesi')!;
    expect(frattesi.counted).toBe(false);
    expect(frattesi.entered).toBe(false);
  });

  it('un solo capitano, ed è il titolare con la C', () => {
    const s = pirati();
    const capitani = righeTabellino(s, ricostruisci(s)).filter((r) => r.isCaptain);
    expect(capitani).toHaveLength(1);
    expect(capitani[0].playerName).toBe('Kolo Muani');
  });

  it('gli slot sono stabili: titolari 1..11, panchina dal 101', () => {
    const s = pirati();
    const righe = righeTabellino(s, ricostruisci(s));
    const titolari = righe.filter((r) => r.starter).map((r) => r.slot);
    expect(titolari).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(Math.min(...righe.filter((r) => !r.starter).map((r) => r.slot))).toBe(101);
    // reimportare la stessa giornata deve aggiornare, non duplicare
    expect(new Set(righe.map((r) => r.slot)).size).toBe(righe.length);
  });

  it('porta con sé l\'id del listone, che è l\'aggancio ai nostri giocatori', () => {
    const s = pirati();
    const righe = righeTabellino(s, ricostruisci(s));
    expect(righe.every((r) => r.extId !== null)).toBe(true);
    expect(righe.find((r) => r.playerName === 'Kolo Muani')!.extId).toBe('5951');
  });
});

describe('traduciEventi', () => {
  it('traduce le chiavi della lega nei nostri nomi', () => {
    expect(traduciEventi({ scoredGoals: 1, decisiveGoals: 1, yellowCards: 1 }))
      .toEqual({ gol: 1, golVittoria: 1, ammonizioni: 1 });
  });

  it('non butta via una chiave che non conosce', () => {
    const b = traduciEventi({ scoredGoals: 2, chiaveNuovaDellaLega: 1 });
    expect(b.gol).toBe(2);
    expect(b.altri).toEqual({ chiaveNuovaDellaLega: 1 });
  });

  it('conta gli eventi ripetuti', () => {
    expect(traduciEventi({ scoredGoals: 3 }).gol).toBe(3);
  });
});

describe('oraInvio', () => {
  it('legge l\'ora italiana d\'estate come +02:00', () => {
    expect(oraInvio('28/08/2026 20:04:23')).toBe('2026-08-28T18:04:23.000Z');
  });

  it('e quella d\'inverno come +01:00', () => {
    expect(oraInvio('10/01/2027 15:00:00')).toBe('2027-01-10T14:00:00.000Z');
  });

  it('restituisce null se non c\'è una data', () => {
    expect(oraInvio(null)).toBeNull();
    expect(oraInvio('Formazione non inviata')).toBeNull();
  });
});

describe('validaPayload', () => {
  const buono = {
    lega: 'fanta-mansarda-2ed', competizione: '324719', giornata: 1,
    raccoltoIl: '2026-09-02T10:00:00.000Z', versioneEstrattore: 2,
    sfide: [{ indice: 0, dati: { casa: pirati(), ospite: pirati() } }],
  };

  it('accetta un payload completo', () => {
    expect(validaPayload(buono).ok).toBe(true);
  });

  it('rifiuta un payload senza lega', () => {
    const r = validaPayload({ ...buono, lega: '' });
    expect(r.ok).toBe(false);
  });

  it('rifiuta una squadra con meno di undici giocatori', () => {
    const monca = { ...pirati(), giocatori: pirati().giocatori.slice(0, 5) };
    const r = validaPayload({ ...buono, sfide: [{ indice: 0, dati: { casa: monca, ospite: pirati() } }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain('Pirati dei Caracoli');
  });

  it('lascia passare una sfida che il browser ha segnato come non letta', () => {
    const r = validaPayload({ ...buono, sfide: [{ indice: 0, dati: { errore: 'non caricata' } }] });
    expect(r.ok).toBe(true);
  });
});

describe('verificaSfida', () => {
  it('promuove una sfida in cui i conti tornano da tutte e due le parti', () => {
    const r = verificaSfida({ indice: 0, dati: { casa: pirati(), ospite: pirati() } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valore.quadra).toBe(true);
      expect(r.valore.problemi).toEqual([]);
    }
  });

  it('boccia la sfida se il totale non torna, e dice di quanto', () => {
    const storta = pirati();
    storta.fantapunti = 70;                       // la lega dice 70, noi calcoliamo 63,5
    const r = verificaSfida({ indice: 0, dati: { casa: storta, ospite: pirati() } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valore.quadra).toBe(false);
      expect(r.valore.problemi[0]).toContain('scarto -6.5');
    }
  });

  it('segnala una squadra senza capitano', () => {
    const senza = pirati();
    senza.giocatori = senza.giocatori.map((x) => ({ ...x, fascia: x.fascia === 'C' ? null : x.fascia }));
    const r = verificaSfida({ indice: 0, dati: { casa: senza, ospite: pirati() } });
    if (r.ok) expect(r.valore.problemi.some((p) => p.includes('nessun capitano'))).toBe(true);
  });

  it('riporta l\'errore quando il browser non ha letto la sfida', () => {
    const r = verificaSfida({ indice: 2, dati: { errore: 'la pagina non ha finito di caricare' } });
    expect(r.ok).toBe(false);
  });
});
