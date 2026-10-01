import 'server-only';
import { supabaseAdmin } from './supabase';
import { loadMarketState, budgetForLot, cfgFromLeague, sessionInfo } from './market';
import {
  refundValue, changesLeft, salaApribile, validateAssegnazione, auctionBudget, ROLE_LABEL,
  faseDelLotto, presenzeMancanti,
  type Role, type PlayerStatus, type RosterPlayer, type LeagueConfig, type FaseLotto,
} from './rules';
import { testoDellaCoda, type VoceDellaCoda } from './coda';
import { notifyAdmin, tgLotSettled } from './telegram';
import { annota } from './registroServer';
import { queueSessionMessage } from './messageBuilder';

/**
 * Esecuzione del mercato: apertura della sala, apertura dei lotti, chiusura
 * e movimenti. Tutto quello che tocca contratti e crediti passa da qui.
 *
 * Regola di fondo: chi vince svincola, incassa e paga; chi perde non subisce
 * nulla — il suo giocatore resta in rosa al prezzo d'acquisto originario.
 */

export interface SettleResult {
  ok: boolean;
  message: string;
  lotId?: string;
}

/** Apre la sala: assegna i lotti senza contendenti e manda la sessione in live. */
export async function openRoom(
  sessionId: string,
  /** chi l'ha aperta: il registro vuole la persona, non «il sistema» */
  attore?: { userId?: string | null; teamId?: string | null; nome?: string | null },
): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: session } = await db.from('auction_sessions').select('*').eq('id', sessionId).single();
  if (!session) return { ok: false, message: 'Sessione inesistente.' };
  if (session.status === 'live') return { ok: false, message: 'La sala è già aperta.' };
  if (session.status === 'closed') return { ok: false, message: 'Questa asta è chiusa.' };

  // la sala si apre tutto il giorno dell'asta, ma non prima: aprirla
  // assegna i lotti non contesi e muove contratti e crediti davvero
  const { data: lega } = await db.from('leagues')
    .select('*').eq('id', session.league_id as string).single();
  const cfg = cfgFromLeague(lega ?? {});
  if (!salaApribile(sessionInfo(session), new Date(), cfg)) {
    return { ok: false, message: 'La sala si apre il giorno dell\'asta.' };
  }

  const { data: pending } = await db.from('lot_participants')
    .select('team_id, teams(name)').eq('session_id', sessionId).eq('status', 'pending_approval');
  if (pending && pending.length > 0) {
    const names = (pending as unknown as { teams: { name: string } | null }[])
      .map((p) => p.teams?.name).filter(Boolean).join(', ');
    return {
      ok: false,
      message: `Ci sono richieste di svincolo gratuito da decidere (${names}). Decidile prima di aprire la sala.`,
    };
  }

  const { data: lots } = await db.from('lots')
    .select('id, status, caller_team_id, order_index').eq('session_id', sessionId)
    .neq('status', 'cancelled').order('order_index');

  let assigned = 0;
  for (const lot of lots ?? []) {
    const { data: parts } = await db.from('lot_participants')
      .select('team_id, release_player_id, is_caller')
      .eq('lot_id', lot.id).eq('status', 'confirmed').eq('withdrawn', false);

    if (!parts || parts.length === 0) {
      await db.from('lots').update({ status: 'cancelled' }).eq('id', lot.id);
      continue;
    }
    if (parts.length === 1) {
      // nessun contendente: il chiamante paga il 75% del proprio svincolando
      const only = parts[0];
      const state = await loadMarketState(only.team_id, sessionId);
      const rel = state.roster.find((r) => r.playerId === only.release_player_id);
      const price = rel ? refundValue(rel, state.cfg).value : 0;
      await db.from('lots').update({
        status: 'assigned', winner_team_id: only.team_id, final_price: price,
        current_price: price, current_leader: only.team_id, closed_at: new Date().toISOString(),
      }).eq('id', lot.id);
      await applyMovements(lot.id, only.team_id, price, true);
      assigned += 1;
    }
  }

  await db.from('auction_sessions')
    .update({ status: 'live', room_opened_at: new Date().toISOString() }).eq('id', sessionId);

  /*
   * La coda operativa all'admin, appena la sala apre.
   *
   * Il messaggio per il gruppo elenca solo i lotti contesi — quelli che
   * andranno davvero all'asta — e va bene così. Ma chi deve riportare i
   * movimenti su Leghe Fantacalcio ha bisogno esattamente dell'altra metà,
   * e fino a qui non ce l'aveva da nessuna parte.
   */
  const coda = await codaOperativa(sessionId);
  if (coda.length) {
    await notifyAdmin(
      `<b>Coda operativa — asta ${session.number}</b>\n`
      + `${coda.length} ${coda.length === 1 ? 'lotto assegnato' : 'lotti assegnati'} senza asta.\n\n`
      + `<pre>${testoDellaCoda(coda)}</pre>`,
    );
  }

  await annota({
    leagueId: session.league_id as string, azione: 'sala_aperta', attore,
    sessionId, dati: { asta: session.number, assegnatiSenzaAsta: assigned },
  });

  // il messaggio di svelamento si scrive da solo: adesso svincolandi e budget
  // sono pubblici, quindi il testo per il gruppo è finalmente componibile
  await queueSessionMessage(sessionId, 'room_open');

  return {
    ok: true,
    message: assigned
      ? `Sala aperta. ${assigned} ${assigned === 1 ? 'lotto assegnato' : 'lotti assegnati'} senza contendenti.`
      : 'Sala aperta.',
  };
}

/**
 * I lotti che si assegnano senza asta, con chi entra e chi esce.
 *
 * Funziona prima e dopo l'apertura: prima legge il prezzo dallo
 * svincolando (è lo stesso conto che farà `openRoom`), dopo lo legge dal
 * lotto già assegnato. Così l'admin può prepararsi il lavoro nel
 * pomeriggio e ritrovare lo stesso elenco la sera.
 */
export async function codaOperativa(sessionId: string): Promise<VoceDellaCoda[]> {
  const db = supabaseAdmin();
  const { data: lots } = await db.from('lots')
    .select('id, player_id, status, final_price, order_index, players(name, role, club)')
    .eq('session_id', sessionId).neq('status', 'cancelled').order('order_index');

  type LotRow = {
    id: string; player_id: string; status: string; final_price: number | null;
    players: { name: string; role: Role; club: string } | null;
  };
  const righe = (lots ?? []) as unknown as LotRow[];
  const voci: VoceDellaCoda[] = [];

  for (const lot of righe) {
    const { data: parts } = await db.from('lot_participants')
      .select('team_id, release_player_id, teams(name)')
      .eq('lot_id', lot.id).eq('status', 'confirmed').eq('withdrawn', false);

    type PartRow = { team_id: string; release_player_id: string; teams: { name: string } | null };
    const suoi = (parts ?? []) as unknown as PartRow[];
    // un partecipante solo: nessuno se lo contende, va assegnato d'ufficio
    if (suoi.length !== 1 || !lot.players) continue;

    const p = suoi[0];
    const state = await loadMarketState(p.team_id, sessionId);
    const rel = state.roster.find((r) => r.playerId === p.release_player_id);
    const prezzo = lot.final_price ?? (rel ? refundValue(rel, state.cfg).value : 0);

    voci.push({
      lottoId: lot.id,
      squadra: p.teams?.name ?? '?',
      prende: { nome: lot.players.name, ruolo: lot.players.role, club: lot.players.club },
      svincola: rel ? { nome: rel.name, ruolo: rel.role } : null,
      prezzo,
    });
  }

  return voci;
}

/** Un contendente su un lotto, con il budget che ha davvero in questo momento. */
export interface ContendenteConBudget {
  lottoId: string;
  teamId: string;
  squadra: string;
  svincolandoId: string;
  /** crediti di adesso + rimborso dello svincolando dichiarato per questo lotto */
  budget: number;
  ritirato: boolean;
}

/**
 * Il budget vero di tutti i contendenti della sessione, lotto per lotto.
 *
 * Esiste perché il numero che la sala mostra e il numero che
 * `assegnaAMano` accetta devono essere lo stesso: finché erano due conti
 * diversi, la sala mostrava lo snapshot salvato all'adesione — fermo per
 * sempre — e il server ragionava sui crediti di adesso. Dopo la prima
 * aggiudicazione i due numeri divergevano e l'admin assegnava alla cieca.
 *
 * Fa gli stessi conti di `budgetForLot`, ma per tutta la sessione in una
 * manciata di letture invece di una `loadMarketState` per squadra: in sala
 * questa pagina si ricarica a ogni rilancio.
 *
 * Lo svincolando di un lotto già vinto non è più in rosa, e lì il rimborso
 * vale zero: è giusto così, perché quel rimborso è già dentro il saldo.
 */
export async function contendentiDellaSessione(sessionId: string): Promise<ContendenteConBudget[]> {
  const db = supabaseAdmin();

  const { data: session } = await db.from('auction_sessions')
    .select('league_id').eq('id', sessionId).single();
  if (!session) return [];

  const { data: parts } = await db.from('lot_participants')
    .select('lot_id, team_id, release_player_id, withdrawn, teams(name)')
    .eq('session_id', sessionId).eq('status', 'confirmed');
  type PartRow = {
    lot_id: string; team_id: string; release_player_id: string; withdrawn: boolean;
    teams: { name: string } | null;
  };
  const suoi = (parts ?? []) as unknown as PartRow[];
  if (suoi.length === 0) return [];

  const svincolandi = [...new Set(suoi.map((p) => p.release_player_id))];
  const squadre = [...new Set(suoi.map((p) => p.team_id))];

  const [{ data: lega }, { data: credits }, { data: contratti }, { data: gratuiti }] = await Promise.all([
    db.from('leagues').select('*').eq('id', session.league_id as string).single(),
    db.from('v_team_credits').select('team_id, credits').in('team_id', squadre),
    db.from('contracts').select('team_id, price, players(id, name, role, club, status)')
      .in('team_id', squadre).in('player_id', svincolandi).is('released_at', null),
    db.from('free_release_requests').select('team_id, player_id')
      .in('team_id', squadre).in('player_id', svincolandi).eq('status', 'approved'),
  ]);

  const cfg = cfgFromLeague(lega ?? {});
  const saldi = new Map((credits ?? []).map((c) => [c.team_id as string, c.credits as number]));
  const approvati = new Set((gratuiti ?? []).map((g) => `${g.team_id}:${g.player_id}`));

  type ContrattoRow = {
    team_id: string; price: number;
    players: { id: string; name: string; role: Role; club: string; status: PlayerStatus } | null;
  };
  const inRosa = new Map<string, RosterPlayer>();
  for (const c of (contratti ?? []) as unknown as ContrattoRow[]) {
    if (!c.players) continue;
    inRosa.set(`${c.team_id}:${c.players.id}`, {
      playerId: c.players.id, name: c.players.name, role: c.players.role,
      club: c.players.club, status: c.players.status, price: c.price,
      freeReleaseApproved: approvati.has(`${c.team_id}:${c.players.id}`),
    });
  }

  return suoi.map((p) => {
    const saldo = saldi.get(p.team_id) ?? 0;
    const rel = inRosa.get(`${p.team_id}:${p.release_player_id}`);
    return {
      lottoId: p.lot_id,
      teamId: p.team_id,
      squadra: p.teams?.name ?? '?',
      svincolandoId: p.release_player_id,
      budget: rel ? auctionBudget(saldo, rel, cfg) : saldo,
      ritirato: p.withdrawn,
    };
  });
}

/**
 * Manda un lotto in sala. Il countdown **non** parte qui.
 *
 * Aprire un lotto vuol dire chiamare le squadre in corsa al tavolo: il
 * timer lo accende la conferma di presenza dell'ultima di loro, dentro
 * `fn_confirm_presence`. Prima partiva all'apertura, e chi apriva la pagina
 * con dieci secondi di ritardo aveva già perso il lotto.
 */
export async function openLot(lotId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots').select('id, status, session_id').eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.status !== 'called') return { ok: false, message: 'Questo lotto non è in attesa.' };

  const { data: session } = await db.from('auction_sessions')
    .select('status, league_id').eq('id', lot.session_id).single();
  if (session?.status !== 'live') return { ok: false, message: 'La sala non è aperta.' };

  const { data: open } = await db.from('lots')
    .select('id').eq('session_id', lot.session_id).eq('status', 'live').maybeSingle();
  if (open) return { ok: false, message: 'C\'è già un lotto all\'asta: chiudi quello prima.' };

  // niente presenze vecchie: un lotto rimesso in programma e riaperto
  // ricomincia da zero, altrimenti ripartirebbe col timer già acceso
  await db.from('lot_presences').delete().eq('lot_id', lotId);

  await db.from('lots').update({
    status: 'live',
    opened_at: new Date().toISOString(),
    timer_ends_at: null,
    current_price: null,
    current_leader: null,
  }).eq('id', lotId);

  const attese = await contendentiDellaSessione(lot.session_id);
  const mancano = presenzeMancanti(
    attese.filter((c) => c.lottoId === lotId && !c.ritirato)
      .map((c) => ({ teamId: c.teamId, squadra: c.squadra })),
    [],
  );

  return {
    ok: true, lotId,
    message: mancano.length
      ? `Lotto aperto. Si aspetta la conferma di: ${mancano.join(', ')}.`
      : 'Lotto aperto.',
  };
}

/**
 * Una squadra conferma di essere in sala per un lotto.
 *
 * Il conto di chi c'è e l'accensione del countdown stanno in Postgres:
 * `fn_confirm_presence` blocca la riga del lotto, registra la conferma e, se
 * con questa ci sono tutti, scrive `timer_ends_at` nella stessa transazione.
 * Due allenatori che premono nello stesso istante non possono far partire
 * due timer, e il momento zero è l'orologio del server.
 */
export async function confermaPresenza(
  lotId: string, teamId: string, userId: string,
): Promise<SettleResult & { partito?: boolean }> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('fn_confirm_presence', {
    p_lot_id: lotId, p_team_id: teamId, p_user_id: userId,
  });
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  const row = (Array.isArray(data) ? data[0] : data) as
    { ok: boolean; reason: string | null; started: boolean } | null;
  if (!row?.ok) return { ok: false, message: row?.reason ?? 'Conferma rifiutata.' };

  return {
    ok: true, lotId, partito: row.started,
    message: row.started
      ? 'Ci siamo tutti: il timer è partito.'
      : 'Presenza confermata. Si aspettano gli altri.',
  };
}

/**
 * L'admin accende il countdown senza aspettare chi manca.
 *
 * Serve la sera che uno non si collega e la serata non può restare ferma.
 * L'aggiornamento è condizionato a `timer_ends_at is null`: se nel
 * frattempo l'ultima conferma è arrivata, questa non fa niente invece di
 * regalare altri 15 secondi a chi stava già rilanciando.
 */
export async function partiComunque(lotId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const lot = await lottoConConfig(lotId);
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.fase !== 'attesa_presenze') {
    return { ok: false, message: 'Questo lotto non è in attesa di presenze.' };
  }

  const { data: updated } = await db.from('lots')
    .update({ timer_ends_at: new Date(Date.now() + lot.cfg.timerSeconds * 1000).toISOString() })
    .eq('id', lotId).eq('status', 'live').is('timer_ends_at', null).select('id');
  if (!updated || updated.length === 0) {
    return { ok: true, message: 'Il timer era già partito da sé: nessun secondo regalato.' };
  }
  return { ok: true, lotId, message: `Timer partito: ${lot.cfg.timerSeconds} secondi.` };
}

/** Rimette i secondi pieni su un lotto scaduto, prima del martello. */
export async function riapriTimer(lotId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const lot = await lottoConConfig(lotId);
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.fase !== 'grazia' && lot.fase !== 'congelato' && lot.fase !== 'rilanci') {
    return { ok: false, message: 'Il lotto non è all\'asta.' };
  }

  await db.from('lots')
    .update({ timer_ends_at: new Date(Date.now() + lot.cfg.timerSeconds * 1000).toISOString() })
    .eq('id', lotId).eq('status', 'live');
  return { ok: true, lotId, message: `Timer rimesso a ${lot.cfg.timerSeconds} secondi.` };
}

/**
 * Disfa l'apertura: il lotto torna in programma come se non fosse mai andato
 * in sala, presenze comprese.
 *
 * Si può **solo** finché il countdown non è partito. Il controllo è sulla
 * fase e non sui rilanci, e la differenza conta: il lotto senza offerte è il
 * più comune della serata — a martello battuto va al chiamante al 75% del suo
 * svincolando — e contare i rilanci avrebbe permesso di strapparlo via a
 * tempo scaduto, azzerando le presenze di tutti. Dopo che il tempo è
 * cominciato si chiude col martello, e se è andata storta si annulla.
 *
 * L'aggiornamento è condizionato a `timer_ends_at is null`: se l'ultima
 * conferma arriva nello stesso istante, questa non fa niente.
 */
export async function rimettiInProgramma(lotId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const lot = await lottoConConfig(lotId);
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.status !== 'live') return { ok: false, message: 'Questo lotto non è in sala.' };
  if (lot.fase !== 'attesa_presenze') {
    return {
      ok: false,
      message: 'Il countdown è già partito: questo lotto si chiude col martello.'
        + ' Se è andata storta, aggiudicalo e poi annulla l\'aggiudicazione.',
    };
  }

  const { data: updated } = await db.from('lots').update({
    status: 'called', opened_at: null, timer_ends_at: null,
    current_price: null, current_leader: null,
  }).eq('id', lotId).eq('status', 'live').is('timer_ends_at', null).select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, message: 'Il countdown è partito proprio adesso: il lotto è in asta.' };
  }

  await db.from('lot_presences').delete().eq('lot_id', lotId);
  return { ok: true, lotId, message: 'Lotto rimesso in programma: presenze azzerate.' };
}

/** Il lotto con la sua fase e la configurazione della lega, in una lettura. */
async function lottoConConfig(lotId: string): Promise<
  { id: string; status: string; sessionId: string; leagueId: string; cfg: LeagueConfig; fase: FaseLotto } | null
> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots')
    .select('id, status, session_id, timer_ends_at, auction_sessions(league_id)')
    .eq('id', lotId).single();
  if (!lot) return null;
  const leagueId = (lot as unknown as { auction_sessions: { league_id: string } | null })
    .auction_sessions?.league_id ?? '';
  const { data: lega } = await db.from('leagues').select('*').eq('id', leagueId).single();
  const cfg = cfgFromLeague(lega ?? {});
  return {
    id: lot.id as string, status: lot.status as string,
    sessionId: lot.session_id as string, leagueId, cfg,
    fase: faseDelLotto(
      { status: lot.status as string, timerEndsAt: (lot.timer_ends_at as string) ?? null },
      new Date(), cfg,
    ),
  };
}

/**
 * Il martello: chiude il lotto e lo assegna. La batte l'admin.
 *
 * Prima la chiamava il primo browser che vedeva il countdown a zero, e un
 * lotto si chiudeva da solo mentre si discuteva ancora. Ora si chiude solo a
 * lotto congelato — timer scaduto e grazia finita — oppure con `force`, che
 * è il «chiudi subito» dell'admin quando è chiaro che nessuno rilancia più.
 *
 * Resta idempotente: due click sullo stesso bottone non assegnano due volte,
 * perché l'update finale è condizionato allo stato `live`.
 */
export async function closeLot(lotId: string, force = false): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots').select('*').eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.status === 'assigned') return { ok: true, message: 'Lotto già chiuso.' };
  if (lot.status !== 'live') return { ok: false, message: 'Il lotto non è aperto.' };

  if (!force) {
    const con = await lottoConConfig(lotId);
    const fase = con?.fase;
    if (fase === 'attesa_presenze') {
      return { ok: false, message: 'Il lotto non è nemmeno partito: si aspettano le presenze.' };
    }
    if (fase === 'rilanci' || fase === 'grazia') {
      return { ok: false, message: 'Il timer non è ancora scaduto.' };
    }
  }

  let winner = lot.current_leader as string | null;
  let price = lot.current_price as number | null;

  // nessuno ha rilanciato: il lotto va al chiamante alle condizioni che
  // avrebbe avuto senza contendenti, cioè il 75% del suo svincolando
  if (!winner) {
    const { data: caller } = await db.from('lot_participants')
      .select('team_id, release_player_id').eq('lot_id', lotId).eq('is_caller', true)
      .eq('status', 'confirmed').maybeSingle();
    if (!caller) {
      await db.from('lots').update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('id', lotId);
      return { ok: true, message: 'Nessuna offerta e nessun chiamante: lotto annullato.' };
    }
    const state = await loadMarketState(caller.team_id, lot.session_id);
    const rel = state.roster.find((r) => r.playerId === caller.release_player_id);
    winner = caller.team_id;
    price = rel ? refundValue(rel, state.cfg).value : 0;
  }

  /*
   * Chiusura condizionata, e non solo sullo stato.
   *
   * Vincitore e prezzo arrivano dalla lettura di qualche millisecondo fa. Un
   * rilancio che atterra in quella finestra passa in `fn_place_bid` — il
   * lotto è ancora `live` — e sposta prezzo e leader: se qui si guardasse
   * solo lo stato, il lotto si chiuderebbe al prezzo vecchio e, peggio, alla
   * squadra sbagliata. Mettendo prezzo e leader nella condizione, chi è
   * arrivato tardi è questa chiusura, e si ferma.
   */
  let chiusura = db.from('lots').update({
    status: 'assigned', winner_team_id: winner, final_price: price,
    closed_at: new Date().toISOString(),
  }).eq('id', lotId).eq('status', 'live');
  chiusura = lot.current_leader === null
    ? chiusura.is('current_leader', null)
    : chiusura.eq('current_leader', lot.current_leader);
  chiusura = lot.current_price === null
    ? chiusura.is('current_price', null)
    : chiusura.eq('current_price', lot.current_price);

  const { data: updated } = await chiusura.select('id');
  if (!updated || updated.length === 0) {
    // o l'ha già chiuso qualcun altro, o è arrivata un'offerta: sono due cose
    // diverse da dire, e si distinguono rileggendo com'è finita
    const { data: ora } = await db.from('lots')
      .select('status, current_price, current_leader').eq('id', lotId).single();
    if (ora?.status === 'assigned') return { ok: true, message: 'Lotto già chiuso.' };
    return {
      ok: false,
      message: 'È arrivata un\'offerta nell\'istante del martello:'
        + ` adesso siamo a ${ora?.current_price ?? '—'}. Guarda com'è e richiudi.`,
    };
  }

  await applyMovements(lotId, winner!, price ?? 0, false);
  return { ok: true, message: 'Lotto assegnato.', lotId };
}

/**
 * Assegna un lotto a mano, senza passare dall'asta in sala.
 *
 * Stessa strada di `closeLot` per tutto quello che conta: il lotto diventa
 * `assigned` con vincitore e prezzo, e `applyMovements` fa svincolo,
 * rimborso, acquisto e riga da riportare su Leghe Fantacalcio. Cambia solo
 * da dove arrivano vincitore e prezzo — dall'admin invece che dai rilanci.
 *
 * L'aggiornamento è condizionato allo stato di partenza: se nel frattempo
 * il lotto si è chiuso da solo — timer scaduto, un altro admin, due schede
 * aperte — questa non trova più la riga e si ferma, invece di assegnare due
 * volte lo stesso giocatore.
 */
export async function assegnaAMano(
  lotId: string, teamId: string, prezzo: number,
  attore?: { userId?: string | null; teamId?: string | null; nome?: string | null },
): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: lot } = await db.from('lots')
    .select('id, status, session_id, player_id, players(name)').eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };

  const { data: session } = await db.from('auction_sessions')
    .select('status, league_id').eq('id', lot.session_id).single();
  if (session?.status !== 'live') {
    return { ok: false, message: 'La sala non è aperta: aprila prima, così i lotti senza contendenti si sistemano da soli.' };
  }

  // il budget vero di ciascuno su questo lotto: crediti di adesso più il
  // rimborso del suo svincolando. È lo stesso conto — la stessa funzione —
  // che riempie i numeri mostrati in sala: se l'admin legge 17, 17 passa.
  const inCorsa = (await contendentiDellaSessione(lot.session_id))
    .filter((c) => c.lottoId === lotId && !c.ritirato)
    .map((c) => ({ teamId: c.teamId, squadra: c.squadra, budget: c.budget }));

  const { data: lega } = await db.from('leagues')
    .select('*').eq('id', session.league_id as string).single();
  const cfg = cfgFromLeague(lega ?? {});

  const esito = validateAssegnazione({
    statoLotto: lot.status as 'called' | 'uncontested' | 'live' | 'assigned' | 'cancelled',
    inCorsa, teamId, prezzo, cfg,
  });
  if (!esito.ok) return { ok: false, message: esito.errors.join(' ') };

  const { data: updated } = await db.from('lots').update({
    status: 'assigned', winner_team_id: teamId, final_price: prezzo,
    current_price: prezzo, current_leader: teamId,
    closed_at: new Date().toISOString(),
  }).eq('id', lotId).eq('status', lot.status).select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, message: 'Il lotto è cambiato mentre lo assegnavi: ricarica e guarda com\'è finito.' };
  }

  await applyMovements(lotId, teamId, prezzo, false);

  const nome = (lot as unknown as { players: { name: string } | null }).players?.name ?? 'il giocatore';
  const chi = inCorsa.find((x) => x.teamId === teamId)?.squadra ?? 'la squadra';

  await annota({
    leagueId: session.league_id as string, azione: 'lotto_assegnato_a_mano', attore,
    playerId: lot.player_id as string | null, sessionId: lot.session_id as string, lotId,
    dati: { squadra: chi, prezzo },
  });

  return {
    ok: true, lotId,
    message: `${nome} assegnato a ${chi} per ${prezzo}.`
      + (esito.warnings.length ? ` ${esito.warnings.join(' ')}` : ''),
  };
}

/**
 * Annulla un lotto già chiuso: il contrario esatto di `applyMovements`.
 *
 * Il lotto torna in programma coi suoi contendenti, e si può riaprire e
 * ribattere da zero — presenze comprese. Quello che torna indietro:
 *
 * - il contratto comprato all'asta si **cancella**: non è uno svincolo, è un
 *   acquisto che non è mai avvenuto;
 * - il contratto dello svincolando si **riapre**, e con lui il cambio di
 *   ruolo, che si conta dagli svincoli e quindi torna disponibile da sé;
 * - i crediti tornano con due movimenti di **compensazione**, non
 *   cancellando quelli di prima: il saldo è identico e nel registro si
 *   legge che il lotto è stato aggiudicato e poi annullato;
 * - il giocatore uscito torna chiamabile.
 *
 * I controlli vengono prima di qualunque scrittura, perché un annullo a metà
 * sarebbe peggio del lotto sbagliato: se il giocatore comprato è già stato
 * svincolato o scambiato, o se lo svincolando è già finito in un'altra rosa,
 * questa si ferma e dice cosa lo blocca. Il primo aggiornamento è quello
 * condizionato sul lotto, così due click non annullano due volte.
 */
export async function annullaAssegnazione(
  lotId: string,
  attore?: { userId?: string | null; teamId?: string | null; nome?: string | null },
): Promise<SettleResult> {
  const db = supabaseAdmin();

  const { data: lot } = await db.from('lots')
    .select(`id, status, session_id, player_id, winner_team_id, final_price,
             players(name), auction_sessions(number, league_id)`)
    .eq('id', lotId).single();
  if (!lot) return { ok: false, message: 'Lotto inesistente.' };
  if (lot.status !== 'assigned') return { ok: false, message: 'Questo lotto non è assegnato.' };

  const vincitore = lot.winner_team_id as string | null;
  const prezzo = (lot.final_price as number | null) ?? 0;
  if (!vincitore) return { ok: false, message: 'Questo lotto non ha un vincitore da disfare.' };

  const preso = (lot as unknown as { players: { name: string } | null }).players;
  const sess = (lot as unknown as { auction_sessions: { number: number; league_id: string } | null })
    .auction_sessions;
  const leagueId = sess?.league_id ?? '';

  const { data: team } = await db.from('teams').select('name').eq('id', vincitore).single();
  const squadra = team?.name ?? 'la squadra';

  const { data: part } = await db.from('lot_participants')
    .select('release_player_id').eq('lot_id', lotId).eq('team_id', vincitore).maybeSingle();
  if (!part) return { ok: false, message: 'Non trovo la partecipazione del vincitore: non so chi rimettere in rosa.' };

  // --- controlli, prima di toccare niente

  const { data: comprato } = await db.from('contracts')
    .select('id, player_id').eq('team_id', vincitore).eq('player_id', lot.player_id as string)
    .eq('session_id', lot.session_id as string).eq('acquisition_type', 'flash_auction')
    .is('released_at', null).maybeSingle();
  if (!comprato) {
    return {
      ok: false,
      message: `${preso?.name ?? 'Il giocatore'} non è più in rosa a ${squadra} con quel contratto:`
        + ' svincolato, scambiato o già rimesso all\'asta dopo. L\'annullo si fermerebbe a metà.',
    };
  }

  const { data: svincolato } = await db.from('contracts')
    .select('id, player_id, release_value, release_type, players(name)')
    .eq('team_id', vincitore).eq('player_id', part.release_player_id)
    .eq('session_id', lot.session_id as string).not('released_at', 'is', null)
    .maybeSingle();
  if (!svincolato) {
    return { ok: false, message: 'Non trovo il contratto svincolato in questo lotto: niente da riaprire.' };
  }
  const uscito = (svincolato as unknown as { players: { name: string } | null }).players;
  const rimborso = (svincolato.release_value as number | null) ?? 0;

  // un giocatore ha un solo contratto aperto: se un altro se l'è preso, non
  // si può rimettere in rosa, e il database stesso lo rifiuterebbe
  const { data: altrove } = await db.from('contracts')
    .select('id, teams(name)').eq('player_id', part.release_player_id)
    .is('released_at', null).maybeSingle();
  if (altrove) {
    const chi = (altrove as unknown as { teams: { name: string } | null }).teams?.name ?? 'un\'altra squadra';
    return {
      ok: false,
      message: `${uscito?.name ?? 'Lo svincolando'} è già in rosa a ${chi}: non lo si può rimettere a ${squadra}.`,
    };
  }

  // --- da qui si scrive. Prima il lotto, condizionato: due click non
  //     possono annullare due volte lo stesso lotto.
  const { data: updated } = await db.from('lots').update({
    status: 'called', winner_team_id: null, final_price: null,
    current_price: null, current_leader: null,
    timer_ends_at: null, opened_at: null, closed_at: null,
  }).eq('id', lotId).eq('status', 'assigned').select('id');
  if (!updated || updated.length === 0) {
    return { ok: false, message: 'Il lotto è cambiato mentre lo annullavi: ricarica e guarda com\'è finito.' };
  }

  // l'acquisto non è mai avvenuto
  await db.from('contracts').delete().eq('id', comprato.id);

  // lo svincolo si riapre: il cambio di ruolo torna da sé, perché i cambi
  // si contano dagli svincoli registrati
  await db.from('contracts').update({
    released_at: null, release_type: null, release_value: null, session_id: null,
  }).eq('id', svincolato.id);

  // compensazione: il saldo torna identico e il registro resta leggibile
  await db.from('credit_movements').insert([
    {
      league_id: leagueId, team_id: vincitore, amount: -rimborso, reason: 'adjustment',
      note: `Annullo svincolo ${uscito?.name ?? ''} (lotto ${preso?.name ?? ''})`,
      session_id: lot.session_id, lot_id: lotId,
    },
    {
      league_id: leagueId, team_id: vincitore, amount: prezzo, reason: 'adjustment',
      note: `Annullo acquisto ${preso?.name ?? ''} all\'asta flash`,
      session_id: lot.session_id, lot_id: lotId,
    },
  ]);

  // il giocatore uscito torna chiamabile: il blocco valeva per l'asta che
  // adesso non c'è più
  await db.from('players').update({ locked_until_number: null }).eq('id', part.release_player_id);

  // la riga operativa esce dalla coda, ma resta scritta com'era
  const { data: tasks } = await db.from('admin_tasks')
    .select('id, body').eq('lot_id', lotId).eq('done', false);
  for (const t of tasks ?? []) {
    await db.from('admin_tasks')
      .update({ body: `ANNULLATO — ${t.body}`, done: true, done_at: new Date().toISOString() })
      .eq('id', t.id);
  }

  /*
   * Le presenze e i rilanci di quel giro non valgono per il prossimo.
   *
   * I rilanci si cancellano perché quell'asta non è mai avvenuta: lasciandoli
   * lì, `rimettiInProgramma` li avrebbe contati per sempre e il lotto
   * riaperto non si sarebbe più potuto disfare. Quello che è successo resta
   * scritto nei movimenti di compensazione e in `audit_log`.
   */
  await db.from('lot_presences').delete().eq('lot_id', lotId);
  await db.from('bids').delete().eq('lot_id', lotId);

  await db.from('audit_log').insert({
    league_id: leagueId, action: 'lot_unassigned',
    payload: {
      lot_id: lotId, team: squadra, in: preso?.name, out: uscito?.name,
      price: prezzo, refund: rimborso, session: sess?.number,
    },
  });

  const riga = `Annullata l'aggiudicazione di ${preso?.name ?? 'il giocatore'} a ${squadra}`
    + ` (${prezzo} cr, usciva ${uscito?.name ?? '?'} per ${rimborso} cr).`
    + ' Il lotto è tornato in programma.'
    + ' Se l\'avevi già riportato su Leghe Fantacalcio, va disfatto anche là.';
  await notifyAdmin(`<b>Aggiudicazione annullata</b>\n${riga}`);

  await annota({
    leagueId, azione: 'lotto_annullato', attore,
    playerId: lot.player_id as string | null, sessionId: lot.session_id as string, lotId,
    dati: { squadra, prezzo },
  });

  return { ok: true, lotId, message: riga };
}

/**
 * I movimenti veri: svincolo, rimborso, acquisto, blocco del giocatore uscito
 * e la riga da replicare su Leghe Fantacalcio.it.
 */
async function applyMovements(
  lotId: string, winnerTeamId: string, price: number, uncontested: boolean,
): Promise<void> {
  const db = supabaseAdmin();

  const { data: lot } = await db.from('lots')
    .select('id, session_id, player_id, players(name, role), auction_sessions(number, league_id)')
    .eq('id', lotId).single();
  const target = (lot as unknown as { players: { name: string; role: Role } | null }).players;
  const sess = (lot as unknown as { auction_sessions: { number: number; league_id: string } | null }).auction_sessions;
  const leagueId = sess!.league_id;

  const { data: part } = await db.from('lot_participants')
    .select('release_player_id').eq('lot_id', lotId).eq('team_id', winnerTeamId).single();

  const state = await loadMarketState(winnerTeamId, lot!.session_id);
  const released = state.roster.find((r) => r.playerId === part!.release_player_id);

  /*
   * Lo svincolando dichiarato non è più in rosa: succede se nel frattempo è
   * stato scambiato o svincolato per altra via. Non si può fare niente di
   * sensato — non c'è il rimborso, non c'è il posto da liberare — ma uscire in
   * silenzio era peggio: il lotto resta `assigned` con vincitore e prezzo,
   * nessun contratto e nessun credito mossi, e nemmeno una riga in coda. Un
   * lotto così è bugiardo e non si può nemmeno annullare, perché l'annullo
   * cerca un contratto che non è mai nato. Almeno si deve sapere.
   */
  if (!released) {
    const { data: team } = await db.from('teams').select('name').eq('id', winnerTeamId).single();
    const guaio = `Lotto ${target?.name ?? ''} chiuso a favore di ${team?.name ?? winnerTeamId}`
      + ` per ${price} cr, ma il suo svincolando non è più in rosa:`
      + ' nessun movimento scritto. Va sistemato a mano.';
    await db.from('admin_tasks').insert({
      league_id: leagueId, session_id: lot!.session_id, lot_id: lotId, body: guaio,
    });
    await db.from('audit_log').insert({
      league_id: leagueId, action: 'lot_settled_senza_movimenti',
      payload: { lot_id: lotId, team: team?.name, in: target?.name, price, uncontested },
    });
    await notifyAdmin(`<b>Attenzione</b>\n${guaio}`);
    return;
  }
  const refund = refundValue(released, state.cfg);

  const creditsBefore = state.credits;
  const now = new Date().toISOString();

  // 1. chiudo il contratto del giocatore svincolato
  await db.from('contracts').update({
    released_at: now, release_type: refund.type,
    release_value: refund.value, session_id: lot!.session_id,
  }).eq('team_id', winnerTeamId).eq('player_id', released.playerId).is('released_at', null);

  // 2. il giocatore uscito non è richiamabile fino alla sessione successiva
  await db.from('players')
    .update({ locked_until_number: (sess!.number ?? 0) + 1 })
    .eq('id', released.playerId);

  // 3. movimenti di credito: prima incasso, poi pago
  await db.from('credit_movements').insert([
    {
      league_id: leagueId, team_id: winnerTeamId, amount: refund.value, reason: 'refund',
      note: `Svincolo ${released.name} (${refund.reason})`, session_id: lot!.session_id, lot_id: lotId,
    },
    {
      league_id: leagueId, team_id: winnerTeamId, amount: -price, reason: 'purchase',
      note: `Acquisto ${target?.name ?? ''} all'asta flash`, session_id: lot!.session_id, lot_id: lotId,
    },
  ]);

  // 4. il nuovo contratto
  await db.from('contracts').insert({
    league_id: leagueId, team_id: winnerTeamId, player_id: lot!.player_id,
    price, acquisition_type: 'flash_auction', session_id: lot!.session_id,
  });

  // 5. la riga operativa per l'admin
  const { data: team } = await db.from('teams').select('name').eq('id', winnerTeamId).single();
  const after = creditsBefore + refund.value - price;
  const role = target?.role ?? released.role;
  const left = changesLeft(
    [...state.releases, { role: released.role, type: refund.type, at: now }],
    role, new Date(), state.cfg,
  );

  const taskBody = `Nella rosa ${team?.name}: svincolare ${released.name} (+${refund.value} cr`
      + `${refund.free ? ', cambio gratuito' : ''}), acquistare ${target?.name} per ${price} cr.`
      + ` Crediti: ${creditsBefore} → ${after}. Cambi ${ROLE_LABEL[role].slice(0, 3).toUpperCase()}: ${left}`
      + `${uncontested ? ' · lotto senza contendenti' : ''}`;

  await db.from('admin_tasks').insert({
    league_id: leagueId, session_id: lot!.session_id, lot_id: lotId, body: taskBody,
  });
  await notifyAdmin(tgLotSettled(taskBody));

  await db.from('audit_log').insert({
    league_id: leagueId, action: 'lot_settled',
    payload: {
      lot_id: lotId, team: team?.name, in: target?.name, out: released.name,
      price, refund: refund.value, credits_before: creditsBefore, credits_after: after,
      uncontested,
    },
  });

  /*
   * L'acquisto nel registro è della squadra, non di una persona: a chiudere
   * il lotto è l'admin col martello, ma il giocatore se lo prende il club, e
   * in un registro pubblico è quello il fatto che interessa. Qui lo
   * svincolando si scrive: dall'aggiudicazione in poi è pubblico.
   */
  await annota({
    leagueId, azione: 'acquisto_asta',
    attore: { teamId: winnerTeamId, nome: team?.name ?? null },
    playerId: lot!.player_id as string, sessionId: lot!.session_id as string, lotId,
    dati: {
      prezzo: price, uscito: released.name, rimborso: refund.value,
      ...(uncontested ? { senzaContendenti: true } : {}),
    },
  });
}

/** Chiude la serata: nessun lotto resta appeso, la sessione va in archivio. */
export async function closeSession(sessionId: string): Promise<SettleResult> {
  const db = supabaseAdmin();
  const { data: openLots } = await db.from('lots')
    .select('id').eq('session_id', sessionId).in('status', ['live', 'called']);
  for (const l of openLots ?? []) await closeLot(l.id, true);
  await db.from('auction_sessions').update({ status: 'closed' }).eq('id', sessionId);

  // e il riepilogo dei risultati, con i conti già chiusi
  await queueSessionMessage(sessionId, 'results');

  return { ok: true, message: 'Asta chiusa.' };
}

export { budgetForLot, cfgFromLeague };
