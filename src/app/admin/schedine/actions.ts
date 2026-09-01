'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { generaQuote, chiudiGiornata, giornataDaRiga } from '@/lib/tipsterServer';
import { notifyAdminPlain } from '@/lib/telegram';

export type ActionState = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('Non autenticato.');
  const { data: m } = await db.from('team_members')
    .select('is_admin, teams(league_id)').eq('user_id', auth.user.id).maybeSingle();
  const j = m as unknown as { is_admin: boolean; teams: { league_id: string } | null } | null;
  if (!j?.is_admin || !j.teams) throw new Error('Serve essere admin.');
  return { leagueId: j.teams.league_id };
}

const esito = (e: unknown): ActionState =>
  ({ ok: false, message: e instanceof Error ? e.message : String(e) });

/** Genera le quote della giornata leggendo le rose di adesso. */
export async function generaQuoteAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { leagueId } = await requireAdmin();
    const matchdayId = String(form.get('matchdayId'));
    const r = await generaQuote(leagueId, matchdayId);
    revalidatePath('/admin/schedine');
    return {
      ok: true,
      message: r.sfide === 0
        ? 'Nessuna sfida da quotare: mancano gli accoppiamenti.'
        : `Quote generate: ${r.sfide} sfide, ${r.esiti} esiti. Guardale e poi pubblicale.`,
    };
  } catch (e) { return esito(e); }
}

/** Pubblica: da qui in poi le quote sono visibili in lega e si può giocare. */
export async function pubblicaQuote(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const matchdayId = String(form.get('matchdayId'));
    const db = supabaseAdmin();
    const { data: md } = await db.from('matchdays').select('*').eq('id', matchdayId).single();
    if (!md) return { ok: false, message: 'Giornata inesistente.' };

    const { count } = await db.from('odds').select('id', { count: 'exact', head: true })
      .in('fixture_id', (await db.from('fixtures').select('id').eq('matchday_id', matchdayId))
        .data?.map((f) => f.id) ?? []);
    if (!count) return { ok: false, message: 'Genera prima le quote.' };

    await db.from('matchdays')
      .update({ odds_published_at: new Date().toISOString(), status: 'open' })
      .eq('id', matchdayId);

    const g = giornataDaRiga(md);
    await notifyAdminPlain(
      `📋 QUOTE PUBBLICATE\n\nGiornata ${g.fanta} (Serie A ${g.serieA}).\n`
      + `Si gioca fino a ${new Date(g.lockAt).toLocaleString('it-IT')}.`,
    );

    revalidatePath('/admin/schedine');
    revalidatePath('/schedine');
    return { ok: true, message: 'Quote pubblicate: in lega si può giocare.' };
  } catch (e) { return esito(e); }
}

/** Risultati di una sfida: gol e, se li hai, i fantapunti. */
export async function salvaRisultato(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const fixtureId = String(form.get('fixtureId'));
    const num = (k: string) => {
      const v = String(form.get(k) ?? '').trim().replace(',', '.');
      return v === '' ? null : Number(v);
    };
    const golCasa = num('golCasa');
    const golOspite = num('golOspite');
    if (golCasa == null || golOspite == null) return { ok: false, message: 'Servono tutti e due i gol.' };
    if (!Number.isInteger(golCasa) || !Number.isInteger(golOspite) || golCasa < 0 || golOspite < 0) {
      return { ok: false, message: 'I gol sono numeri interi non negativi.' };
    }

    const db = supabaseAdmin();
    const { error } = await db.from('fixtures').update({
      home_goals: golCasa, away_goals: golOspite,
      home_fp: num('fpCasa'), away_fp: num('fpOspite'),
      settled_at: new Date().toISOString(),
    }).eq('id', fixtureId);
    if (error) return { ok: false, message: error.message };

    revalidatePath('/admin/schedine');
    return { ok: true, message: `Risultato salvato: ${golCasa}-${golOspite}.` };
  } catch (e) { return esito(e); }
}

/** Chiude la giornata: risolve le giocate e aggiorna le classifiche. */
export async function chiudiGiornataAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const matchdayId = String(form.get('matchdayId'));
    const r = await chiudiGiornata(matchdayId);
    revalidatePath('/admin/schedine');
    revalidatePath('/schedine/classifica');
    return {
      ok: true,
      message: `${r.schedine} schedine, ${r.giocate} giocate, ${r.azzeccate} azzeccate`
        + (r.inAttesa ? ` · ${r.inAttesa} in attesa di un risultato` : '') + '.',
    };
  } catch (e) { return esito(e); }
}

/** Sposta la prima partita del turno: la chiusura la segue da sola. */
export async function cambiaOrario(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const matchdayId = String(form.get('matchdayId'));
    const quando = String(form.get('firstKickoffAt') ?? '');
    if (!quando) return { ok: false, message: 'Metti data e ora.' };
    const db = supabaseAdmin();
    const { error } = await db.from('matchdays')
      .update({ first_kickoff_at: new Date(quando).toISOString() }).eq('id', matchdayId);
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/schedine');
    return { ok: true, message: 'Orario aggiornato: la chiusura si è spostata di conseguenza.' };
  } catch (e) { return esito(e); }
}

/** Rinvio di una partita di Serie A, con la politica scelta. */
export async function segnaRinvio(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = String(form.get('serieAFixtureId'));
    const stato = String(form.get('stato'));   // scheduled | postponed
    const policy = String(form.get('policy') || '') || null;

    const db = supabaseAdmin();
    const { error } = await db.from('serie_a_fixtures').update({
      status: stato,
      policy: stato === 'postponed' ? policy : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return { ok: false, message: error.message };

    revalidatePath('/admin/schedine');
    return {
      ok: true,
      message: stato === 'postponed'
        ? `Partita segnata come rinviata (${policy === 'six' ? '6 politico' : 'si aspetta il recupero'}). Rigenera le quote.`
        : 'Partita rimessa in programma. Rigenera le quote.',
    };
  } catch (e) { return esito(e); }
}

/** Accoppiamenti di semifinale e finale, decisi a mano. */
export async function accoppiaCoppa(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const fixtureId = String(form.get('fixtureId'));
    const casa = String(form.get('casa') || '') || null;
    const ospite = String(form.get('ospite') || '') || null;
    if (casa && ospite && casa === ospite) {
      return { ok: false, message: 'Una squadra non gioca contro sé stessa.' };
    }
    const db = supabaseAdmin();
    const { error } = await db.from('fixtures')
      .update({ home_team_id: casa, away_team_id: ospite }).eq('id', fixtureId);
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/schedine');
    return { ok: true, message: 'Accoppiamento salvato. Rigenera le quote per quotarlo.' };
  } catch (e) { return esito(e); }
}
