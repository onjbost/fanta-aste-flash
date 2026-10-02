'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';

export type StemmaState = { ok: boolean; message: string } | null;

const BUCKET = 'stemmi';
const MAX_BYTE = 512 * 1024;
const TIPI: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

async function adminDellaSquadra(teamId: string) {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, league_id').eq('user_id', auth.user.id).maybeSingle();
  if (!m?.is_admin) return null;

  const { data: team } = await supabaseAdmin().from('teams')
    .select('id, league_id').eq('id', teamId).maybeSingle();
  return team && team.league_id === m.league_id ? team : null;
}

/** Toglie dal bucket tutti i file di una squadra: ce n'è al massimo uno. */
async function svuota(teamId: string) {
  const storage = supabaseAdmin().storage.from(BUCKET);
  const { data } = await storage.list(teamId);
  if (data?.length) await storage.remove(data.map((f) => `${teamId}/${f.name}`));
}

/**
 * Carica o sostituisce lo stemma di una squadra.
 *
 * Il nome del file cambia a ogni caricamento: l'indirizzo pubblico è nuovo,
 * e i telefoni che avevano in memoria lo stemma vecchio non lo ripescano.
 */
export async function caricaStemma(_prev: StemmaState, form: FormData): Promise<StemmaState> {
  const teamId = String(form.get('teamId') ?? '');
  const team = await adminDellaSquadra(teamId);
  if (!team) return { ok: false, message: 'Serve essere admin di questa lega.' };

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Scegli un\'immagine.' };
  const ext = TIPI[file.type];
  if (!ext) return { ok: false, message: 'Va bene PNG, WebP o SVG.' };
  if (file.size > MAX_BYTE) return { ok: false, message: 'L\'immagine supera i 500 KB: rimpiccioliscila.' };

  await svuota(teamId);
  const percorso = `${teamId}/${Date.now()}.${ext}`;
  const storage = supabaseAdmin().storage.from(BUCKET);
  const { error } = await storage.upload(percorso, file, { contentType: file.type, upsert: true });
  if (error) {
    return { ok: false, message: `Caricamento non riuscito: ${error.message}. Hai applicato la migrazione 0029?` };
  }

  const { data: pub } = storage.getPublicUrl(percorso);
  const { error: errUpd } = await supabaseAdmin().from('teams')
    .update({ logo_url: pub.publicUrl }).eq('id', teamId);
  if (errUpd) return { ok: false, message: `Stemma caricato ma non collegato: ${errUpd.message}` };

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Stemma aggiornato.' };
}

export async function rimuoviStemma(_prev: StemmaState, form: FormData): Promise<StemmaState> {
  const teamId = String(form.get('teamId') ?? '');
  const team = await adminDellaSquadra(teamId);
  if (!team) return { ok: false, message: 'Serve essere admin di questa lega.' };

  await svuota(teamId);
  const { error } = await supabaseAdmin().from('teams').update({ logo_url: null }).eq('id', teamId);
  if (error) return { ok: false, message: error.message };

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Stemma tolto: si vedono le iniziali.' };
}
