'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { buildMessage } from '@/lib/messageBuilder';
import { archiveMessage } from '@/lib/telegram';
import { msgTrade, type MessageKind } from '@/lib/messages';

export type MsgState = { ok: boolean; message: string; body?: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { id: m.team_id, league_id: m.league_id } : null;
}

/** Rigenera il testo dai dati attuali della sessione e lo salva come bozza. */
export async function generateMessage(_prev: MsgState, form: FormData): Promise<MsgState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const sessionId = String(form.get('sessionId') ?? '');
  const kind = String(form.get('kind') ?? '') as MessageKind;
  const body = await buildMessage(sessionId, kind);
  if (!body) return { ok: false, message: 'Non ci sono dati sufficienti per questo messaggio.' };

  const db = supabaseAdmin();
  await db.from('messages').insert({
    league_id: team.league_id, session_id: sessionId, kind, body,
  });

  const { data: session } = await db.from('auction_sessions')
    .select('number').eq('id', sessionId).single();
  const tg = await archiveMessage(kind, session?.number ?? 0, body);

  revalidatePath('/admin/messaggi');
  return {
    ok: true,
    message: tg.sent
      ? 'Testo aggiornato e mandato su Telegram.'
      : 'Testo aggiornato con i dati di adesso.',
    body,
  };
}

/**
 * Rubrica fantacalciomercato: l'annuncio di uno scambio già chiuso fra due
 * squadre. Non tocca rose, contratti né crediti — l'app non gestisce gli
 * scambi, li racconta soltanto. Il registro resta Leghe Fantacalcio.
 */
export async function generateTrade(_prev: MsgState, form: FormData): Promise<MsgState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const testo = (k: string) => String(form.get(k) ?? '').trim();
  const fromTeam = testo('fromTeam');
  const fromPlayer = testo('fromPlayer');
  const toTeam = testo('toTeam');
  const toPlayer = testo('toPlayer');

  if (!fromTeam || !toTeam) return { ok: false, message: 'Scegli tutte e due le squadre.' };
  if (fromTeam === toTeam) {
    return { ok: false, message: 'Le due squadre devono essere diverse: uno scambio con sé stessi non esiste.' };
  }
  if (!fromPlayer || !toPlayer) {
    return { ok: false, message: 'Scrivi il giocatore ceduto da ciascuna delle due squadre.' };
  }

  // Il conguaglio è facoltativo: vuoto e zero significano «alla pari».
  const grezzo = testo('settlement');
  const settlement = grezzo === '' ? 0 : Number(grezzo);
  if (!Number.isInteger(settlement) || settlement < 0) {
    return { ok: false, message: 'Il conguaglio è un numero intero di crediti, oppure niente.' };
  }

  const body = msgTrade({
    fromTeam, fromPlayer, toTeam, toPlayer,
    settlement,
    settlementPayer: form.get('settlementPayer') === 'to' ? 'to' : 'from',
  });

  const db = supabaseAdmin();
  await db.from('messages').insert({
    league_id: team.league_id, session_id: null, kind: 'trade', body,
  });
  const tg = await archiveMessage('trade', null, body);

  revalidatePath('/admin/messaggi');
  return {
    ok: true,
    message: tg.sent ? 'Annuncio pronto e mandato su Telegram.' : 'Annuncio pronto.',
    body,
  };
}

/** Segna un messaggio come mandato, così sai a che punto sei. */
export async function markSent(_prev: MsgState, form: FormData): Promise<MsgState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const db = supabaseAdmin();
  await db.from('messages')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', String(form.get('messageId') ?? ''));

  revalidatePath('/admin/messaggi');
  return { ok: true, message: 'Segnato come inviato.' };
}
