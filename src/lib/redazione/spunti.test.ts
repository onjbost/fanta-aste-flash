import { describe, expect, it } from 'vitest';
import {
  numeriLeciti, prossimaSogliaGol, trovaSpunti,
  type ContestoGiornata, type GiocatoreInCampo, type PrecedenteSquadra, type SquadraInSfida,
} from './spunti';

// =====================================================================
// Impalcatura
// =====================================================================

function giocatore(nome: string, fantavoto: number | null, extra: Partial<GiocatoreInCampo> = {}): GiocatoreInCampo {
  return {
    nome, ruolo: extra.ruolo ?? 'C', voto: extra.voto ?? fantavoto, fantavoto,
    titolare: extra.titolare ?? true, entered: extra.entered ?? false,
    isCaptain: extra.isCaptain ?? false, counted: extra.counted ?? fantavoto != null,
    bonus: extra.bonus ?? {}, prezzoAsta: extra.prezzoAsta ?? null,
    daAstaFlash: extra.daAstaFlash ?? false,
  };
}

function squadra(nome: string, gol: number, fantapunti: number, extra: Partial<SquadraInSfida> = {}): SquadraInSfida {
  return {
    teamId: extra.teamId ?? nome.toLowerCase(), nome, soprannomi: extra.soprannomi ?? [],
    gol, fantapunti, modulo: extra.modulo ?? '4-4-2',
    modificatore: extra.modificatore ?? 0, bonusCapitano: extra.bonusCapitano ?? 0,
    // attenzione a ?? qui: `inviataIl: null` è un caso da testare, non un
    // valore mancante, e ?? lo rimpiazzerebbe con la data di riserva
    inviataIl: 'inviataIl' in extra ? extra.inviataIl! : '2026-08-29T10:00:00.000Z',
    chiusuraIl: 'chiusuraIl' in extra ? extra.chiusuraIl! : '2026-08-29T13:00:00.000Z',
    giocatori: extra.giocatori ?? [giocatore('Tizio', 6), giocatore('Caio', 6)],
  };
}

function contesto(extra: Partial<ContestoGiornata> = {}): ContestoGiornata {
  return {
    fanta: extra.fanta ?? 5, serieA: extra.serieA ?? 6,
    sfide: extra.sfide ?? [],
    precedenti: extra.precedenti ?? [],
    classificaPrima: extra.classificaPrima ?? [],
    classificaDopo: extra.classificaDopo ?? [],
    classificaUfficiale: extra.classificaUfficiale,
    gironiCoppa: extra.gironiCoppa,
    gironiCoppaPrima: extra.gironiCoppaPrima,
    tipster: extra.tipster ?? [],
    sogliaBigMoney: extra.sogliaBigMoney,
  };
}

function sfida(casa: SquadraInSfida, ospite: SquadraInSfida, fixtureId = 'f1') {
  return { fixtureId, competizione: 'campionato' as const, casa, ospite };
}

const codici = (ctx: ContestoGiornata) => trovaSpunti(ctx).map((s) => s.codice);
const trova = (ctx: ContestoGiornata, codice: string) => trovaSpunti(ctx).find((s) => s.codice === codice);

// =====================================================================

describe('prossimaSogliaGol', () => {
  it('sotto 66 conta quanto manca al primo gol', () => {
    expect(prossimaSogliaGol(65.5)).toBe(0.5);
    expect(prossimaSogliaGol(60)).toBe(6);
  });
  it('sopra, un gol ogni sei punti', () => {
    expect(prossimaSogliaGol(66)).toBe(6);
    expect(prossimaSogliaGol(71.5)).toBe(0.5);
    expect(prossimaSogliaGol(77.5)).toBe(0.5);
  });
});

describe('spunti sul risultato', () => {
  it('vede la vittoria per mezzo punto', () => {
    const ctx = contesto({ sfide: [sfida(squadra('Alfa', 1, 66.5), squadra('Beta', 0, 66))] });
    const s = trova(ctx, 'vittoria_misura')!;
    expect(s.soggetto).toBe('Alfa');
    expect(s.dati.scarto).toBe(0.5);
  });

  it('vede il gol negato per mezzo fantapunto', () => {
    const ctx = contesto({ sfide: [sfida(squadra('Alfa', 0, 65.5), squadra('Beta', 1, 72))] });
    const s = trova(ctx, 'gol_negato')!;
    expect(s.dati.squadra).toBe('Alfa');
    expect(s.dati.mancava).toBe(0.5);
    expect(s.peso).toBe(85);
  });

  it('vede chi perde col punteggio più alto della giornata', () => {
    const ctx = contesto({
      sfide: [
        sfida(squadra('Alfa', 1, 82), squadra('Beta', 2, 71), 'f1'),
        sfida(squadra('Gamma', 1, 70), squadra('Delta', 1, 69), 'f2'),
      ],
    });
    const s = trova(ctx, 'sconfitta_col_record')!;
    expect(s.dati.squadra).toBe('Alfa');
    expect(s.dati.fantapunti).toBe(82);
  });

  it('non chiama record chi vince col punteggio più alto', () => {
    const ctx = contesto({ sfide: [sfida(squadra('Alfa', 2, 82), squadra('Beta', 1, 71))] });
    expect(codici(ctx)).not.toContain('sconfitta_col_record');
  });
});

describe('spunti sulle strisce', () => {
  function precedenti(teamId: string, ris: [number, number][], avversarioId = 'x'): PrecedenteSquadra[] {
    return ris.map(([f, s], i) => ({
      fanta: i + 1, teamId, avversarioId, avversario: 'Avversario',
      golFatti: f, golSubiti: s, fantapunti: 70,
    }));
  }

  it('nota il terzo 1-0 di fila, e pesa di più al quarto', () => {
    const tre = contesto({
      fanta: 3,
      sfide: [sfida(squadra('Alfa', 1, 67, { teamId: 'alfa' }), squadra('Beta', 0, 60, { teamId: 'beta' }))],
      precedenti: precedenti('alfa', [[1, 0], [1, 0]]),
    });
    const s3 = trova(tre, 'striscia_risultato')!;
    expect(s3.dati.quante).toBe(3);
    expect(s3.dati.risultato).toBe('1-0');

    const quattro = contesto({
      fanta: 4,
      sfide: [sfida(squadra('Alfa', 1, 67, { teamId: 'alfa' }), squadra('Beta', 0, 60, { teamId: 'beta' }))],
      precedenti: precedenti('alfa', [[1, 0], [1, 0], [1, 0]]),
    });
    expect(trova(quattro, 'striscia_risultato')!.peso).toBeGreaterThan(s3.peso);
  });

  it('la striscia si interrompe se in mezzo c\'è un altro risultato', () => {
    const ctx = contesto({
      sfide: [sfida(squadra('Alfa', 1, 67, { teamId: 'alfa' }), squadra('Beta', 0, 60, { teamId: 'beta' }))],
      precedenti: precedenti('alfa', [[1, 0], [2, 1], [1, 0]]),
    });
    expect(codici(ctx)).not.toContain('striscia_risultato');
  });

  it('conta il digiuno di gol', () => {
    const ctx = contesto({
      sfide: [sfida(squadra('Alfa', 0, 60, { teamId: 'alfa' }), squadra('Beta', 1, 67, { teamId: 'beta' }))],
      precedenti: precedenti('alfa', [[0, 1], [0, 2]]),
    });
    expect(trova(ctx, 'digiuno')!.dati.quante).toBe(3);
  });

  it('riconosce la nemesi solo se ha sempre perso contro quello', () => {
    const persaSempre = contesto({
      sfide: [sfida(squadra('Alfa', 0, 60, { teamId: 'alfa' }), squadra('Beta', 1, 67, { teamId: 'beta' }))],
      precedenti: precedenti('alfa', [[0, 1], [1, 2]], 'beta'),
    });
    expect(trova(persaSempre, 'nemesi')!.dati.avversario).toBe('Beta');

    const unaVinta = contesto({
      sfide: [sfida(squadra('Alfa', 0, 60, { teamId: 'alfa' }), squadra('Beta', 1, 67, { teamId: 'beta' }))],
      precedenti: precedenti('alfa', [[2, 1], [1, 2]], 'beta'),
    });
    expect(codici(unaVinta)).not.toContain('nemesi');
  });
});

describe('spunti sui singoli', () => {
  it('trova l\'uomo della giornata e la palla di piombo', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 2, 75, { giocatori: [giocatore('Bomber', 12), giocatore('Normale', 6)] }),
        squadra('Beta', 0, 60, { giocatori: [giocatore('Disastro', 2), giocatore('Normale2', 6)] }),
      )],
    });
    expect(trova(ctx, 'uomo_giornata')!.dati.giocatore).toBe('Bomber');
    expect(trova(ctx, 'palla_di_piombo')!.dati.giocatore).toBe('Disastro');
  });

  it('smaschera il pagato tanto che ha fatto poco', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, { giocatori: [giocatore('Costoso', 4, { prezzoAsta: 80 }), giocatore('X', 6)] }),
        squadra('Beta', 0, 60),
      )],
    });
    const s = trova(ctx, 'traditore')!;
    expect(s.dati.prezzo).toBe(80);
    expect(s.frase).toContain('80 crediti');
  });

  it('non chiama traditore chi costava poco', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, { giocatori: [giocatore('Economico', 4, { prezzoAsta: 3 })] }),
        squadra('Beta', 0, 60),
      )],
    });
    expect(codici(ctx)).not.toContain('traditore');
  });

  it('vede la panchina che avrebbe reso di più', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, {
          giocatori: [
            giocatore('Titolare', 4),
            giocatore('Panchinaro', 11, { titolare: false, counted: false }),
          ],
        }),
        squadra('Beta', 0, 60),
      )],
    });
    const s = trova(ctx, 'panchina_beffarda')!;
    expect(s.dati.differenza).toBe(7);
    expect(s.dati.panchinaro).toBe('Panchinaro');
  });

  it('non confronta un panchinaro con un titolare di ruolo diverso', () => {
    // Il caso vero, uscito al primo pezzo generato: un portiere da 2 in campo
    // e un difensore da 6,5 in panchina. Quel difensore non avrebbe potuto
    // giocare in porta, quindi non è un rimprovero — è una frase che suona
    // bene e non vuol dire niente.
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, {
          giocatori: [
            giocatore('De Gea', 2, { ruolo: 'P' }),
            giocatore('Chalobah T.', 6.5, { ruolo: 'D', titolare: false, counted: false }),
          ],
        }),
        squadra('Beta', 0, 60),
      )],
    });
    expect(codici(ctx)).not.toContain('panchina_beffarda');
  });

  it('lo confronta col pari ruolo, e mette il ruolo nei dati', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, {
          giocatori: [
            giocatore('De Gea', 2, { ruolo: 'P' }),
            giocatore('Muric', 7, { ruolo: 'P', titolare: false, counted: false }),
            giocatore('Chalobah T.', 6.5, { ruolo: 'D', titolare: false, counted: false }),
          ],
        }),
        squadra('Beta', 0, 60),
      )],
    });
    const s = trova(ctx, 'panchina_beffarda')!;
    expect(s.dati.ruolo).toBe('P');
    expect(s.dati.panchinaro).toBe('Muric');
    expect(s.dati.titolare).toBe('De Gea');
    expect(s.dati.differenza).toBe(5);
    expect(s.frase).toContain('portiere');
  });

  it('non se la prende con la panchina se il panchinaro era entrato', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, {
          giocatori: [
            giocatore('Titolare', 4),
            giocatore('Entrato', 11, { titolare: false, entered: true, counted: true }),
          ],
        }),
        squadra('Beta', 0, 60),
      )],
    });
    expect(codici(ctx)).not.toContain('panchina_beffarda');
  });

  it('nota chi ha giocato in dieci', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 0, 55, {
          giocatori: [giocatore('Gioca', 6), giocatore('Fermo', null, { counted: false })],
        }),
        squadra('Beta', 1, 67),
      )],
    });
    expect(trova(ctx, 'in_dieci')!.dati.quanti).toBe(1);
  });

  it('celebra lo svincolato dell\'asta flash che spacca', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 2, 75, { giocatori: [giocatore('Rivelazione', 11, { daAstaFlash: true })] }),
        squadra('Beta', 0, 60),
      )],
    });
    expect(trova(ctx, 'vendetta_svincolato')!.dati.giocatore).toBe('Rivelazione');
  });

  it('registra il portiere crivellato dai gol', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 0, 58, { giocatori: [giocatore('Portiere', 3, { ruolo: 'P', bonus: { golSubiti: 4 } })] }),
        squadra('Beta', 2, 72),
      )],
    });
    expect(trova(ctx, 'portiere_crivellato')!.dati.golSubiti).toBe(4);
  });
});

describe('spunti sulla classifica e sul tipster', () => {
  it('vede il sorpasso in vetta', () => {
    const ctx = contesto({
      classificaPrima: [
        { teamId: 'b', nome: 'Beta', punti: 9, posizione: 1 },
        { teamId: 'a', nome: 'Alfa', punti: 7, posizione: 2 },
      ],
      classificaDopo: [
        { teamId: 'a', nome: 'Alfa', punti: 10, posizione: 1 },
        { teamId: 'b', nome: 'Beta', punti: 9, posizione: 2 },
      ],
    });
    const s = trova(ctx, 'sorpasso')!;
    expect(s.dati.nuovo).toBe('Alfa');
    expect(s.dati.vecchio).toBe('Beta');
  });

  it('è l\'autogol del tipster lo spunto che pesa di più', () => {
    const ctx = contesto({
      tipster: [{
        teamId: 'a', nome: 'Alfa', punti: 40, giocate: 4, azzeccate: 2, esatti: 0,
        controSeStesso: { indovinato: true, haPerso: true },
      }],
    });
    const s = trovaSpunti(ctx);
    expect(s[0].codice).toBe('autogol_tipster');
    expect(s[0].peso).toBe(95);
  });

  it('segna chi ha fatto zero su tutta la schedina', () => {
    const ctx = contesto({
      tipster: [{ teamId: 'b', nome: 'Beta', punti: 0, giocate: 5, azzeccate: 0, esatti: 0, controSeStesso: null }],
    });
    expect(trova(ctx, 'tipster_zero')!.dati.giocate).toBe(5);
  });
});

describe('spunti sul comportamento', () => {
  it('nota la formazione mandata all\'ultimo minuto', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 70, {
          inviataIl: '2026-08-29T12:58:00.000Z', chiusuraIl: '2026-08-29T13:00:00.000Z',
        }),
        squadra('Beta', 0, 60),
      )],
    });
    expect(trova(ctx, 'formazione_last_minute')!.dati.minuti).toBe(2);
  });

  it('e quella non mandata affatto', () => {
    const ctx = contesto({
      sfide: [sfida(squadra('Alfa', 0, 55, { inviataIl: null }), squadra('Beta', 1, 67))],
    });
    expect(trova(ctx, 'formazione_dimenticata')!.soggetto).toBe('Alfa');
  });
});

describe('ordinamento e numeri leciti', () => {
  it('mette in cima quello che pesa di più', () => {
    const ctx = contesto({
      sfide: [sfida(squadra('Alfa', 1, 82), squadra('Beta', 2, 71))],
      tipster: [{
        teamId: 'a', nome: 'Alfa', punti: 40, giocate: 4, azzeccate: 2, esatti: 0,
        controSeStesso: { indovinato: true, haPerso: true },
      }],
    });
    const pesi = trovaSpunti(ctx).map((s) => s.peso);
    expect(pesi).toEqual([...pesi].sort((a, b) => b - a));
  });

  it('raccoglie ogni numero che il pezzo può citare', () => {
    const ctx = contesto({
      sfide: [sfida(
        squadra('Alfa', 1, 66.5, { giocatori: [giocatore('Uno', 9.5, { prezzoAsta: 44 })] }),
        squadra('Beta', 0, 66),
      )],
    });
    const n = numeriLeciti(ctx, trovaSpunti(ctx));
    expect(n.has(66.5)).toBe(true);
    expect(n.has(9.5)).toBe(true);
    expect(n.has(44)).toBe(true);
    expect(n.has(0.5)).toBe(true);      // lo scarto, che nasce dagli spunti
    expect(n.has(12345)).toBe(false);
  });
});

// =====================================================================
// La classifica dentro le singole sfide
// =====================================================================

describe('la classifica dentro le sfide', () => {
  /** Otto squadre: la classifica di riferimento, con Alfa e Beta agli estremi. */
  const otto = (ordine: [string, string, number][]) =>
    ordine.map(([teamId, nome, punti], i) => ({ teamId, nome, punti, posizione: i + 1 }));

  const PRIMA = otto([
    ['a', 'Alfa', 9], ['b', 'Beta', 7], ['c', 'Gamma', 6], ['d', 'Delta', 5],
    ['e', 'Epsilon', 4], ['f', 'Zeta', 3], ['g', 'Eta', 2], ['h', 'Theta', 0],
  ]);

  it('riconosce lo scontro d\'alta classifica', () => {
    const ctx = contesto({
      classificaPrima: PRIMA, classificaDopo: PRIMA,
      sfide: [sfida(
        squadra('Alfa', 2, 80, { teamId: 'a' }),
        squadra('Beta', 1, 74, { teamId: 'b' }),
      )],
    });
    const s = trova(ctx, 'scontro_alta')!;
    expect(s.fixtureId).toBe('f1');
    expect(s.dati.posCasa).toBe(1);
    expect(s.dati.posOspite).toBe(2);
  });

  it('non lo chiama scontro d\'alta se una delle due è a metà', () => {
    const ctx = contesto({
      classificaPrima: PRIMA, classificaDopo: PRIMA,
      sfide: [sfida(
        squadra('Alfa', 2, 80, { teamId: 'a' }),
        squadra('Epsilon', 1, 74, { teamId: 'e' }),
      )],
    });
    expect(codici(ctx)).not.toContain('scontro_alta');
  });

  it('racconta il sorpasso diretto fra le due che si sono affrontate', () => {
    const dopo = otto([
      ['b', 'Beta', 10], ['a', 'Alfa', 9], ['c', 'Gamma', 6], ['d', 'Delta', 5],
      ['e', 'Epsilon', 4], ['f', 'Zeta', 3], ['g', 'Eta', 2], ['h', 'Theta', 0],
    ]);
    const ctx = contesto({
      classificaPrima: PRIMA, classificaDopo: dopo,
      sfide: [sfida(
        squadra('Alfa', 0, 70, { teamId: 'a' }),
        squadra('Beta', 2, 78, { teamId: 'b' }),
      )],
    });
    const s = trova(ctx, 'sorpasso_diretto')!;
    expect(s.dati.sale).toBe('Beta');
    expect(s.dati.scende).toBe('Alfa');
    expect(s.dati.posSale).toBe(1);
  });

  it('dà più peso all\'ultima che batte la prima', () => {
    const ctx = contesto({
      classificaPrima: PRIMA, classificaDopo: PRIMA,
      sfide: [sfida(
        squadra('Alfa', 0, 66, { teamId: 'a' }),
        squadra('Theta', 1, 70, { teamId: 'h' }),
      )],
    });
    const s = trova(ctx, 'primo_contro_ultimo')!;
    expect(s.dati.vinceIlBasso).toBe(true);
    expect(s.peso).toBeGreaterThan(70);
  });

  it('segna la scalata solo se vale almeno due posizioni', () => {
    const dopoUno = otto([
      ['b', 'Beta', 10], ['a', 'Alfa', 9], ['c', 'Gamma', 6], ['d', 'Delta', 5],
      ['e', 'Epsilon', 4], ['f', 'Zeta', 3], ['g', 'Eta', 2], ['h', 'Theta', 0],
    ]);
    const unaSola = contesto({
      classificaPrima: PRIMA, classificaDopo: dopoUno,
      sfide: [sfida(
        squadra('Alfa', 0, 70, { teamId: 'a' }),
        squadra('Beta', 2, 78, { teamId: 'b' }),
      )],
    });
    expect(codici(unaSola)).not.toContain('scalata');

    const dopoTre = otto([
      ['d', 'Delta', 11], ['a', 'Alfa', 9], ['b', 'Beta', 7], ['c', 'Gamma', 6],
      ['e', 'Epsilon', 4], ['f', 'Zeta', 3], ['g', 'Eta', 2], ['h', 'Theta', 0],
    ]);
    const tre = contesto({
      classificaPrima: PRIMA, classificaDopo: dopoTre,
      sfide: [sfida(
        squadra('Delta', 3, 88, { teamId: 'd' }),
        squadra('Eta', 0, 60, { teamId: 'g' }),
      )],
    });
    const s = trova(tre, 'scalata')!;
    expect(s.dati.da).toBe(4);
    expect(s.dati.a).toBe(1);
  });

  it('per la coppa guarda il girone, non la classifica di campionato', () => {
    const ctx = contesto({
      classificaPrima: PRIMA, classificaDopo: PRIMA,
      gironiCoppa: [{
        gruppo: 'A',
        righe: [
          { teamId: 'h', nome: 'Theta', punti: 3, posizione: 1 },
          { teamId: 'a', nome: 'Alfa', punti: 0, posizione: 2 },
        ],
      }],
      sfide: [{
        fixtureId: 'c1', competizione: 'coppa',
        casa: squadra('Theta', 2, 75, { teamId: 'h' }),
        ospite: squadra('Alfa', 1, 71, { teamId: 'a' }),
      }],
    });
    const s = trova(ctx, 'girone_coppa')!;
    expect(s.fixtureId).toBe('c1');
    expect(s.dati.gruppo).toBe('A');
    expect(s.dati.posCasa).toBe(1);
    // e la sfida di coppa non finisce dentro gli spunti di campionato
    expect(codici(ctx)).not.toContain('scontro_alta');
  });

  it('aggancia per nome quando la lega dà una squadra che non riconosciamo', () => {
    const senzaId = PRIMA.map((r) => ({ ...r, teamId: `nome:${r.nome}` }));
    const ctx = contesto({
      classificaPrima: senzaId, classificaDopo: senzaId,
      sfide: [sfida(
        squadra('Alfa', 2, 80, { teamId: 'a' }),
        squadra('Beta', 1, 74, { teamId: 'b' }),
      )],
    });
    expect(trova(ctx, 'scontro_alta')!.dati.posOspite).toBe(2);
  });

  it('mette le posizioni dei gironi fra i numeri leciti', () => {
    const ctx = contesto({
      gironiCoppa: [{ gruppo: 'B', righe: [{ teamId: 'x', nome: 'Iota', punti: 4, posizione: 3 }] }],
    });
    const leciti = numeriLeciti(ctx, []);
    expect(leciti.has(4)).toBe(true);
    expect(leciti.has(3)).toBe(true);
  });
});
