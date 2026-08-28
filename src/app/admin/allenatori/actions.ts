'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';

export type LinkState = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { leagueId: m.league_id, userId: auth.user.id } : null;
}

/**
 * Collega un account a una squadra.
 *
 * È il passaggio che prima si faceva a mano con una query SQL: adesso è un
 * menù a tendina. Il limite di due allenatori per squadra lo impone il
 * database, quindi anche se qualcosa sfuggisse all'interfaccia non passa.
 */
export async function linkCoach(_prev: LinkState, form: FormData): Promise<LinkState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const userId = String(form.get('userId') ?? '');
  const teamId = String(form.get('teamId') ?? '');
  const asAdmin = form.get('isAdmin') === 'on';
  if (!userId || !teamId) return { ok: false, message: 'Scegli account e squadra.' };

  const db = supabaseAdmin();
  const { data: team } = await db.from('teams')
    .select('id, name, league_id').eq('id', teamId).maybeSingle();
  if (!team || team.league_id !== admin.leagueId) {
    return { ok: false, message: 'Squadra non valida.' };
  }

  const { data: user } = await db.auth.admin.getUserById(userId);
  if (!user?.user) return { ok: false, message: 'Account non trovato.' };

  const { error } = await db.from('team_members').insert({
    league_id: team.league_id, team_id: teamId, user_id: userId,
    email: user.user.email, is_admin: asAdmin,
  });
  if (error) {
    if (error.message.includes('due allenatori')) {
      return { ok: false, message: `${team.name} ha già due allenatori. Togline uno prima di aggiungerne un altro.` };
    }
    if (error.code === '23505') {
      return { ok: false, message: 'Questo account è già collegato a una squadra.' };
    }
    return { ok: false, message: `Non è andata: ${error.message}` };
  }

  await db.from('audit_log').insert({
    league_id: team.league_id, actor: admin.userId, action: 'coach_linked',
    payload: { team: team.name, email: user.user.email, is_admin: asAdmin },
  });

  revalidatePath('/admin/allenatori');
  return { ok: true, message: `${user.user.email} collegato a ${team.name}.` };
}

/** Scollega un allenatore: l'account resta, semplicemente non ha più una squadra. */
export async function unlinkCoach(_prev: LinkState, form: FormData): Promise<LinkState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const memberId = String(form.get('memberId') ?? '');
  const db = supabaseAdmin();
  const { data: m } = await db.from('team_members')
    .select('id, email, league_id, user_id, teams(name)').eq('id', memberId).maybeSingle();
  if (!m || m.league_id !== admin.leagueId) return { ok: false, message: 'Collegamento non trovato.' };
  if (m.user_id === admin.userId) {
    return { ok: false, message: 'Non puoi scollegare te stesso: resteresti fuori dal pannello admin.' };
  }

  await db.from('team_members').delete().eq('id', memberId);
  await db.from('audit_log').insert({
    league_id: m.league_id, actor: admin.userId, action: 'coach_unlinked',
    payload: { email: m.email, team: (m as unknown as { teams: { name: string } | null }).teams?.name },
  });

  revalidatePath('/admin/allenatori');
  return { ok: true, message: `${m.email ?? 'Allenatore'} scollegato.` };
}

/** Dà o toglie i permessi di admin a un allenatore già collegato. */
export async function toggleAdmin(_prev: LinkState, form: FormData): Promise<LinkState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const memberId = String(form.get('memberId') ?? '');
  const db = supabaseAdmin();
  const { data: m } = await db.from('team_members')
    .select('id, is_admin, email, league_id, user_id').eq('id', memberId).maybeSingle();
  if (!m || m.league_id !== admin.leagueId) return { ok: false, message: 'Collegamento non trovato.' };
  if (m.user_id === admin.userId && m.is_admin) {
    return { ok: false, message: 'Non toglierti i permessi da solo: fatteli togliere da un altro admin.' };
  }

  await db.from('team_members').update({ is_admin: !m.is_admin }).eq('id', memberId);
  revalidatePath('/admin/allenatori');
  return {
    ok: true,
    message: `${m.email ?? 'Allenatore'} ${m.is_admin ? 'non è più admin' : 'ora è admin'}.`,
  };
}
