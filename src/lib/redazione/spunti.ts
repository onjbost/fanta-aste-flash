/**
 * La Redazione — gli spunti della giornata.
 *
 * Funzioni pure: entra quello che è successo, esce l'elenco delle cose che
 * *meritano di essere raccontate*, ognuna con i suoi numeri esatti e un peso.
 *
 * Perché non lasciar fare tutto al modello: le cose divertenti del fantacalcio
 * non stanno dentro una giornata, stanno nel confronto fra giornate. Il terzo
 * 1-0 di fila, il digiuno, la nemesi che ti batte sempre — per accorgersene
 * bisogna guardare lo storico e contare, e un modello a cui dai il tabellone
 * della domenica quelle cose non le vede. Peggio: se gli chiedi di essere
 * spiritoso senza dargli materiale, se lo inventa.
 *
 * Qui si conta. Al modello si passa il risultato del conteggio.
 */

import type { Bonus, Ruolo } from './tabellino';

// =====================================================================
// Quello che serve sapere
// =====================================================================

export interface GiocatoreInCampo {
  nome: string;
  ruolo: Ruolo | null;
  voto: number | null;
  fantavoto: number | null;
  titolare: boolean;
  entered: boolean;
  isCaptain: boolean;
  counted: boolean;
  bonus: Bonus;
  /** quanto è costato all'asta, se è nostro */
  prezzoAsta: number | null;
  /** arrivato con un'asta flash e non con quella iniziale */
  daAstaFlash: boolean;
}

export interface SquadraInSfida {
  teamId: string;
  nome: string;
  soprannomi: string[];
  gol: number;
  fantapunti: number;
  modulo: string | null;
  modificatore: number;
  bonusCapitano: number;
  /** quando è arrivata la formazione, e quando si chiudeva */
  inviataIl: string | null;
  chiusuraIl: string | null;
  giocatori: GiocatoreInCampo[];
}

export interface SfidaInGiornata {
  fixtureId: string;
  competizione: 'campionato' | 'coppa';
  casa: SquadraInSfida;
  ospite: SquadraInSfida;
}

/** Una sfida già archiviata, dal punto di vista di una squadra. */
export interface PrecedenteSquadra {
  fanta: number;
  teamId: string;
  avversarioId: string;
  avversario: string;
  golFatti: number;
  golSubiti: number;
  fantapunti: number;
}

export interface RigaClassifica { teamId: string; nome: string; punti: number; posizione: number }

export interface TipsterGiornata {
  teamId: string;
  nome: string;
  punti: number;
  giocate: number;
  azzeccate: number;
  /** quante volte ha indovinato il risultato esatto */
  esatti: number;
  /** ha giocato contro la propria squadra, e com'è finita */
  controSeStesso: { indovinato: boolean; haPerso: boolean } | null;
}

export interface ContestoGiornata {
  fanta: number;
  serieA: number;
  sfide: SfidaInGiornata[];
  /** tutte le sfide di campionato già archiviate, giornata crescente */
  precedenti: PrecedenteSquadra[];
  classificaPrima: RigaClassifica[];
  classificaDopo: RigaClassifica[];
  tipster: TipsterGiornata[];
  /** sopra questo prezzo un giocatore è «uno di quelli pagati» */
  sogliaBigMoney?: number;
}

export interface Spunto {
  codice: string;
  /** null quando è uno spunto di giornata e non di una singola sfida */
  fixtureId: string | null;
  soggetto: string;
  peso: number;
  dati: Record<string, string | number | boolean>;
  /** la frase di riserva, già scritta: serve se il modello non risponde */
  frase: string;
}

const SOGLIA_GOL = 66;
const PASSO_GOL = 6;
const SOGLIA_BIG_MONEY = 30;

// =====================================================================
// Il catalogo
// =====================================================================

export function trovaSpunti(ctx: ContestoGiornata): Spunto[] {
  const spunti: Spunto[] = [
    ...suiRisultati(ctx),
    ...sulleStrisce(ctx),
    ...suiSingoli(ctx),
    ...sullaClassifica(ctx),
    ...sulTipster(ctx),
    ...sulComportamento(ctx),
  ];
  return spunti.sort((a, b) => b.peso - a.peso);
}

// ---------------------------------------------------------------- risultati

function suiRisultati(ctx: ContestoGiornata): Spunto[] {
  const out: Spunto[] = [];
  const tutte = ctx.sfide.flatMap((s) => [s.casa, s.ospite]);
  const massimo = Math.max(...tutte.map((t) => t.fantapunti));

  for (const s of ctx.sfide) {
    const { casa, ospite } = s;
    const scarto = Math.abs(casa.fantapunti - ospite.fantapunti);
    const vince = casa.gol > ospite.gol ? casa : ospite.gol > casa.gol ? ospite : null;
    const perde = vince === casa ? ospite : vince === ospite ? casa : null;

    if (vince && perde && scarto <= 1) {
      out.push({
        codice: 'vittoria_misura', fixtureId: s.fixtureId, soggetto: vince.nome, peso: 70,
        dati: { vincitore: vince.nome, perdente: perde.nome, scarto, fpVincitore: vince.fantapunti, fpPerdente: perde.fantapunti },
        frase: `${vince.nome} la porta a casa per ${scarto} fantapunto${scarto === 1 ? '' : 'i'} su ${perde.nome}: ${vince.fantapunti} contro ${perde.fantapunti}.`,
      });
    }

    for (const t of [casa, ospite]) {
      const mancante = prossimaSogliaGol(t.fantapunti);
      if (mancante > 0 && mancante <= 1) {
        out.push({
          codice: 'gol_negato', fixtureId: s.fixtureId, soggetto: t.nome, peso: 85,
          dati: { squadra: t.nome, fantapunti: t.fantapunti, mancava: mancante },
          frase: `${t.nome} si ferma a ${t.fantapunti}: ${mancante} fantapunt${mancante === 1 ? 'o' : 'i'} e sarebbe arrivato un altro gol.`,
        });
      }
    }

    const scartoGol = Math.abs(casa.gol - ospite.gol);
    if (vince && perde && scartoGol >= 3) {
      out.push({
        codice: 'goleada', fixtureId: s.fixtureId, soggetto: vince.nome, peso: 55,
        dati: { vincitore: vince.nome, perdente: perde.nome, risultato: `${casa.gol}-${ospite.gol}` },
        frase: `${casa.gol}-${ospite.gol}: ${perde.nome} non è mai stato in partita.`,
      });
    }

    if (!vince && scarto <= 0.5) {
      out.push({
        codice: 'pareggio_fotocopia', fixtureId: s.fixtureId, soggetto: casa.nome, peso: 60,
        dati: { casa: casa.nome, ospite: ospite.nome, fpCasa: casa.fantapunti, fpOspite: ospite.fantapunti },
        frase: `${casa.fantapunti} contro ${ospite.fantapunti}: più pari di così si muore.`,
      });
    }

    for (const t of [casa, ospite]) {
      const suo = t === casa ? ospite : casa;
      if (t.fantapunti === massimo && t.gol < suo.gol) {
        out.push({
          codice: 'sconfitta_col_record', fixtureId: s.fixtureId, soggetto: t.nome, peso: 90,
          dati: { squadra: t.nome, fantapunti: t.fantapunti, avversario: suo.nome },
          frase: `${t.nome} fa ${t.fantapunti}, il punteggio più alto di giornata, e perde lo stesso contro ${suo.nome}.`,
        });
      }
    }
  }
  return out;
}

/** Quanto manca al prossimo gol: sotto 66 il primo, poi uno ogni 6. */
export function prossimaSogliaGol(fp: number): number {
  if (fp < SOGLIA_GOL) return arrotonda(SOGLIA_GOL - fp);
  const oltre = (fp - SOGLIA_GOL) % PASSO_GOL;
  return arrotonda(PASSO_GOL - oltre);
}

// ----------------------------------------------------------------- strisce

function sulleStrisce(ctx: ContestoGiornata): Spunto[] {
  const out: Spunto[] = [];

  for (const s of ctx.sfide) {
    if (s.competizione !== 'campionato') continue;
    for (const t of [s.casa, s.ospite]) {
      const avv = t === s.casa ? s.ospite : s.casa;
      const suoi = storiaDi(ctx, t.teamId);
      const oggi: PrecedenteSquadra = {
        fanta: ctx.fanta, teamId: t.teamId, avversarioId: avv.teamId, avversario: avv.nome,
        golFatti: t.gol, golSubiti: avv.gol, fantapunti: t.fantapunti,
      };
      const serie = [...suoi, oggi];

      // stesso identico risultato, N volte di fila
      const punteggio = (p: PrecedenteSquadra) => `${p.golFatti}-${p.golSubiti}`;
      const nRis = quantiInCoda(serie, (p) => punteggio(p) === punteggio(oggi));
      if (nRis >= 3) {
        out.push({
          codice: 'striscia_risultato', fixtureId: s.fixtureId, soggetto: t.nome, peso: 30 * nRis,
          dati: { squadra: t.nome, risultato: punteggio(oggi), quante: nRis },
          frase: `${nRis} volte di fila ${punteggio(oggi)} per ${t.nome}: a questo punto è una firma.`,
        });
      }

      // stesso esito, N volte di fila
      const esito = (p: PrecedenteSquadra) => (p.golFatti > p.golSubiti ? 'V' : p.golFatti < p.golSubiti ? 'S' : 'N');
      const e = esito(oggi);
      const nEsito = quantiInCoda(serie, (p) => esito(p) === e);
      if (nEsito >= 3) {
        const parola = e === 'V' ? 'vittorie' : e === 'S' ? 'sconfitte' : 'pareggi';
        out.push({
          codice: 'striscia_esito', fixtureId: s.fixtureId, soggetto: t.nome, peso: 20 * nEsito,
          dati: { squadra: t.nome, esito: e, quante: nEsito },
          frase: `${nEsito} ${parola} consecutive per ${t.nome}.`,
        });
      }

      // non segna da N giornate
      const nDigiuno = quantiInCoda(serie, (p) => p.golFatti === 0);
      if (nDigiuno >= 2) {
        out.push({
          codice: 'digiuno', fixtureId: s.fixtureId, soggetto: t.nome, peso: 25 * nDigiuno,
          dati: { squadra: t.nome, quante: nDigiuno },
          frase: `${t.nome} non segna da ${nDigiuno} giornate.`,
        });
      }

      // la nemesi: perde sempre contro quello
      if (t.gol < avv.gol) {
        const controDiLui = serie.filter((p) => p.avversarioId === avv.teamId);
        const persi = controDiLui.filter((p) => p.golFatti < p.golSubiti).length;
        if (controDiLui.length >= 3 && persi === controDiLui.length) {
          out.push({
            codice: 'nemesi', fixtureId: s.fixtureId, soggetto: t.nome, peso: 30 * persi,
            dati: { squadra: t.nome, avversario: avv.nome, quante: persi },
            frase: `${persi} incroci con ${avv.nome}, ${persi} sconfitte: c'è poco da aggiungere.`,
          });
        }
      }
    }
  }
  return out;
}

function storiaDi(ctx: ContestoGiornata, teamId: string): PrecedenteSquadra[] {
  return ctx.precedenti.filter((p) => p.teamId === teamId).sort((a, b) => a.fanta - b.fanta);
}

/** Quanti elementi in coda alla serie soddisfano il predicato, senza interruzioni. */
function quantiInCoda<T>(serie: T[], ok: (x: T) => boolean): number {
  let n = 0;
  for (let i = serie.length - 1; i >= 0; i--) { if (!ok(serie[i])) break; n++; }
  return n;
}

// ----------------------------------------------------------------- singoli

function suiSingoli(ctx: ContestoGiornata): Spunto[] {
  const out: Spunto[] = [];
  const soglia = ctx.sogliaBigMoney ?? SOGLIA_BIG_MONEY;

  interface Voce { g: GiocatoreInCampo; squadra: SquadraInSfida; fixtureId: string }
  const inCampo: Voce[] = [];
  for (const s of ctx.sfide) {
    for (const t of [s.casa, s.ospite]) {
      for (const g of t.giocatori) if (g.counted && g.fantavoto != null) {
        inCampo.push({ g, squadra: t, fixtureId: s.fixtureId });
      }
    }
  }
  if (!inCampo.length) return out;

  const migliore = inCampo.reduce((a, b) => (b.g.fantavoto! > a.g.fantavoto! ? b : a));
  const peggiore = inCampo.reduce((a, b) => (b.g.fantavoto! < a.g.fantavoto! ? b : a));

  out.push({
    codice: 'uomo_giornata', fixtureId: migliore.fixtureId, soggetto: migliore.g.nome, peso: 65,
    dati: { giocatore: migliore.g.nome, squadra: migliore.squadra.nome, fantavoto: migliore.g.fantavoto! },
    frase: `${migliore.g.nome} è l'uomo della giornata con ${migliore.g.fantavoto}, e se lo gode ${migliore.squadra.nome}.`,
  });

  out.push({
    codice: 'palla_di_piombo', fixtureId: peggiore.fixtureId, soggetto: peggiore.g.nome, peso: 75,
    dati: { giocatore: peggiore.g.nome, squadra: peggiore.squadra.nome, fantavoto: peggiore.g.fantavoto! },
    frase: `Il peggiore di tutti è ${peggiore.g.nome}: ${peggiore.g.fantavoto}, con i saluti di ${peggiore.squadra.nome}.`,
  });

  for (const { g, squadra, fixtureId } of inCampo) {
    if (g.prezzoAsta != null && g.prezzoAsta >= soglia && g.fantavoto! < 5) {
      out.push({
        codice: 'traditore', fixtureId, soggetto: g.nome, peso: 80,
        dati: { giocatore: g.nome, squadra: squadra.nome, prezzo: g.prezzoAsta, fantavoto: g.fantavoto! },
        frase: `${g.nome} era costato ${g.prezzoAsta} crediti e ha restituito ${g.fantavoto}.`,
      });
    }
    if (g.isCaptain && g.fantavoto! < 5) {
      out.push({
        codice: 'capitano_tradito', fixtureId, soggetto: squadra.nome, peso: 75,
        dati: { giocatore: g.nome, squadra: squadra.nome, fantavoto: g.fantavoto! },
        frase: `La fascia a ${g.nome}, che ha risposto con ${g.fantavoto}: un raddoppio che nessuno voleva.`,
      });
    }
    const subiti = numeroBonus(g.bonus, 'golSubiti');
    if (g.ruolo === 'P' && subiti >= 3) {
      out.push({
        codice: 'portiere_crivellato', fixtureId, soggetto: g.nome, peso: 60,
        dati: { giocatore: g.nome, squadra: squadra.nome, golSubiti: subiti, fantavoto: g.fantavoto! },
        frase: `${subiti} gol presi da ${g.nome}: serata da dimenticare fra i pali di ${squadra.nome}.`,
      });
    }
    if (g.daAstaFlash && g.fantavoto! >= 8) {
      out.push({
        codice: 'vendetta_svincolato', fixtureId, soggetto: g.nome, peso: 90,
        dati: { giocatore: g.nome, squadra: squadra.nome, fantavoto: g.fantavoto! },
        frase: `${g.nome}, preso a un'asta flash, ne mette ${g.fantavoto} nel piatto di ${squadra.nome}.`,
      });
    }
  }

  // chi ha giocato in dieci — sta prima, e in un giro suo: quando la panchina
  // è vuota il controllo successivo esce subito, e ci si perdeva proprio il
  // caso in cui la squadra era rimasta in inferiorità
  for (const s of ctx.sfide) {
    for (const t of [s.casa, s.ospite]) {
      const buchi = t.giocatori.filter((g) => g.titolare && !g.counted).length
        - t.giocatori.filter((g) => g.entered).length;
      if (buchi > 0) {
        out.push({
          codice: 'in_dieci', fixtureId: s.fixtureId, soggetto: t.nome, peso: 80,
          dati: { squadra: t.nome, quanti: buchi, inCampo: 11 - buchi },
          frase: `${t.nome} ha giocato in ${11 - buchi}: in panchina non c'era un pari ruolo che avesse preso voto.`,
        });
      }
    }
  }

  // la panchina che avrebbe fatto meglio
  for (const s of ctx.sfide) {
    for (const t of [s.casa, s.ospite]) {
      const titolariInCampo = t.giocatori.filter((g) => g.titolare && g.counted && g.fantavoto != null);
      const inutilizzati = t.giocatori.filter((g) => !g.titolare && !g.entered && g.fantavoto != null);
      if (!titolariInCampo.length || !inutilizzati.length) continue;

      const peggior = titolariInCampo.reduce((a, b) => (b.fantavoto! < a.fantavoto! ? b : a));
      const miglior = inutilizzati.reduce((a, b) => (b.fantavoto! > a.fantavoto! ? b : a));
      const delta = arrotonda(miglior.fantavoto! - peggior.fantavoto!);
      if (delta >= 3) {
        out.push({
          codice: 'panchina_beffarda', fixtureId: s.fixtureId, soggetto: t.nome, peso: 85,
          dati: {
            squadra: t.nome, panchinaro: miglior.nome, fantavotoPanchina: miglior.fantavoto!,
            titolare: peggior.nome, fantavotoTitolare: peggior.fantavoto!, differenza: delta,
          },
          frase: `${miglior.nome} guardava da fuori con ${miglior.fantavoto}, mentre ${peggior.nome} in campo ne faceva ${peggior.fantavoto}: ${delta} punti lasciati in panchina.`,
        });
      }
    }
  }

  return out;
}

function numeroBonus(bonus: Bonus, chiave: string): number {
  const v = bonus?.[chiave];
  return typeof v === 'number' ? v : 0;
}

// -------------------------------------------------------------- classifica

function sullaClassifica(ctx: ContestoGiornata): Spunto[] {
  const out: Spunto[] = [];
  const prima = ctx.classificaPrima, dopo = ctx.classificaDopo;
  if (!dopo.length) return out;

  const capoPrima = prima.find((r) => r.posizione === 1);
  const capoDopo = dopo.find((r) => r.posizione === 1);
  if (capoPrima && capoDopo && capoPrima.teamId !== capoDopo.teamId) {
    out.push({
      codice: 'sorpasso', fixtureId: null, soggetto: capoDopo.nome, peso: 85,
      dati: { nuovo: capoDopo.nome, vecchio: capoPrima.nome, punti: capoDopo.punti },
      frase: `${capoDopo.nome} scavalca ${capoPrima.nome} e si prende la vetta con ${capoDopo.punti} punti.`,
    });
  }

  const ultimoPrima = prima[prima.length - 1];
  const ultimoDopo = dopo[dopo.length - 1];
  if (ultimoDopo && ultimoPrima && ultimoPrima.teamId === ultimoDopo.teamId) {
    out.push({
      codice: 'fanalino', fixtureId: null, soggetto: ultimoDopo.nome, peso: 50,
      dati: { squadra: ultimoDopo.nome, punti: ultimoDopo.punti },
      frase: `In fondo non cambia niente: ${ultimoDopo.nome} resta ultimo con ${ultimoDopo.punti} punti.`,
    });
  }

  if (capoDopo && dopo.length > 1) {
    const secondo = dopo.find((r) => r.posizione === 2);
    const distacco = secondo ? capoDopo.punti - secondo.punti : 0;
    if (distacco >= 6) {
      out.push({
        codice: 'fuga', fixtureId: null, soggetto: capoDopo.nome, peso: 55,
        dati: { squadra: capoDopo.nome, distacco, secondo: secondo?.nome ?? '' },
        frase: `${capoDopo.nome} scappa: ${distacco} punti su ${secondo?.nome}.`,
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------- tipster

function sulTipster(ctx: ContestoGiornata): Spunto[] {
  const out: Spunto[] = [];
  for (const t of ctx.tipster) {
    if (t.esatti > 0) {
      out.push({
        codice: 'tipster_profeta', fixtureId: null, soggetto: t.nome, peso: 90,
        dati: { squadra: t.nome, esatti: t.esatti, punti: t.punti },
        frase: `${t.nome} ha azzeccato ${t.esatti} risultat${t.esatti === 1 ? 'o' : 'i'} esatt${t.esatti === 1 ? 'o' : 'i'}, e la schedina gli frutta ${t.punti} punti.`,
      });
    }
    if (t.giocate > 0 && t.azzeccate === 0) {
      out.push({
        codice: 'tipster_zero', fixtureId: null, soggetto: t.nome, peso: 70,
        dati: { squadra: t.nome, giocate: t.giocate },
        frase: `${t.nome} ha giocato ${t.giocate} volte e non ne ha presa una.`,
      });
    }
    if (t.controSeStesso?.indovinato && t.controSeStesso.haPerso) {
      out.push({
        codice: 'autogol_tipster', fixtureId: null, soggetto: t.nome, peso: 95,
        dati: { squadra: t.nome, punti: t.punti },
        frase: `${t.nome} aveva scommesso contro sé stesso e ci ha visto giusto: ha perso la partita e vinto la giocata.`,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------ comportamento

const CINQUE_MINUTI = 5 * 60 * 1000;

function sulComportamento(ctx: ContestoGiornata): Spunto[] {
  const out: Spunto[] = [];
  for (const s of ctx.sfide) {
    for (const t of [s.casa, s.ospite]) {
      if (!t.inviataIl) {
        out.push({
          codice: 'formazione_dimenticata', fixtureId: s.fixtureId, soggetto: t.nome, peso: 80,
          dati: { squadra: t.nome },
          frase: `${t.nome} la formazione non l'ha proprio mandata.`,
        });
        continue;
      }
      if (!t.chiusuraIl) continue;
      const margine = new Date(t.chiusuraIl).getTime() - new Date(t.inviataIl).getTime();
      if (margine >= 0 && margine <= CINQUE_MINUTI) {
        const minuti = Math.max(1, Math.round(margine / 60000));
        out.push({
          codice: 'formazione_last_minute', fixtureId: s.fixtureId, soggetto: t.nome, peso: 45,
          dati: { squadra: t.nome, minuti },
          frase: `${t.nome} ha mandato la formazione ${minuti} minut${minuti === 1 ? 'o' : 'i'} prima della chiusura.`,
        });
      }
    }
  }
  return out;
}

// =====================================================================
// Utilità
// =====================================================================

function arrotonda(n: number): number { return Math.round(n * 100) / 100; }

/** Gli spunti di una sfida, dal più pesante. */
export function spuntiDiSfida(spunti: Spunto[], fixtureId: string): Spunto[] {
  return spunti.filter((s) => s.fixtureId === fixtureId);
}

/** Gli spunti che non appartengono a una sfida sola. */
export function spuntiDiGiornata(spunti: Spunto[]): Spunto[] {
  return spunti.filter((s) => s.fixtureId === null);
}

/**
 * Tutti i numeri che gli spunti autorizzano a scrivere.
 *
 * Serve a `verifica.ts`: se nel pezzo compare un numero che non è qui dentro
 * né nel tabellone, il modello se l'è inventato e si rigenera.
 */
export function numeriLeciti(ctx: ContestoGiornata, spunti: Spunto[]): Set<number> {
  const n = new Set<number>();
  const aggiungi = (x: unknown) => { if (typeof x === 'number' && Number.isFinite(x)) n.add(x); };

  for (const s of ctx.sfide) {
    for (const t of [s.casa, s.ospite]) {
      aggiungi(t.gol); aggiungi(t.fantapunti); aggiungi(t.modificatore); aggiungi(t.bonusCapitano);
      for (const g of t.giocatori) { aggiungi(g.voto); aggiungi(g.fantavoto); aggiungi(g.prezzoAsta); }
    }
  }
  for (const r of [...ctx.classificaPrima, ...ctx.classificaDopo]) { aggiungi(r.punti); aggiungi(r.posizione); }
  for (const t of ctx.tipster) { aggiungi(t.punti); aggiungi(t.giocate); aggiungi(t.azzeccate); aggiungi(t.esatti); }
  for (const s of spunti) for (const v of Object.values(s.dati)) aggiungi(v);
  aggiungi(ctx.fanta); aggiungi(ctx.serieA);
  return n;
}
