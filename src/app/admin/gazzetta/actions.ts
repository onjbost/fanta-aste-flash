'use server';

import { revalidatePath } from 'next/cache';
import {
  generaGazzetta, salvaModifiche, segnaInviata, leggiGazzetta,
} from '@/lib/gazzetta/gazzettaServer';
import { raccogliFoto } from '@/lib/gazzetta/newsServer';
import { generaGazzettaMercato } from '@/lib/gazzetta/mercatoServer';
import { generaGazzettaChiusura } from '@/lib/gazzetta/mercatoChiusoServer';
import type { DatiPrima } from '@/lib/gazzetta/prima';
import { supabaseServer } from '@/lib/supabase';

export type GazState = { ok: boolean; message: string; id?: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { id: m.team_id as string, leagueId: m.league_id as string } : null;
}

/**
 * Scrive una prima pagina nuova.
 *
 * Ogni chiamata è una versione in più: «più cattiva» non distrugge la bozza
 * di prima, che si può sempre rileggere e mandare.
 */
export async function generaPrima(_prev: GazState, form: FormData): Promise<GazState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const matchdayId = String(form.get('matchdayId') ?? '');
  if (!matchdayId) return { ok: false, message: 'Manca la giornata.' };
  const tono = form.get('tono') ? Number(form.get('tono')) : undefined;
  const tipo = String(form.get('tipo') ?? 'settimanale') === 'coppa' ? 'coppa' as const : 'settimanale' as const;

  // la giornata dev'essere di questa lega: sotto si legge e si scrive col
  // service role, che salta la RLS
  const db = await supabaseServer();
  const { data: md } = await db.from('matchdays')
    .select('id').eq('id', matchdayId).eq('league_id', admin.leagueId).maybeSingle();
  if (!md) return { ok: false, message: 'Questa giornata non esiste.' };

  try {
    const e = await generaGazzetta(matchdayId, { tono, tipo });
    revalidatePath('/admin/gazzetta');
    const problemi = e.verifica.problemi;
    return {
      ok: true, id: e.gazzettaId,
      message: `Versione ${e.versione} scritta da ${e.provider}`
        + (e.tentativi > 1 ? ` in ${e.tentativi} tentativi` : '')
        + (problemi.length ? ` — da controllare: ${problemi.join(' · ')}` : '.'),
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * Le correzioni dell'admin.
 *
 * I testi arrivano come JSON e non campo per campo: la pagina ha un numero
 * di caselle che dipende da quante partite ci sono, e ricostruirle da un
 * `FormData` piatto vorrebbe dire inventarsi una convenzione sui nomi che
 * poi va tenuta d'accordo con l'editor.
 */
export async function salvaPrima(_prev: GazState, form: FormData): Promise<GazState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const id = String(form.get('id') ?? '');
  if (!id) return { ok: false, message: 'Manca la gazzetta.' };

  let dati: DatiPrima;
  try {
    dati = JSON.parse(String(form.get('dati') ?? '')) as DatiPrima;
  } catch {
    return { ok: false, message: 'Non ho capito i dati della pagina.' };
  }
  // che esista e che sia di questa lega: qui sotto si scrive col service
  // role, che salta la RLS — il controllo che il database farebbe da sé va
  // rifatto a mano, ed è l'unica ragione per cui questa riga esiste
  const esistente = await leggiGazzetta(id);
  if (!esistente || esistente.leagueId !== admin.leagueId) {
    return { ok: false, message: 'Questa gazzetta non esiste.' };
  }

  try {
    await salvaModifiche(id, dati);
    revalidatePath('/admin/gazzetta');
    return { ok: true, id, message: 'Salvata.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function segnaMandata(_prev: GazState, form: FormData): Promise<GazState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const id = String(form.get('id') ?? '');
  if (!id) return { ok: false, message: 'Manca la gazzetta.' };
  const esistente = await leggiGazzetta(id);
  if (!esistente || esistente.leagueId !== admin.leagueId) {
    return { ok: false, message: 'Questa gazzetta non esiste.' };
  }
  await segnaInviata(id);
  revalidatePath('/admin/gazzetta');
  return { ok: true, id, message: 'Segnata come mandata.' };
}

/**
 * Rilegge le news adesso, senza aspettare il mercoledì.
 *
 * Stesso bottone della pagina degli indisponibili, e per la stessa ragione:
 * il cron riempie l'indice una volta a settimana, e chi prova la Gazzetta
 * per la prima volta si trova davanti una griglia vuota senza capire
 * perché.
 */
export async function aggiornaFoto(_prev: GazState, _form: FormData): Promise<GazState> {
  if (!await requireAdmin()) return { ok: false, message: 'Serve essere admin.' };

  const e = await raccogliFoto();
  revalidatePath('/admin/gazzetta');
  return {
    ok: e.nuovi > 0 || e.problemi.length === 0,
    message: `${e.nuovi} foto nuove su ${e.trovati} articoli letti.`
      + (e.problemi.length ? ` — ${e.problemi.join(' · ')}` : ''),
  };
}

/**
 * Le indiscrezioni di mercato: una sessione d'asta, non una giornata.
 *
 * Sta in un'azione a sé e non dentro `generaPrima` perché il materiale viene
 * da tutt'altra parte — il tabellone d'asta invece dei tabellini — e
 * infilarci un `if` avrebbe voluto dire una funzione che fa due mestieri e
 * ne sbaglia uno.
 */
export async function generaRumors(_prev: GazState, form: FormData): Promise<GazState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const sessionId = String(form.get('sessionId') ?? '');
  if (!sessionId) return { ok: false, message: 'Manca la sessione.' };
  const tono = form.get('tono') ? Number(form.get('tono')) : undefined;

  // la sessione dev'essere di questa lega: sotto si legge col service role
  const db = await supabaseServer();
  const { data: s } = await db.from('auction_sessions')
    .select('id').eq('id', sessionId).eq('league_id', admin.leagueId).maybeSingle();
  if (!s) return { ok: false, message: 'Questa sessione non esiste.' };

  try {
    const e = await generaGazzettaMercato(sessionId, { tono });
    revalidatePath('/admin/gazzetta');
    const problemi = e.verifica.problemi;
    return {
      ok: true, id: e.gazzettaId,
      message: `Versione ${e.versione} scritta da ${e.provider}`
        + (e.tentativi > 1 ? ` in ${e.tentativi} tentativi` : '')
        + (problemi.length ? ` — da controllare: ${problemi.join(' · ')}` : '.'),
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * Il mercato chiuso: le stesse aste delle indiscrezioni, ma a cose fatte.
 *
 * Gli scambi arrivano dal form come una lista di id spuntati. Se non ne
 * arriva nessuno **non** si ripiega sulla scelta automatica: vorrebbe dire
 * rimettere dentro quello che l'admin ha appena tolto, e una pagina che
 * ignora le spunte è peggio di una senza scambi. Il campo nascosto
 * «scambiPresenti» distingue «non ne ho scelto nessuno» da «questo form non
 * li chiedeva affatto».
 */
export async function generaChiusura(_prev: GazState, form: FormData): Promise<GazState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const sessionId = String(form.get('sessionId') ?? '');
  if (!sessionId) return { ok: false, message: 'Manca la sessione.' };
  const tono = form.get('tono') ? Number(form.get('tono')) : undefined;
  const scambi = form.get('scambiPresenti')
    ? form.getAll('scambi').map(String).filter(Boolean)
    : undefined;

  const db = await supabaseServer();
  const { data: s } = await db.from('auction_sessions')
    .select('id').eq('id', sessionId).eq('league_id', admin.leagueId).maybeSingle();
  if (!s) return { ok: false, message: 'Questa sessione non esiste.' };

  try {
    const e = await generaGazzettaChiusura(sessionId, { tono, scambi });
    revalidatePath('/admin/gazzetta');
    const problemi = e.verifica.problemi;
    return {
      ok: true, id: e.gazzettaId,
      message: `Versione ${e.versione} scritta da ${e.provider}`
        + (e.tentativi > 1 ? ` in ${e.tentativi} tentativi` : '')
        + (problemi.length ? ` — da controllare: ${problemi.join(' · ')}` : '.'),
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
