'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { raccogliIndisponibili, svincoliProponibili } from '@/lib/infortuni/infortuniServer';
import { raccogliQuotazioni, raccogliVoti } from '@/lib/fonti/fontiServer';

export type InfState = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { id: m.team_id, league_id: m.league_id } : null;
}

/** Rilegge la pagina adesso, senza aspettare il mercoledì. */
export async function aggiornaIndisponibili(): Promise<InfState> {
  if (!await requireAdmin()) return { ok: false, message: 'Serve essere admin.' };

  const e = await raccogliIndisponibili();
  revalidatePath('/admin/infortuni');
  if (!e.reportId) return { ok: false, message: e.problemi.join(' · ') || 'Non ho raccolto niente.' };
  return {
    ok: true,
    message: `${e.righe} indisponibili letti, ${e.agganciate} agganciati ai nostri giocatori.`
      + (e.problemi.length ? ` — ${e.problemi.join(' · ')}` : ''),
  };
}

/**
 * Apre la richiesta di svincolo gratuito che l'app propone.
 *
 * Resta `pending`: la decide l'admin nel pannello dove decide tutte le altre.
 * L'app non approva da sé perché la stima di rientro è dedotta da una frase
 * in italiano e può sbagliare, e l'esito vale crediti veri.
 */
export async function proponiSvincolo(_prev: InfState, form: FormData): Promise<InfState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const playerId = String(form.get('playerId') ?? '');
  const proposte = await svincoliProponibili(team.league_id);
  const p = proposte.find((x) => x.playerId === playerId);
  if (!p) return { ok: false, message: 'Questa proposta non è più valida: riaggiorna la pagina.' };

  const db = supabaseAdmin();
  const { error } = await db.from('free_release_requests').insert({
    league_id: team.league_id,
    team_id: p.teamId,
    player_id: p.playerId,
    status: 'pending',
    decision_note: `Proposta dagli indisponibili: ${p.motivazione} (${p.giorni} giorni)`,
  });
  if (error) return { ok: false, message: `Non aperta: ${error.message}` };

  revalidatePath('/admin/infortuni');
  revalidatePath('/admin');
  return { ok: true, message: `Richiesta aperta per ${p.nome}: adesso la decidi dal pannello admin.` };
}

/**
 * Rilegge quotazioni e voti adesso, senza aspettare il cron della mattina.
 * Utile la prima volta, per riempire le giornate arretrate (tre per volta).
 */
export async function aggiornaFonti(): Promise<InfState> {
  if (!await requireAdmin()) return { ok: false, message: 'Serve essere admin.' };

  const [q, v] = [await raccogliQuotazioni(), await raccogliVoti()];
  revalidatePath('/admin/infortuni');
  revalidatePath('/listone');
  const problemi = [...q.problemi, ...v.problemi];
  return {
    ok: q.righe > 0 || v.giornate.length > 0,
    message: `Quotazioni: ${q.righe} lette, ${q.agganciate} agganciate. `
      + `Voti: ${v.giornate.length ? `giornate ${v.giornate.join(', ')}` : 'nessuna giornata nuova'}.`
      + (problemi.length ? ` — ${problemi.join(' · ')}` : ''),
  };
}
