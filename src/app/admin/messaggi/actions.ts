'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { buildMessage } from '@/lib/messageBuilder';
import type { MessageKind } from '@/lib/messages';

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

  revalidatePath('/admin/messaggi');
  return { ok: true, message: 'Testo aggiornato con i dati di adesso.', body };
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
