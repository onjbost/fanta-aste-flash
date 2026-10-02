'use server';

import { revalidatePath } from 'next/cache';
import { importaGiornata, rifaiImport, ImportRifiutato } from '@/lib/redazione/importaServer';
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

/** Le classifiche sono un di più: si dicono quando ci sono, senza allarmare quando no. */
const classifiche = (n: number): string =>
  n ? ` · ${n} ${n === 1 ? 'classifica presa' : 'classifiche prese'} dalla lega` : '';

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
        ? `${e.competizione}: ${e.sfideScritte} sfide su ${e.sfideLette}, `
          + `${e.agganciati}/${e.giocatori} giocatori agganciati${classifiche(e.classificheScritte)}${coda}.`
        : `Nessuna sfida scritta${coda}.`,
    };
  } catch (e) {
    if (e instanceof ImportRifiutato) return { ok: false, message: e.message };
    return esito(e);
  }
}

/**
 * Manda all'app una copia corretta a mano di un import.
 *
 * Il grezzo originale non si tocca: resta in archivio com'era arrivato, e la
 * versione corretta entra come import nuovo. Se un domani l'estrattore impara
 * a leggere quel caso, si può rifare l'originale e confrontare.
 *
 * I conti li rifà comunque il server: quello che arriva da questa pagina è un
 * payload come un altro, e passa dalla stessa porta di controllo.
 */
export async function correggiImportAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get('payload') ?? ''));
    } catch {
      return { ok: false, message: 'La correzione non è arrivata leggibile, riprova.' };
    }

    const origine = String(form.get('importId') ?? '');
    const e = await importaGiornata(payload);

    if (origine) {
      await supabaseAdmin().from('redazione_imports')
        .update({ stato: 'corretto', errore: `corretto a mano · import ${e.importId}` })
        .eq('id', origine);
    }

    revalidatePath('/admin/redazione');
    revalidatePath('/admin/schedine');
    revalidatePath('/schedine/classifica');

    const coda = e.problemi.length ? ` · da guardare: ${e.problemi.join(' · ')}` : '';
    return {
      ok: e.sfideScritte > 0,
      message: e.sfideScritte
        ? `Scritte ${e.sfideScritte} sfide su ${e.sfideLette} in ${e.competizione}, `
          + `${e.agganciati}/${e.giocatori} giocatori agganciati${classifiche(e.classificheScritte)}${coda}.`
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

// =====================================================================
// Leghe Fantacalcio senza preferito
// =====================================================================

/** Salva il token incollato, dopo averlo provato con una lettura vera. */
export async function salvaTokenLegheAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const { salvaToken } = await import('@/lib/leghe/legheServer');
    const r = await salvaToken(String(form.get('token') ?? ''));
    revalidatePath('/admin/redazione');
    if (!r.ok) return { ok: false, message: `Non salvato: ${r.errore}` };
    return {
      ok: true,
      message: `Collegata${r.info.legaId ? ` alla lega ${r.info.legaId}` : ''}`
        + (r.info.scadeIl ? `, il token scade il ${new Date(r.info.scadeIl).toLocaleDateString('it-IT')}` : '')
        + `. Competizioni viste: ${r.competizioni.join(', ') || 'nessuna'}.`,
    };
  } catch (e) { return esito(e); }
}

/**
 * Legge adesso quello che il cron leggerebbe domattina: le giornate concluse
 * che mancano, con le classifiche, e le formazioni della giornata in corso.
 */
export async function importaDaLegheAction(): Promise<ActionState> {
  try {
    const { leagueId } = await requireAdmin();
    const { importaGiornateConcluse, importaFormazioni } = await import('@/lib/leghe/legheServer');
    const g = await importaGiornateConcluse();   // il pulsante non aspetta il giorno del calcolo

    // la giornata in corso: la prima di oggi o di domani, se c'è
    const oggi = new Date().toISOString().slice(0, 10);
    const { data: md } = await supabaseAdmin().from('matchdays').select('serie_a')
      .eq('league_id', leagueId).gte('match_date', oggi).order('match_date').limit(1).maybeSingle();
    const f = md ? await importaFormazioni(Number(md.serie_a)) : null;

    revalidatePath('/admin/redazione');
    const fatte = g.importate.map((x) => `${x.competizione} ${x.giornata}`).join(', ');
    const problemi = [...g.problemi, ...(f?.problemi ?? [])];
    return {
      ok: problemi.length === 0 || g.importate.length > 0 || (f?.sfide ?? 0) > 0,
      message: (fatte ? `Giornate importate: ${fatte}.` : 'Nessuna giornata conclusa da importare.')
        + (f ? ` Formazioni della ${md!.serie_a}ª di Serie A: ${f.sfide} sfide.` : '')
        + (problemi.length ? ` — ${problemi.join(' · ')}` : ''),
    };
  } catch (e) { return esito(e); }
}

/**
 * Rilegge una giornata precisa anche se l'abbiamo già: per un ricalcolo
 * fatto dalla lega in un secondo momento. L'import riscrive tabellino,
 * risultati e classifiche e richiude le schedine con i punti nuovi.
 */
export async function reimportaGiornataAction(_p: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const tipo = form.get('tipo') === 'coppa' ? 'coppa' : 'campionato';
    const giornata = Number(form.get('giornata'));
    if (!Number.isInteger(giornata) || giornata < 1) return { ok: false, message: 'Scrivi il numero della giornata.' };
    const { importaGiornateConcluse } = await import('@/lib/leghe/legheServer');
    const g = await importaGiornateConcluse({ forza: { tipo, giornata } });
    revalidatePath('/admin/redazione');
    const fatta = g.importate[0];
    if (!fatta) return { ok: false, message: g.problemi.join(' · ') || 'Non importata.' };
    return {
      ok: true,
      message: `${tipo === 'coppa' ? 'Turno di coppa' : 'Giornata'} ${giornata} riletta: `
        + `${fatta.esito.sfideScritte}/${fatta.esito.sfideLette} sfide scritte${classifiche(fatta.esito.classificheScritte)}`
        + (fatta.esito.problemi.length ? ` — ${fatta.esito.problemi.join(' · ')}` : '.'),
    };
  } catch (e) { return esito(e); }
}
