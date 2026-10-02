'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import { updateContractPrice, removeFromRoster, addToRoster, setTeamCredits } from '@/lib/adminEdits';

export type EditState = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { id: m.team_id, league_id: m.league_id, userId: auth.user.id } : null;
}

export async function editPrice(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const r = await updateContractPrice(
    String(form.get('contractId') ?? ''),
    Number(form.get('price')),
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/rose');
  revalidatePath('/');
  return r;
}

export async function removePlayer(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const r = await removeFromRoster(
    String(form.get('contractId') ?? ''),
    form.get('refund') === 'on',
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/rose');
  revalidatePath('/');
  return r;
}

export async function addPlayer(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const r = await addToRoster(
    String(form.get('teamId') ?? ''),
    String(form.get('playerId') ?? ''),
    Number(form.get('price')),
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/rose');
  revalidatePath('/');
  return r;
}

/** Allinea i crediti di una squadra al valore dell'app ufficiale. */
export async function impostaCrediti(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const grezzo = String(form.get('crediti') ?? '').trim();
  if (grezzo === '') return { ok: false, message: 'Scrivi quanti crediti deve avere.' };
  const target = Number(grezzo);
  if (!Number.isFinite(target)) return { ok: false, message: 'Non è un numero.' };

  const r = await setTeamCredits(
    String(form.get('teamId') ?? ''),
    Math.round(target),
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/crediti');
  revalidatePath('/admin/rose');
  revalidatePath('/');
  revalidatePath('/asta');
  return r;
}
