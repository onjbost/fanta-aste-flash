'use server';

import { revalidatePath } from 'next/cache';
import { rifaiImport, ImportRifiutato } from '@/lib/redazione/importaServer';
import { generaArticolo, segnaInviato } from '@/lib/redazione/redazioneServer';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
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

// =====================================================================
// Import
// =====================================================================

/**
 * Ripassa un import già salvato con il codice di adesso.
 *
 * È la ragione per cui `redazione_imports` esiste: quando l'estrattore
 * inciampa su un caso storto lo si corregge e si ripreme questo pulsante,
 * invece di chiedere all'admin di riaprire la lega e ricopiare la giornata.
 */
export async function rifaiImportAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const e = await rifaiImport(String(form.get('importId')));

    revalidatePath('/admin/redazione');
    revalidatePath('/admin/schedine');
    revalidatePath('/schedine/classifica');

    const coda = e.problemi.length ? ` · ${e.problemi.length} da guardare` : '';
    return {
      ok: e.sfideScritte > 0,
      message: e.sfideScritte
        ? `${e.sfideScritte} sfide su ${e.sfideLette}, ${e.agganciati}/${e.giocatori} giocatori agganciati${coda}.`
        : `Nessuna sfida scritta${coda}.`,
    };
  } catch (e) {
    if (e instanceof ImportRifiutato) return { ok: false, message: e.message };
    return esito(e);
  }
}

/** Mette da parte un import senza cancellarlo: il grezzo resta. */
export async function scartaImportAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const motivo = String(form.get('motivo') || '').trim() || 'messo da parte a mano';
    const db = supabaseAdmin();
    const { error } = await db.from('redazione_imports')
      .update({ stato: 'scartato', errore: motivo }).eq('id', String(form.get('importId')));
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/redazione');
    return { ok: true, message: 'Messo da parte. Il grezzo resta: si può sempre rifare.' };
  } catch (e) { return esito(e); }
}

// =====================================================================
// Il pezzo
// =====================================================================

/**
 * Scrive il pezzo della giornata. `tono` arriva dai pulsanti «più cattivo» e
 * «più morbido»: ogni pressione è una versione nuova, quella di prima resta.
 */
export async function scriviPezzoAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const matchdayId = String(form.get('matchdayId'));
    const grezzo = String(form.get('tono') || '');
    const tono = grezzo ? Number(grezzo) : undefined;

    const e = await generaArticolo(matchdayId, { tono });
    revalidatePath('/admin/redazione');

    const chi = e.provider === 'gemini' ? `${e.modello}` : 'i template di riserva';
    if (!e.verifica.ok) {
      return {
        ok: false,
        message: `Versione ${e.versione} scritta con ${chi}, ma la verifica ha trovato: `
          + e.verifica.problemi.join(' · ') + '. Rileggila prima di mandarla.',
      };
    }
    return {
      ok: true,
      message: `Versione ${e.versione} pronta: ${e.spunti} spunti, scritta con ${chi}`
        + (e.tentativi > 1 ? ` al ${e.tentativi}° tentativo` : '') + '.',
    };
  } catch (e) { return esito(e); }
}

/** Manda la bozza su Telegram, da dove la copi nel gruppo. */
export async function inviaPezzoAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = String(form.get('articoloId'));
    const db = supabaseAdmin();
    const { data: art } = await db.from('news_articles')
      .select('testo, versione').eq('id', id).single();
    if (!art) return { ok: false, message: 'Articolo inesistente.' };

    const r = await notifyAdminPlain(art.testo as string);
    if (!r.sent) return { ok: false, message: `Telegram non l'ha preso: ${r.reason}` };

    await segnaInviato(id);
    revalidatePath('/admin/redazione');
    return {
      ok: true,
      message: `Versione ${art.versione} mandata su Telegram`
        + (r.parts && r.parts > 1 ? ` in ${r.parts} parti` : '') + ': copiala nel gruppo.',
    };
  } catch (e) { return esito(e); }
}

// =====================================================================
// I soprannomi
// =====================================================================

/**
 * La scheda di una squadra: come la chiami, cosa rinfacciarle e — importante
 * col tono alto — di cosa non si scherza.
 */
export async function salvaFlavourAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { leagueId } = await requireAdmin();
    const teamId = String(form.get('teamId'));
    const testo = (k: string) => {
      const v = String(form.get(k) ?? '').trim();
      return v === '' ? null : v;
    };
    const soprannomi = String(form.get('soprannomi') ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);

    const db = supabaseAdmin();
    const { error } = await db.from('team_flavour').upsert({
      team_id: teamId, league_id: leagueId, soprannomi,
      tormentoni: testo('tormentoni'),
      punti_deboli: testo('puntiDeboli'),
      intoccabile: testo('intoccabile'),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id' });
    if (error) return { ok: false, message: error.message };

    revalidatePath('/admin/redazione');
    return { ok: true, message: 'Scheda salvata.' };
  } catch (e) { return esito(e); }
}

/** Il tono di base e il minimo di parole, che valgono per tutta la lega. */
export async function salvaImpostazioniAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { leagueId } = await requireAdmin();
    const tono = Number(form.get('tono'));
    const minParole = Number(form.get('minParole'));
    if (!Number.isInteger(tono) || tono < 1 || tono > 5) {
      return { ok: false, message: 'Il tono va da 1 a 5.' };
    }
    if (!Number.isInteger(minParole) || minParole < 40 || minParole > 600) {
      return { ok: false, message: 'Le parole per sfida vanno da 40 a 600.' };
    }
    const vietate = String(form.get('vietate') ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    const db = supabaseAdmin();
    const { error } = await db.from('leagues').update({
      redazione_tono: tono, redazione_min_parole: minParole, redazione_parole_vietate: vietate,
    }).eq('id', leagueId);
    if (error) return { ok: false, message: error.message };

    revalidatePath('/admin/redazione');
    return { ok: true, message: 'Impostazioni salvate.' };
  } catch (e) { return esito(e); }
}
