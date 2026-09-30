import 'server-only';

/**
 * La Gazzetta — dalla sala d'asta chiusa alla pagina del mercato fatto.
 *
 * È il seguito di `mercatoServer`: là si leggevano le chiamate e non poteva
 * uscire niente di decisivo, qui si legge il tabellone a cose fatte e **tutto
 * è pubblico** — chi ha vinto, a quanto, contro chi. I budget restano
 * comunque dentro: a sala chiusa non deciderebbero più niente, ma il prezzo
 * pagato è la notizia e il tetto che uno si era dato non lo è.
 *
 * Gli scambi sono l'altra metà della pagina. Quelli «dall'ultima asta» si
 * scelgono da soli — è la finestra di cui il gruppo sta parlando — ma
 * l'admin può aggiungerne o toglierne prima di mandare in generazione,
 * perché uno scambio fatto a ridosso dell'asta precedente può benissimo
 * essere rimasto fuori dal pezzo di allora.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { scegliModello } from '@/lib/redazione/modello';
import { cognomeDaListone, scegliFoto } from './news';
import { indiceFoto } from './newsServer';
import { disposizioneFoto, type DatiPrima, type FotoPrima } from './prima';
import { quandoApreLaSala } from './mercato';
import {
  astaDiApertura, chiusuraDiRipiego, costruisciPromptChiusura, daJsonChiusura,
  montaChiusura, verificaChiusura,
  type AstaConclusa, type EsitoChiusura, type RichiestaChiusura,
  type Ruolo, type ScambioFatto, type TestiChiusura,
} from './mercatoChiuso';

const MASSIMI_TENTATIVI = 2;

// =====================================================================
// Gli scambi
// =====================================================================

/** Uno scambio come lo vede l'admin nell'elenco da spuntare. */
export interface ScambioInElenco extends ScambioFatto {
  /** quando è stato applicato, in ISO */
  quando: string;
  /** vero se cade nella finestra dall'asta precedente a oggi */
  dallUltimaAsta: boolean;
}

/**
 * Gli scambi della lega, col contrassegno di quelli che ricadono in questa
 * finestra di mercato.
 *
 * La finestra parte dall'asta **precedente** a questa: è il senso di
 * «rispetto all'ultima asta». Se questa è la prima sessione non c'è un
 * prima, e allora valgono tutti.
 *
 * Contano solo gli scambi applicati e non annullati: uno registrato e mai
 * applicato non è successo, e uno disfatto è successo e poi no — raccontarli
 * vorrebbe dire scrivere una rosa che non esiste.
 */
export async function scambiPerLaGazzetta(sessionId: string): Promise<ScambioInElenco[]> {
  const db = supabaseAdmin();

  const { data: sessione } = await db.from('auction_sessions')
    .select('id, league_id, number, auction_at').eq('id', sessionId).maybeSingle();
  if (!sessione) throw new Error('questa sessione non esiste');
  const leagueId = sessione.league_id as string;

  const { data: precedenti } = await db.from('auction_sessions')
    .select('auction_at, number').eq('league_id', leagueId)
    .lt('number', sessione.number as number)
    .order('number', { ascending: false }).limit(1);
  const inizio = precedenti?.[0]?.auction_at as string | undefined;

  const [{ data: scambi }, { data: squadre }] = await Promise.all([
    db.from('trades')
      .select('id, from_team_id, to_team_id, settlement, settlement_payer, applied_at')
      .eq('league_id', leagueId)
      .not('applied_at', 'is', null).is('reverted_at', null)
      .order('applied_at', { ascending: false }),
    db.from('teams').select('id, name').eq('league_id', leagueId),
  ]);
  if (!scambi?.length) return [];

  const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));
  const { data: pezzi } = await db.from('trade_items')
    .select('trade_id, player_id, from_team_id, players(name)')
    .in('trade_id', scambi.map((s) => s.id as string));

  type Pezzo = { trade_id: string; from_team_id: string; players: { name: string } | null };
  const righe = (pezzi ?? []) as unknown as Pezzo[];

  return scambi.map((s) => {
    const suoi = righe.filter((p) => p.trade_id === s.id);
    const quando = s.applied_at as string;
    return {
      id: s.id as string,
      quando,
      squadraA: nomeDi.get(s.from_team_id as string) ?? '?',
      squadraB: nomeDi.get(s.to_team_id as string) ?? '?',
      // chi parte dalla A va alla B, e viceversa
      versoB: suoi.filter((p) => p.from_team_id === s.from_team_id).map((p) => p.players?.name ?? '?'),
      versoA: suoi.filter((p) => p.from_team_id === s.to_team_id).map((p) => p.players?.name ?? '?'),
      conguaglio: Number(s.settlement ?? 0),
      pagante: s.settlement_payer === 'from' ? 'A' : s.settlement_payer === 'to' ? 'B' : null,
      dallUltimaAsta: !inizio || quando > inizio,
    };
  });
}

// =====================================================================
// Il materiale
// =====================================================================

export interface MaterialeChiusura {
  leagueId: string;
  sessionId: string;
  richiesta: RichiestaChiusura;
  foto: FotoPrima | null;
}

async function fotoDelPiuPregiato(a: AstaConclusa | null): Promise<FotoPrima | null> {
  if (!a) return null;
  const indice = await indiceFoto();
  const esito = scegliFoto(indice, { cognome: cognomeDaListone(a.giocatore), club: a.club });
  if (!esito.trovata) return null;

  const riga = indice.find((f) => f.immagine === esito.immagine);
  if (!riga) return null;

  return {
    src: esito.immagine,
    larghezza: riga.larghezza,
    altezza: riga.altezza,
    provenienza: esito.perche === 'giocatore'
      ? esito.articolo.titolo
      : `(foto della squadra) ${esito.articolo.titolo}`,
    fuoco: 35,
  };
}

/**
 * @param scambiScelti gli id spuntati dall'admin. Assente vuol dire «quelli
 *   dall'ultima asta», che è la proposta che la pagina fa da sola.
 */
export async function materialeChiusura(
  sessionId: string, scambiScelti?: string[],
): Promise<MaterialeChiusura> {
  const db = supabaseAdmin();

  const { data: sessione } = await db.from('auction_sessions')
    .select('id, league_id, number, auction_at, status').eq('id', sessionId).maybeSingle();
  if (!sessione) throw new Error('questa sessione non esiste');
  const leagueId = sessione.league_id as string;

  const [{ data: lotti }, { data: squadre }, { data: lega }] = await Promise.all([
    db.from('lots')
      .select('id, player_id, caller_team_id, winner_team_id, final_price, order_index, status')
      .eq('session_id', sessionId).neq('status', 'cancelled').order('order_index'),
    db.from('teams').select('id, name').eq('league_id', leagueId),
    db.from('leagues').select('redazione_tono, redazione_parole_vietate').eq('id', leagueId).single(),
  ]);

  const assegnati = (lotti ?? []).filter((l) => l.winner_team_id && l.final_price != null);
  if (!assegnati.length) {
    throw new Error('questa sessione non ha ancora nessun lotto assegnato: la pagina del mercato chiuso esce a sala chiusa');
  }

  const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));
  const [{ data: iscritti }, { data: giocatori }] = await Promise.all([
    db.from('lot_participants')
      .select('lot_id, team_id, withdrawn, status')
      .in('lot_id', assegnati.map((l) => l.id as string)).order('created_at'),
    db.from('players').select('id, name, role, club, quotation').eq('league_id', leagueId),
  ]);

  const giocatoreDi = new Map((giocatori ?? []).map((p) => [p.id as string, {
    nome: p.name as string, ruolo: p.role as Ruolo, club: p.club as string,
    quotazione: Number(p.quotation ?? 0),
  }]));
  const vivi = (iscritti ?? []).filter((x) => !x.withdrawn && x.status !== 'cancelled');

  const aste: AstaConclusa[] = [];
  for (const l of assegnati) {
    const g = giocatoreDi.get(l.player_id as string);
    if (!g) continue;
    const suoi = vivi.filter((x) => x.lot_id === l.id);
    const vincitore = nomeDi.get(l.winner_team_id as string) ?? '?';
    aste.push({
      lottoId: l.id as string,
      giocatore: g.nome, ruolo: g.ruolo, club: g.club, quotazione: g.quotazione,
      vincitore, prezzo: Number(l.final_price),
      chiamante: nomeDi.get(l.caller_team_id as string) ?? '?',
      battute: suoi
        .map((x) => nomeDi.get(x.team_id as string) ?? '?')
        .filter((n) => n !== vincitore),
    });
  }
  if (!aste.length) throw new Error('nessun lotto assegnato ha un giocatore riconoscibile');

  const elenco = await scambiPerLaGazzetta(sessionId);
  const scelti = scambiScelti
    ? elenco.filter((s) => scambiScelti.includes(s.id))
    : elenco.filter((s) => s.dallUltimaAsta);

  /*
   * I nomi che non devono comparire: tutti i giocatori della lega che non
   * sono né in un'asta né in uno scambio di questa pagina. Un pezzo di
   * mercato inventa volentieri un nome a caso, e senza questa lista nessuno
   * se ne accorgerebbe.
   */
  const inPagina = new Set([
    ...aste.map((a) => a.giocatore),
    ...scelti.flatMap((s) => [...s.versoA, ...s.versoB]),
  ]);
  const nomiVietati = [...giocatoreDi.values()]
    .map((g) => g.nome).filter((n) => !inPagina.has(n));

  const apertura = astaDiApertura(aste) ?? aste[0].lottoId;
  const foto = await fotoDelPiuPregiato(aste.find((a) => a.lottoId === apertura) ?? null);

  return {
    leagueId, sessionId, foto,
    richiesta: {
      tono: Number(lega?.redazione_tono ?? 4),
      sessione: Number(sessione.number),
      quando: quandoApreLaSala(sessione.auction_at as string),
      disposizione: disposizioneFoto(foto),
      aste, apertura,
      scambi: scelti.map(({ dallUltimaAsta: _d, quando: _q, ...s }) => s),
      paroleVietate: (lega?.redazione_parole_vietate as string[] | undefined) ?? [],
      nomiVietati: [...new Set(nomiVietati)],
    },
  };
}

// =====================================================================
// La generazione
// =====================================================================

export interface EsitoChiusuraGazzetta {
  gazzettaId: string;
  versione: number;
  provider: 'gemini' | 'template';
  modello: string | null;
  tentativi: number;
  verifica: EsitoChiusura;
  dati: DatiPrima;
}

export async function generaGazzettaChiusura(
  sessionId: string, opzioni: { tono?: number; scambi?: string[] } = {},
): Promise<EsitoChiusuraGazzetta> {
  const db = supabaseAdmin();
  const materiale = await materialeChiusura(sessionId, opzioni.scambi);
  const r = materiale.richiesta;
  if (opzioni.tono != null) r.tono = Math.min(5, Math.max(1, opzioni.tono));

  const modello = scegliModello();
  let testi: TestiChiusura | null = null;
  let esito: EsitoChiusura | null = null;
  let usato: 'gemini' | 'template' = modello ? 'gemini' : 'template';
  let nomeModello = modello?.modello ?? null;
  let tentativi = 0;

  if (modello) {
    for (let i = 0; i < MASSIMI_TENTATIVI; i++) {
      tentativi++;
      try {
        const candidato = daJsonChiusura(await modello.chiedi(costruisciPromptChiusura(r)));
        const v = verificaChiusura(candidato, r);
        testi = candidato; esito = v;
        if (v.ok) break;
        r.correzioni = v.problemi;
      } catch (e) {
        esito = { ok: false, problemi: [`il modello non ha risposto: ${(e as Error).message}`], inventati: [] };
        testi = null;
      }
    }
  }

  if (!testi || !esito?.ok) {
    const ripiego = chiusuraDiRipiego(r);
    const v = verificaChiusura(ripiego, r);
    const prima = esito?.problemi ?? [];
    testi = ripiego;
    usato = 'template'; nomeModello = null;
    esito = { ...v, problemi: [...prima, ...v.problemi] };
  }

  const dati = montaChiusura(testi, { richiesta: r, foto: materiale.foto });

  const { data, error } = await db.from('gazzette').insert({
    league_id: materiale.leagueId, matchday_id: null,
    tipo: 'mercato_chiuso', dati, verifica: { ...esito, tentativi },
    provider: usato, model: nomeModello,
  }).select('id, versione').single();
  if (error) throw new Error(`non sono riuscito a salvare la gazzetta: ${error.message}`);

  return {
    gazzettaId: data.id as string, versione: data.versione as number,
    provider: usato, modello: nomeModello, tentativi, verifica: esito, dati,
  };
}
