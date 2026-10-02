'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import type { PassoGiro } from '@/lib/leghe/legheServer';

export type StatoGiro = { passi: PassoGiro[]; esito: 'ok' | 'ko' | 'info' } | { errore: string } | null;

async function admin(): Promise<boolean> {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const { data: m } = await db.from('team_members').select('is_admin').eq('user_id', auth.user.id).maybeSingle();
  return Boolean(m?.is_admin);
}

/**
 * Importa una giornata: se la lega l'ha già calcolata la importa e basta,
 * altrimenti prima la calcola (solo a partite finite) e poi la importa.
 * Il giro finisce nel registro come ogni giro del cron.
 */
export async function importaGiornataAction(_p: StatoGiro, form: FormData): Promise<StatoGiro> {
  if (!await admin()) return { errore: 'Serve essere admin.' };
  const tipo = form.get('tipo') === 'coppa' ? 'coppa' : 'campionato';
  const giornata = Number(form.get('giornata'));
  if (!Number.isInteger(giornata) || giornata < 1) return { errore: 'Scrivi il numero della giornata.' };

  const { importaGiornateConcluse } = await import('@/lib/leghe/legheServer');
  try {
    const g = await importaGiornateConcluse({ forza: { tipo, giornata }, calcola: true, origine: 'manuale' });
    revalidatePath('/admin/pannello');
    const voce = g.registro[0];
    if (!voce) return { errore: g.problemi.join(' · ') || 'Giornata non trovata nel calendario della lega.' };
    return { passi: voce.passi, esito: voce.esito };
  } catch (e) {
    return { errore: (e as Error).message };
  }
}
