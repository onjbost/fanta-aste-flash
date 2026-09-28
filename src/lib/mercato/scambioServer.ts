import 'server-only';

/**
 * Fantacalciomercato — dal database al messaggio pronto.
 *
 * Stesso ciclo dell'anteprima: prova · se la verifica boccia, riprova
 * dicendo al modello cosa non andava · se boccia ancora, si manda la
 * versione a template. Con una differenza che conta: qui il ripiego perde
 * il giudizio, che era l'unica cosa per cui esisteva questo messaggio.
 * Chi lo riceve dev'essere avvisato, non lasciato a credere che vada bene.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { scegliModello } from '@/lib/redazione/modello';
import type { Ruolo } from '@/lib/redazione/tabellino';
import {
  costruisciPromptScambio, daJsonScambio, montaScambio, scambioDiRipiego, testoImpegnato,
  validaScambio, verificaScambio,
  type GiocatoreScambiato, type LatoScambio, type PezzoScambio, type RichiestaScambio,
} from './scambio';

const MASSIMI_TENTATIVI = 2;

export interface SceltaScambio {
  fromTeamId: string;
  toTeamId: string;
  fromPlayerIds: string[];
  toPlayerIds: string[];
  conguaglio: number;
  chiPaga: 'from' | 'to';
  note: string;
}

/** Presenze e fantamedia di ogni giocatore, dalle giornate già importate. */
async function rendimenti(leagueId: string): Promise<Map<string, {
  presenze: number; fantamedia: number | null; volteTitolare: number;
}>> {
  const db = supabaseAdmin();
  // `lineup_entries` ha una colonna `league_id` propria (0011_redazione.sql):
  // niente bisogno di passare per `fixtures` per sapere di che lega è una riga.
  const { data } = await db.from('lineup_entries')
    .select('player_id, fantavoto, starter, counted')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null);

  const per = new Map<string, { somma: number; n: number; titolare: number }>();
  for (const r of data ?? []) {
    const id = r.player_id as string;
    const v = per.get(id) ?? { somma: 0, n: 0, titolare: 0 };
    if (r.counted && r.fantavoto != null) { v.somma += Number(r.fantavoto); v.n += 1; }
    if (r.starter) v.titolare += 1;
    per.set(id, v);
  }

  return new Map([...per].map(([id, v]) => [id, {
    presenze: v.n,
    fantamedia: v.n ? v.somma / v.n : null,
    volteTitolare: v.titolare,
  }]));
}

export async function rosePerScambio(leagueId: string): Promise<LatoScambio[]> {
  const db = supabaseAdmin();
  const [{ data: rose }, { data: crediti }, { data: classifica }, resa] = await Promise.all([
    db.from('v_roster').select('team_id, player_id, name, role, club, price, quotation')
      .eq('league_id', leagueId),
    db.from('v_team_credits').select('team_id, name, credits').eq('league_id', leagueId),
    db.from('standings_snapshots').select('team_name, posizione, punti, matchdays!inner(serie_a)')
      .eq('league_id', leagueId).eq('competition', 'campionato').eq('group_name', ''),
    rendimenti(leagueId),
  ]);

  // la fotografia più recente, se c'è
  const ultima = (classifica ?? []).reduce<number>(
    (a, r) => Math.max(a, Number((r.matchdays as unknown as { serie_a: number }).serie_a)), 0);
  const posizioni = new Map((classifica ?? [])
    .filter((r) => Number((r.matchdays as unknown as { serie_a: number }).serie_a) === ultima)
    .map((r) => [r.team_name as string, { posizione: Number(r.posizione), punti: Number(r.punti) }]));

  return (crediti ?? []).map((t) => {
    const mie = (rose ?? []).filter((p) => p.team_id === t.team_id);
    const rosaPerRuolo = { P: 0, D: 0, C: 0, A: 0 } as Record<Ruolo, number>;
    for (const p of mie) rosaPerRuolo[p.role as Ruolo] += 1;
    const cl = posizioni.get(t.name as string);

    return {
      teamId: t.team_id as string,
      nome: t.name as string,
      posizione: cl?.posizione ?? null,
      punti: cl?.punti ?? null,
      crediti: Number(t.credits),
      rosaPerRuolo,
      cede: mie.map((p): GiocatoreScambiato => {
        const r = resa.get(p.player_id as string);
        return {
          playerId: p.player_id as string,
          nome: p.name as string,
          ruolo: p.role as Ruolo,
          club: p.club as string,
          prezzo: Number(p.price),
          quotazione: Number(p.quotation),
          presenze: r?.presenze ?? 0,
          fantamedia: r?.fantamedia ?? null,
          volteTitolare: r?.volteTitolare ?? 0,
        };
      }),
    };
  });
}

/**
 * Chi non si può scambiare: impegnato in un'asta aperta o con svincolo pendente.
 *
 * **Si guarda `lot_participants.release_player_id`, non `lots.player_id`, e la
 * differenza è tutto.** `lots.player_id` è il giocatore *chiamato*, che per
 * costruzione è uno svincolato: `validateCall` in `rules.ts` rifiuta la
 * chiamata se il bersaglio non è free agent. Non ha un contratto aperto, non
 * è nella rosa di nessuno e quindi non compare mai nel selettore dello
 * scambio — cercarlo lì è un ramo inerte, che non ha mai bloccato niente
 * (verificato sul database vero: tutti i `lots.player_id` sono senza
 * contratto aperto).
 *
 * Chi è davvero impegnato è lo **svincolando messo sul piatto** per aderire
 * al lotto: quello sì è in rosa, e se lo scambio lo spostasse mentre l'asta
 * è aperta, il vincitore del lotto si troverebbe con un contratto su una
 * squadra che nel frattempo l'ha ceduto — i due registri si
 * contraddirebbero. È l'impegno che la spec chiede di rifiutare.
 *
 * Gli stati, e perché questi:
 * - del lotto, solo quelli che sono davvero un impegno aperto. `cancelled`
 *   (settlement.ts: la chiamata viene annullata, o resta senza contendenti
 *   quando si apre la sala) e `assigned` (settlement.ts, `applyMovements`:
 *   il contratto è già stato trasferito al vincitore) non bloccano niente:
 *   nel primo caso il lotto non esiste più, nel secondo lo svincolando è già
 *   stato liberato. Tenerli fra i bloccati rifiuterebbe scambi legittimi
 *   parlando di un'asta che per quel giocatore non c'è più;
 * - della sessione, tutto tranne `closed`, per la stessa ragione;
 * - del partecipante, tutto tranne `cancelled` (0001_schema.sql:
 *   `confirmed` · `pending_approval` · `cancelled`). Una partecipazione
 *   annullata libera lo svincolando — lo dice l'indice unico
 *   `lot_participants_one_release_per_session`, che la esclude.
 */
export async function giocatoriBloccati(leagueId: string): Promise<Set<string>> {
  const db = supabaseAdmin();
  const [{ data: lotti }, { data: richieste }] = await Promise.all([
    // Prima i lotti ancora aperti, con la stessa forma di query che c'era qui
    // — `lots` più l'embed della sessione: di questa sappiamo che funziona,
    // cambia solo cosa se ne fa (gli id dei lotti, non i giocatori chiamati).
    db.from('lots').select('id, auction_sessions!inner(league_id, status)')
      .eq('auction_sessions.league_id', leagueId)
      .in('status', ['called', 'uncontested', 'live'])
      .not('auction_sessions.status', 'eq', 'closed'),
    db.from('free_release_requests').select('player_id')
      .eq('league_id', leagueId).eq('status', 'pending'),
  ]);

  // Poi gli svincolandi messi sul piatto su quei lotti. Due interrogazioni in
  // fila e non un embed annidato su `lot_participants`: quando una query
  // sbaglia, qui `data` torna null e l'insieme resta vuoto — cioè il controllo
  // smette di bloccare senza dire niente, che è esattamente il guasto che
  // questa correzione ripara. Meglio due passi di cui si conosce l'esito che
  // uno elegante il cui fallimento è muto.
  const aperti = (lotti ?? []).map((l) => l.id as string);
  const { data: impegnati } = aperti.length
    ? await db.from('lot_participants').select('release_player_id')
      .in('lot_id', aperti)
      .neq('status', 'cancelled')
    : { data: [] as { release_player_id: string }[] };

  return new Set([
    ...(impegnati ?? []).map((l) => l.release_player_id as string),
    ...(richieste ?? []).map((r) => r.player_id as string),
  ]);
}

/**
 * I giocatori del listone che non sono nelle due rose dello scambio.
 *
 * È l'elenco che `verificaScambio` usa per accorgersi che il modello ha tirato
 * dentro qualcuno che qui non c'entra. Si esclude chi ha meno di quattro
 * lettere nel nome: troppo corto per cercarlo in un testo senza pescare
 * pezzi di altre parole.
 */
async function nomiFuoriDalloScambio(
  leagueId: string, nelloScambio: { nome: string }[],
): Promise<string[]> {
  const db = supabaseAdmin();
  const [{ data: listone }, { data: inRosa }] = await Promise.all([
    db.from('players').select('name').eq('out_of_list', false),
    db.from('v_roster').select('name').eq('league_id', leagueId),
  ]);

  // Chi è in una rosa qualunque della lega può essere nominato di striscio
  // («lo prende al posto di X»), quindi non è vietato: vietato è chi con
  // questa lega non c'entra per niente, più chi sta in rosa ad altri.
  const ammessi = new Set([
    ...nelloScambio.map((g) => g.nome.toUpperCase()),
  ]);
  const dellaLega = new Set((inRosa ?? []).map((p) => (p.name as string).toUpperCase()));

  return (listone ?? [])
    .map((p) => p.name as string)
    .filter((n) => n.trim().length >= 4)
    .filter((n) => !ammessi.has(n.toUpperCase()))
    .filter((n) => !dellaLega.has(n.toUpperCase()));
}

export async function costruisciRichiesta(
  leagueId: string, scelta: SceltaScambio,
): Promise<RichiestaScambio> {
  const db = supabaseAdmin();
  const [tutte, { data: lega }] = await Promise.all([
    rosePerScambio(leagueId),
    db.from('leagues').select('redazione_tono, redazione_parole_vietate')
      .eq('id', leagueId).single(),
  ]);

  const trova = (teamId: string): LatoScambio => {
    const t = tutte.find((x) => x.teamId === teamId);
    if (!t) throw new Error('squadra inesistente nella lega');
    return t;
  };
  const casaIntera = trova(scelta.fromTeamId);
  const ospiteIntera = trova(scelta.toTeamId);

  const lato = (t: LatoScambio, ids: string[]): LatoScambio =>
    ({ ...t, cede: t.cede.filter((g) => ids.includes(g.playerId)) });

  return {
    casa: lato(casaIntera, scelta.fromPlayerIds),
    ospite: lato(ospiteIntera, scelta.toPlayerIds),
    conguaglio: scelta.conguaglio,
    chiPaga: scelta.chiPaga,
    note: scelta.note,
    tono: Number(lega?.redazione_tono ?? 4),
    paroleVietate: (lega?.redazione_parole_vietate as string[] | undefined) ?? [],
    // I nomi che il modello NON deve scrivere: tutto il listone meno le rose
    // delle due squadre. Si passa l'elenco vietato e non quello lecito perché
    // il controllo opposto — segnalare ogni maiuscola non prevista — scambiava
    // per giocatori inventati le parole italiane che un tono acceso enfatizza.
    nomiVietati: await nomiFuoriDalloScambio(leagueId, [...casaIntera.cede, ...ospiteIntera.cede]),
  };
}

/**
 * I giocatori scelti che non sono (più) nella rosa di partenza, per nome.
 *
 * `costruisciRichiesta` li **scarta in silenzio**: tiene solo chi è davvero
 * nella rosa della squadra che lo cede, ed è giusto — nel registro non deve
 * finire un giocatore che non c'è. Ma il silenzio è il problema: senza questo
 * controllo il registro conterrebbe meno giocatori di quelli a schermo,
 * l'anteprima prometterebbe uno spostamento che non avviene, e la firma
 * combacerebbe comunque (si calcola sulla scelta grezza, non su quella
 * filtrata). È il buco residuo dell'invariante di 829ef68.
 *
 * I nomi si rileggono da `players` e non dalle rose: un giocatore sparito
 * dalla rosa di partenza può essere finito svincolato, e allora in nessuna
 * rosa della lega c'è più un nome da mostrare.
 */
export async function fuoriDallaRosa(
  scelta: SceltaScambio, r: RichiestaScambio,
): Promise<string[]> {
  const rimasti = new Set([...r.casa.cede, ...r.ospite.cede].map((g) => g.playerId));
  const mancanti = [...scelta.fromPlayerIds, ...scelta.toPlayerIds]
    .filter((id) => !rimasti.has(id));
  if (!mancanti.length) return [];

  const { data } = await supabaseAdmin().from('players').select('id, name').in('id', mancanti);
  const nomi = new Map((data ?? []).map((x) => [x.id as string, x.name as string]));
  // se anche il nome non si ritrova, l'id è meglio di niente: l'admin deve
  // capire *quale* riga togliere, non restare con un rifiuto senza soggetto
  return mancanti.map((id) => nomi.get(id) ?? id);
}

/**
 * Il secondo tempo ricontrolla tutto, a partire dal registro.
 *
 * Fra «Scrivi l'annuncio» e «Conferma lo scambio» passano ore o giorni — è il
 * senso stesso dei due tempi — e in quella finestra l'impegno d'asta nasce:
 * una squadra chiama uno svincolato mettendo sul piatto proprio il giocatore
 * che stava per essere scambiato. Senza questo ricontrollo basterebbe
 * scrivere prima e confermare dopo per aggirare il rifiuto del primo tempo.
 *
 * Si parte da `trade_items`, non dalla selezione del form: quando l'admin
 * riprende lo scambio dopo un ricarico, a schermo non c'è più niente da cui
 * dedurre chi si sta muovendo. Il registro è l'unica verità disponibile, ed è
 * anche quella che `fn_applica_scambio` userà.
 *
 * Restituisce l'elenco dei motivi per cui **adesso** non si può registrare;
 * vuoto se si può. I motivi sono scritti al tempo giusto («è finito in
 * un'asta *dopo* che avevi scritto l'annuncio»): il punto non è che qualcosa
 * non torna, è che è cambiato nel frattempo.
 */
export async function ricontrollaScambio(
  leagueId: string, tradeId: string,
): Promise<string[]> {
  const db = supabaseAdmin();
  const [{ data: trade }, { data: righe }] = await Promise.all([
    db.from('trades')
      .select('from_team_id, to_team_id, settlement, settlement_payer, note, applied_at, reverted_at')
      .eq('id', tradeId).eq('league_id', leagueId).maybeSingle(),
    db.from('trade_items').select('player_id, from_team_id').eq('trade_id', tradeId),
  ]);
  if (!trade) return ['Questo scambio non è più nel registro.'];
  // Prima di tutto lo stato, perché su uno scambio già registrato i contratti
  // sono già stati spostati e tutti i controlli qui sotto direbbero «non è più
  // nella rosa di partenza»: vero, ma fuorviante. Non è la difesa dal doppio
  // clic — quella è il `for update` dentro `fn_applica_scambio`, che resta
  // l'unica cosa che regge due richieste davvero simultanee — è solo il modo
  // di dare il messaggio giusto al caso normale.
  if (trade.applied_at) return ['Questo scambio è già registrato.'];
  if (trade.reverted_at) return ['Questo scambio è stato annullato: non si registra di nuovo.'];
  // il guscio senza giocatori: `fn_applica_scambio` lo rifiuta di suo (0020),
  // ma dirlo qui vuol dire dirlo con parole leggibili invece che con
  // l'eccezione di una funzione Postgres
  if (!righe?.length) {
    return ['Questo scambio non ha nessun giocatore: non c\'è niente da registrare.'];
  }

  const scelta: SceltaScambio = {
    fromTeamId: trade.from_team_id as string,
    toTeamId: trade.to_team_id as string,
    fromPlayerIds: righe.filter((x) => x.from_team_id === trade.from_team_id)
      .map((x) => x.player_id as string),
    toPlayerIds: righe.filter((x) => x.from_team_id !== trade.from_team_id)
      .map((x) => x.player_id as string),
    conguaglio: Number(trade.settlement ?? 0),
    chiPaga: trade.settlement_payer === 'to' ? 'to' : 'from',
    note: (trade.note as string | null) ?? '',
  };

  let r: RichiestaScambio;
  try {
    r = await costruisciRichiesta(leagueId, scelta);
  } catch {
    return ['Una delle due squadre non è più in questa lega.'];
  }

  const motivi: string[] = [];
  for (const nome of await fuoriDallaRosa(scelta, r)) {
    motivi.push(`${nome} non è più nella rosa di partenza: qualcuno l'ha mosso `
      + 'dopo che avevi scritto l\'annuncio.');
  }

  // Gli stessi controlli bloccanti del primo tempo, rifatti sui dati di
  // adesso. L'unica differenza è il tempo del verbo: dove `validaScambio` dice
  // «è impegnato», qui si dice «è finito in un'asta dopo», perché quando
  // l'annuncio è stato scritto quell'impegno non c'era.
  const bloccati = await giocatoriBloccati(leagueId);
  const alTempoGiusto = new Map([...r.casa.cede, ...r.ospite.cede].map((g) => [
    testoImpegnato(g.nome),
    `${g.nome} è finito in un'asta dopo che avevi scritto l'annuncio.`,
  ]));
  for (const x of validaScambio(r, bloccati)) {
    if (x.gravita === 'errore') motivi.push(alTempoGiusto.get(x.testo) ?? x.testo);
  }

  return motivi;
}

export async function generaScambio(r: RichiestaScambio) {
  const modello = scegliModello();
  let pezzo: PezzoScambio | null = null;
  let problemi: string[] = [];
  let tentativi = 0;
  // «non ha risposto» contro «ha risposto ma la verifica l'ha bocciato»: sono
  // due ripieghi diversi, e all'admin vanno detti diversi. Senza modello
  // configurato non c'è nemmeno stata una domanda, quindi è il primo caso.
  let muto = !modello;

  if (modello) {
    for (let i = 0; i < MASSIMI_TENTATIVI; i++) {
      tentativi++;
      try {
        const candidato = daJsonScambio(await modello.chiedi(costruisciPromptScambio(r)));
        const v = verificaScambio(candidato, r);
        pezzo = candidato;
        problemi = v.problemi;
        muto = false;
        if (v.ok) break;
        r.correzioni = v.problemi;
      } catch (e) {
        problemi = [`il modello non ha risposto: ${(e as Error).message}`];
        pezzo = null;
        muto = true;
      }
    }
  }

  const buono = pezzo && verificaScambio(pezzo, r).ok;
  if (!buono) {
    return {
      testo: scambioDiRipiego(r), provider: 'template' as const, tentativi, problemi, muto,
    };
  }
  return {
    testo: montaScambio(pezzo!, r), provider: 'gemini' as const,
    tentativi, problemi: [], muto: false,
  };
}
