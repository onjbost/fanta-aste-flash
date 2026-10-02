'use server';

import { revalidatePath } from 'next/cache';
import { annota, chiAgisce, dimentica } from '@/lib/registroServer';
import { chiudiRigaDelloSvincolo } from '@/lib/codaSvincolo';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { notifyAdmin, tgFreeReleaseRequest, telegramConfigured } from '@/lib/telegram';
import { freeReleaseScenarios } from '@/lib/rules';

export type ActionState = { ok: boolean; message: string } | null;

// ------------------------------------------------------------------ login

/**
 * L'indirizzo pubblico dell'app, ricavato dalla richiesta in corso.
 *
 * La variabile d'ambiente resta come preferenza esplicita, ma se manca o è
 * rimasta a localhost usiamo gli header: sono quelli veri del dominio da cui
 * l'utente sta chiedendo il link. Così il magic link non può puntare a un
 * indirizzo dove il telefono non arriva.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');

  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    const fromRequest = `${proto}://${host}`;
    // in produzione la richiesta ha sempre ragione su una variabile dimenticata;
    // in locale anche, al contrario: con l'indirizzo di Vercel nel `.env.local`
    // il link portava in produzione e non si riusciva a entrare su localhost
    if (!configured || host.startsWith('localhost')
        || configured.includes('localhost')) {
      return fromRequest;
    }
    return configured;
  }
  return configured ?? '';
}

export async function sendMagicLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email) return { ok: false, message: 'Scrivi la tua email.' };

  const origin = await siteOrigin();
  if (!origin) {
    return { ok: false, message: 'Non riesco a capire l\'indirizzo dell\'app: manca NEXT_PUBLIC_SITE_URL.' };
  }

  const db = await supabaseServer();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { ok: false, message: `Non sono riuscito a inviare il link: ${error.message}` };
  return {
    ok: true,
    message: `Link inviato a ${email}. Aprilo dal telefono con cui userai l'app.`,
  };
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect('/login');
}

// ------------------------------------------- richiesta di svincolo gratuito

/**
 * Un pulsante, nient'altro. Le prove e le spiegazioni passano dal gruppo
 * WhatsApp; qui si registra la richiesta, si congela l'eventuale chiamata o
 * adesione collegata e si avvisa l'admin.
 */
export async function requestFreeRelease(_prev: ActionState, form: FormData): Promise<ActionState> {
  const playerId = String(form.get('playerId') ?? '');
  if (!playerId) return { ok: false, message: 'Giocatore mancante.' };

  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const { data: m } = await db.from('team_members')
    .select('teams(id, name, league_id)').eq('user_id', auth.user.id).maybeSingle();
  const team = (m as unknown as { teams: { id: string; name: string; league_id: string } | null } | null)?.teams;
  if (!team) return { ok: false, message: 'Nessuna squadra collegata a questo account.' };

  const { data: contract } = await db.from('contracts')
    .select('id, price, players(name, role)')
    .eq('team_id', team.id).eq('player_id', playerId).is('released_at', null)
    .maybeSingle();
  if (!contract) return { ok: false, message: 'Questo giocatore non è nella tua rosa.' };

  const { data: existing } = await db.from('free_release_requests')
    .select('id').eq('team_id', team.id).eq('player_id', playerId).eq('status', 'pending').maybeSingle();
  if (existing) return { ok: false, message: 'Hai già una richiesta in attesa su questo giocatore.' };

  const admin = supabaseAdmin();

  // se il giocatore è già impegnato in una chiamata o adesione, quella si congela
  const { data: participation } = await admin.from('lot_participants')
    .select('id, is_caller, lot_id, session_id, lots(players(name))')
    .eq('team_id', team.id).eq('release_player_id', playerId).eq('status', 'confirmed')
    .maybeSingle();

  const { data: richiesta, error } = await db.from('free_release_requests').insert({
    league_id: team.league_id, team_id: team.id, player_id: playerId,
    lot_participant_id: participation?.id ?? null,
  }).select('id').single();
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  if (participation) {
    await admin.from('lot_participants')
      .update({ status: 'pending_approval' }).eq('id', participation.id);
  }

  const player = (contract as unknown as { players: { name: string; role: string } | null }).players;
  const target = (participation as unknown as { lots?: { players?: { name: string } } } | null)?.lots?.players?.name;
  await admin.from('admin_tasks').insert({
    league_id: team.league_id,
    // la squadra serve al raggruppamento della coda: vedi la 0028
    team_id: team.id,
    body: `Svincolo gratuito da decidere · ${team.name}: ${player?.name ?? 'giocatore'} (${player?.role ?? '?'})`
      + (target ? ` — congela la ${participation!.is_caller ? 'chiamata' : 'adesione'} su ${target}` : ''),
  });

  // e una riga su Telegram, così l'admin non deve aprire l'app per saperlo
  const scenari = freeReleaseScenarios({
    playerId: '', name: '', role: 'D', club: '', status: 'active',
    price: (contract as unknown as { price: number }).price,
  });
  await notifyAdmin(tgFreeReleaseRequest(
    team.name, player?.name ?? 'giocatore', scenari.approved.refund, scenari.rejected.refund,
    target ? `la ${participation!.is_caller ? 'chiamata' : 'adesione'} su ${target}` : undefined,
  ));

  /*
   * `sessionId` qui non è un dettaglio: è quello che dice al registro «questo
   * nome è ancora segreto». Il giocatore di una richiesta è quasi sempre lo
   * svincolando dichiarato su una chiamata — il codice qui sopra lo cerca
   * proprio così — e fino all'apertura della sala non si pubblica.
   * L'impronta serve a togliere la riga se la richiesta viene ritirata.
   */
  await annota({
    leagueId: team.league_id, azione: 'svincolo_richiesto',
    attore: { userId: auth.user.id, teamId: team.id, nome: team.name },
    playerId,
    sessionId: participation?.session_id ?? null,
    impronta: `svincolo_chiesto:${richiesta.id}`,
  });

  revalidatePath('/');
  return {
    ok: true,
    message: participation
      ? 'Richiesta inviata. La tua operazione resta congelata finché l\'admin non decide.'
      : 'Richiesta inviata all\'admin.',
  };
}

/** L'allenatore può ritirare la richiesta finché nessuno l'ha decisa. */
export async function withdrawFreeRelease(_prev: ActionState, form: FormData): Promise<ActionState> {
  const playerId = String(form.get('playerId') ?? '');
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const { data: team } = await db.from('team_members')
    .select('team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  if (!team) return { ok: false, message: 'Nessuna squadra collegata.' };

  const admin = supabaseAdmin();
  const { data: req } = await admin.from('free_release_requests')
    .select('id, lot_participant_id')
    .eq('team_id', team.team_id).eq('player_id', playerId).eq('status', 'pending').maybeSingle();
  if (!req) return { ok: false, message: 'Nessuna richiesta in attesa su questo giocatore.' };

  await admin.from('free_release_requests').update({ status: 'cancelled' }).eq('id', req.id);
  if (req.lot_participant_id) {
    // l'operazione torna valida come svincolo ordinario al 75%
    await admin.from('lot_participants').update({ status: 'confirmed' }).eq('id', req.lot_participant_id);
  }
  // una richiesta ritirata non è una richiesta fatta: la riga del registro
  // se ne va con lei
  await dimentica(`svincolo_chiesto:${req.id}`);

  /*
   * La riga della coda invece resta, ma chiusa: all'admin era arrivata la
   * richiesta, e sapere che è stata ritirata gli serve più che vedersela
   * sparire. Lì dentro non c'è niente da decidere, quindi non è più da fare.
   */
  const [{ data: ritirato }, { data: miaSquadra }] = await Promise.all([
    admin.from('players').select('name').eq('id', playerId).maybeSingle(),
    admin.from('teams').select('name').eq('id', team.team_id).maybeSingle(),
  ]);
  if (ritirato?.name && miaSquadra?.name) {
    await chiudiRigaDelloSvincolo(team.league_id, miaSquadra.name, ritirato.name, 'ritirato');
  }

  revalidatePath('/admin');
  revalidatePath('/');
  return { ok: true, message: 'Richiesta ritirata: torna uno svincolo ordinario al 75%.' };
}

// ------------------------------------------------- decisione dell'admin

/**
 * Tre esiti:
 *   approved  → svincolo al 100%, nessun cambio consumato, operazione confermata
 *   rejected  → svincolo ordinario al 75%, cambio consumato, operazione confermata
 *   cancelled → operazione annullata: la squadra può rifarla con un altro svincolando
 */
export async function decideFreeRelease(_prev: ActionState, form: FormData): Promise<ActionState> {
  const requestId = String(form.get('requestId') ?? '');
  const decision = String(form.get('decision') ?? '');
  const note = String(form.get('decisionNote') ?? '').trim();
  if (!['approved', 'rejected', 'cancelled'].includes(decision)) {
    return { ok: false, message: 'Decisione non valida.' };
  }

  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const { data: me } = await db.from('team_members')
    .select('is_admin, league_id').eq('user_id', auth.user.id).maybeSingle();
  if (!me?.is_admin) return { ok: false, message: 'Serve essere admin.' };

  const admin = supabaseAdmin();
  const { data: req } = await admin.from('free_release_requests')
    .select('id, league_id, team_id, player_id, status, lot_participant_id')
    .eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, message: 'Richiesta non trovata.' };
  if (req.league_id !== me.league_id) return { ok: false, message: 'Richiesta di un\'altra lega.' };
  if (req.status !== 'pending') return { ok: false, message: 'Questa richiesta è già stata decisa.' };

  const { error } = await admin.from('free_release_requests').update({
    status: decision, decided_by: auth.user.id,
    decided_at: new Date().toISOString(), decision_note: note || null,
  }).eq('id', requestId);
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  if (req.lot_participant_id) {
    await admin.from('lot_participants')
      .update({ status: decision === 'cancelled' ? 'cancelled' : 'confirmed' })
      .eq('id', req.lot_participant_id);

    // se annullo la chiamata e nessun altro era entrato, salta anche il lotto
    if (decision === 'cancelled') {
      const { data: part } = await admin.from('lot_participants')
        .select('lot_id, is_caller').eq('id', req.lot_participant_id).maybeSingle();
      if (part) {
        const { count } = await admin.from('lot_participants')
          .select('id', { count: 'exact', head: true })
          .eq('lot_id', part.lot_id).neq('status', 'cancelled');
        if ((count ?? 0) === 0) {
          await admin.from('lots').update({ status: 'cancelled' }).eq('id', part.lot_id);
        }
      }
    }
  }

  await admin.from('audit_log').insert({
    league_id: req.league_id, actor: auth.user.id,
    action: `free_release_${decision}`,
    payload: { request_id: requestId, team_id: req.team_id, player_id: req.player_id, note },
  });

  /*
   * Nel registro finiscono approvazione e rifiuto, non l'annullamento della
   * richiesta: quello non decide niente sullo svincolo — rimette solo
   * l'allenatore in condizione di rifarla — e in un elenco pubblico
   * sembrerebbe un «no» che non è stato dato.
   */
  if (decision === 'approved' || decision === 'rejected') {
    const { data: squadra } = await admin.from('teams').select('name').eq('id', req.team_id).single();
    const { data: part } = req.lot_participant_id
      ? await admin.from('lot_participants').select('session_id').eq('id', req.lot_participant_id).maybeSingle()
      : { data: null };
    await annota({
      leagueId: req.league_id,
      azione: decision === 'approved' ? 'svincolo_approvato' : 'svincolo_respinto',
      attore: await chiAgisce(auth.user.id),
      playerId: req.player_id,
      sessionId: (part?.session_id as string | undefined) ?? null,
      impronta: `svincolo_deciso:${req.id}`,
      dati: { squadra: squadra?.name ?? null, ...(note ? { nota: note } : {}) },
    });
  }

  /*
   * E la riga della coda si chiude da sé, con scritto com'è finita.
   *
   * «Svincolo gratuito da decidere» è un lavoro da fare, e deciderlo è
   * farlo: da adesso quella riga non chiede più niente. Resta scritta, fra
   * le fatte, col verbo cambiato — «Svincolo gratuito approvato · …».
   *
   * Vale anche per `cancelled`, che nel registro non finisce perché non
   * decide niente sullo svincolo: qui conta che non ci sia più niente da
   * decidere, ed è vero in tutti e tre i casi.
   */
  const [{ data: deciso }, { data: suaSquadra }] = await Promise.all([
    admin.from('players').select('name').eq('id', req.player_id).maybeSingle(),
    admin.from('teams').select('name').eq('id', req.team_id).maybeSingle(),
  ]);
  let codaNonChiusa = false;
  if (deciso?.name && suaSquadra?.name) {
    const esito = decision === 'approved' ? 'approvato'
      : decision === 'rejected' ? 'respinto' : 'annullato';
    const esitoCoda = await chiudiRigaDelloSvincolo(
      req.league_id, suaSquadra.name, deciso.name, esito,
    );
    codaNonChiusa = esitoCoda.errore || esitoCoda.chiuse === 0;
  } else {
    codaNonChiusa = true;
  }

  revalidatePath('/admin');
  revalidatePath('/');

  const messages: Record<string, string> = {
    approved: 'Approvata: rimborso al 100% e cambio di ruolo non consumato. L\'operazione è confermata.',
    rejected: 'Respinta: svincolo ordinario al 75% con il cambio consumato. L\'operazione resta valida.',
    cancelled: 'Annullata: l\'operazione è stata cancellata, l\'allenatore può rifarla con un altro giocatore.',
  };
  /*
   * Se la riga della coda non si è chiusa lo si dice, in coda al messaggio.
   * La decisione è presa e valida comunque — la coda è il promemoria del
   * travaso, non il fatto — ma l'admin deve sapere che quella riga gli
   * resterà da spuntare, altrimenti scopre il disallineamento fra un mese.
   */
  const avvisoCoda = codaNonChiusa
    ? ' La riga nella coda operativa non si è chiusa da sé: spuntala a mano.'
    : '';
  return { ok: true, message: messages[decision] + avvisoCoda };
}

// ------------------------------------------------------------- Telegram

/** Bottone di prova nel pannello admin: verifica che il bot scriva davvero. */
export async function testTelegram(): Promise<ActionState> {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sessione scaduta, rientra.' };
  const { data: team } = await db.from('team_members')
    .select('is_admin').eq('user_id', auth.user.id).maybeSingle();
  if (!team?.is_admin) return { ok: false, message: 'Serve essere admin.' };

  if (!telegramConfigured()) {
    return { ok: false, message: 'Mancano TELEGRAM_BOT_TOKEN e TELEGRAM_ADMIN_CHAT_ID.' };
  }
  const r = await notifyAdmin('🔔 *Prova* · le notifiche dell\'app Aste Flash arrivano qui\\.');
  return r.sent
    ? { ok: true, message: 'Mandato. Se non lo vedi, controlla di aver scritto almeno una volta al bot.' }
    : { ok: false, message: `Non è partito: ${r.reason}` };
}

// --------------------------------------------------------- coda operativa

/**
 * Segnare righe della coda come fatte, o rimetterle da fare.
 *
 * `admin_tasks` aveva `done` e `done_at` dal primo giorno, ma niente
 * nell'app li scriveva: la coda non si svuotava, e il 1º ottobre teneva
 * ancora quattro richieste di svincolo del 1º settembre, decise da un mese.
 * Questa è la funzione che mancava.
 *
 * Il filtro per lega sta nella `update` e non nella lettura degli id: gli id
 * arrivano dal browser, e un id di un'altra lega non deve poter essere
 * segnato nemmeno per sbaglio. È la lega di chi chiama a decidere cosa si
 * può toccare, non l'elenco che manda.
 */
export async function segnaCoda(_prev: ActionState, form: FormData): Promise<ActionState> {
  const fatto = String(form.get('fatto') ?? '') === 'si';
  const ids = String(form.get('ids') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (!ids.length) return { ok: false, message: 'Non hai scelto nessuna riga.' };
  // un tetto: la coda di una stagione sta sotto il centinaio di righe, e una
  // richiesta con diecimila id non viene da un bottone di questa pagina
  if (ids.length > 200) return { ok: false, message: 'Troppe righe in una volta.' };

  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const { data: me } = await db.from('team_members')
    .select('is_admin, league_id').eq('user_id', auth.user.id).maybeSingle();
  if (!me?.is_admin) return { ok: false, message: 'Serve essere admin.' };

  const admin = supabaseAdmin();
  const { data: toccate, error } = await admin.from('admin_tasks')
    .update({ done: fatto, done_at: fatto ? new Date().toISOString() : null })
    .in('id', ids).eq('league_id', me.league_id)
    .select('id');
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  const n = (toccate ?? []).length;
  revalidatePath('/admin');
  revalidatePath('/asta/sala');

  if (!n) return { ok: false, message: 'Non ho trovato quelle righe: ricarica la pagina.' };

  /*
   * Le quattro frasi scritte per intero, e non composte a pezzi: mettendo
   * insieme i suffissi usciva «2 righe segnate come fattae», ed è il genere
   * di storpiatura che si vede solo leggendola.
   */
  return {
    ok: true,
    message: n === 1
      ? (fatto ? '1 riga segnata come fatta.' : '1 riga rimessa fra quelle da fare.')
      : (fatto ? `${n} righe segnate come fatte.` : `${n} righe rimesse fra quelle da fare.`),
  };
}
