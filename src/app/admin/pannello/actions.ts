'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import type { PassoGiro } from '@/lib/leghe/legheServer';
import type { AnteprimaRose } from '@/lib/leghe/roseServer';

export type StatoGiro = { passi: PassoGiro[]; esito: 'ok' | 'ko' | 'info' } | { errore: string } | null;

/** L'utente, se è admin. */
async function admin(): Promise<string | null> {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members').select('is_admin').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? auth.user.id : null;
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

function aggiornaPagine() {
  for (const p of ['/admin/pannello', '/admin/rose', '/admin/crediti', '/listone', '/rosa', '/asta', '/']) revalidatePath(p);
}

export type StatoListone = { ok: boolean; messaggio: string; dettagli: string[] } | null;

/** Il listone e gli svincolati, letti adesso da Leghe Fantacalcio. */
export async function aggiornaListoneAction(): Promise<StatoListone> {
  const chi = await admin();
  if (!chi) return { ok: false, messaggio: 'Serve essere admin.', dettagli: [] };
  const { aggiornaListoneDallaLega } = await import('@/lib/leghe/roseServer');
  try {
    const r = await aggiornaListoneDallaLega(chi);
    aggiornaPagine();
    return r;
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message, dettagli: [] };
  }
}

export type StatoRose = (AnteprimaRose & { applicate?: boolean; dettagli?: string[] }) | null;

/**
 * Le rose da Leghe Fantacalcio: chi c'è, a che costo, con quanti crediti.
 * Senza conferma mostra soltanto le differenze; con la conferma le copia,
 * anche quelle che riguardano giocatori mossi di recente nell'app (che il
 * cron invece salta).
 */
export async function aggiornaRoseAction(_p: StatoRose, form: FormData): Promise<StatoRose> {
  const chi = await admin();
  if (!chi) return { ok: false, messaggio: 'Serve essere admin.', conflitti: [], problemi: [], cambi: 0 };
  const { anteprimaRoseDallaLega, aggiornaRoseDallaLega } = await import('@/lib/leghe/roseServer');
  try {
    if (form.get('conferma') !== 'on') {
      // al browser solo l'anteprima, non il listone intero
      const a = await anteprimaRoseDallaLega();
      return {
        ok: a.ok, messaggio: a.messaggio, differenze: a.differenze, checks: a.checks,
        conflitti: a.conflitti, problemi: a.problemi, cambi: a.cambi,
      };
    }
    const r = await aggiornaRoseDallaLega({ actor: chi, automatico: false });
    aggiornaPagine();
    return r;
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message, conflitti: [], problemi: [], cambi: 0 };
  }
}
