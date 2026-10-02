'use server';

/**
 * PROVA DEL CRON — temporaneo, da togliere dopo il collaudo insieme alla
 * pagina e alla voce di menu.
 */

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import type { PassoProva } from '@/lib/leghe/legheServer';

export type StatoProva = { passi: PassoProva[] } | { errore: string } | null;

export async function provaCronAction(_p: StatoProva, form: FormData): Promise<StatoProva> {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { errore: 'Non autenticato.' };
  const { data: m } = await db.from('team_members').select('is_admin').eq('user_id', auth.user.id).maybeSingle();
  if (!m?.is_admin) return { errore: 'Serve essere admin.' };

  const tipo = form.get('tipo') === 'coppa' ? 'coppa' : 'campionato';
  const giornata = Number(form.get('giornata'));
  if (!Number.isInteger(giornata) || giornata < 1) return { errore: 'Scrivi il numero della giornata.' };

  const { provaCron } = await import('@/lib/leghe/legheServer');
  const passi = await provaCron(tipo, giornata);
  revalidatePath('/admin');
  return { passi };
}
