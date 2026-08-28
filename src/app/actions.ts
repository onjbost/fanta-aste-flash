'use server';

import { revalidatePath } from 'next/cache';
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
    // in produzione la richiesta ha sempre ragione su una variabile dimenticata
    if (!configured || (!host.startsWith('localhost') && configured.includes('localhost'))) {
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
    .select('id, is_caller, lot_id, lots(players(name))')
    .eq('team_id', team.id).eq('release_player_id', playerId).eq('status', 'confirmed')
    .maybeSingle();

  const { error } = await db.from('free_release_requests').insert({
    league_id: team.league_id, team_id: team.id, player_id: playerId,
    lot_participant_id: participation?.id ?? null,
  });
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  if (participation) {
    await admin.from('lot_participants')
      .update({ status: 'pending_approval' }).eq('id', participation.id);
  }

  const player = (contract as unknown as { players: { name: string; role: string } | null }).players;
  const target = (participation as unknown as { lots?: { players?: { name: string } } } | null)?.lots?.players?.name;
  await admin.from('admin_tasks').insert({
    league_id: team.league_id,
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
    .select('team_id').eq('user_id', auth.user.id).maybeSingle();
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

  revalidatePath('/admin');
  revalidatePath('/');

  const messages: Record<string, string> = {
    approved: 'Approvata: rimborso al 100% e cambio di ruolo non consumato. L\'operazione è confermata.',
    rejected: 'Respinta: svincolo ordinario al 75% con il cambio consumato. L\'operazione resta valida.',
    cancelled: 'Annullata: l\'operazione è stata cancellata, l\'allenatore può rifarla con un altro giocatore.',
  };
  return { ok: true, message: messages[decision] };
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
