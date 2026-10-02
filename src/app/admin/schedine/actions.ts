'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { generaQuote, chiudiGiornata, giornataDaRiga } from '@/lib/tipsterServer';
import { supabaseAdmin as admin } from '@/lib/supabase';
import { notifyAdminPlain } from '@/lib/telegram';
import { generaAnteprima } from '@/lib/redazione/anteprimaServer';

export type ActionState = {
  ok: boolean;
  message: string;
  /** righe di dettaglio, una per squadra: da dove viene la stima */
  dettaglio?: string[];
} | null;

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

    /*
     * Il dettaglio non è decorazione: da quando le quote tengono conto delle
     * giornate giocate, guardando solo la quota non si capisce più se una
     * squadra è favorita per la rosa o per come sta andando. Qui si vedono
     * tutti e due i numeri e quello che ne è uscito.
     */
    const { data: squadre } = await admin().from('teams')
      .select('id, name').eq('league_id', leagueId);
    const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));

    const dettaglio = [...r.stime]
      .sort((a, b) => b.mu - a.mu)
      .map((s) => {
        const nome = nomeDi.get(s.teamId) ?? '?';
        const campo = s.osservata == null
          ? 'nessuna giornata in archivio'
          : `campo ${s.osservata.toFixed(1)} su ${s.giornate} ${s.giornate === 1 ? 'giornata' : 'giornate'}`;
        return `${nome}: listone ${s.baseListone.toFixed(1)} · ${campo} → attesi ${s.mu.toFixed(1)} ± ${s.sd.toFixed(1)} fp`;
      });

    return {
      ok: true,
      message: r.sfide === 0
        ? 'Nessuna sfida da quotare: mancano gli accoppiamenti.'
        : `Quote generate col Monte Carlo (${r.simulazioni.toLocaleString('it-IT')} giornate simulate): `
          + `${r.sfide} sfide, ${r.esiti} esiti. Guardale e poi pubblicale.`,
      dettaglio: r.sfide === 0 ? undefined : dettaglio,
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

    revalidatePath('/admin/schedine');
    revalidatePath('/schedine');

    /*
     * Pubblicare e annunciare sono due cose.
     *
     * Le quote a questo punto sono già in lavagna e la lega può giocare: se
     * l'anteprima non si genera — il modello non risponde, Telegram è giù —
     * si dice com'è andata, ma non si annulla la pubblicazione. Il contrario
     * sarebbe la cosa peggiore: quote pubblicate e admin convinto di no.
     */
    const g = giornataDaRiga(md);
    try {
      const a = await generaAnteprima(matchdayId);
      const r = await notifyAdminPlain(a.testo);
      if (!r.sent) {
        return {
          ok: true,
          message: `Quote pubblicate: in lega si può giocare. L'anteprima però non è partita `
            + `su Telegram (${r.reason}): rigenerala da lì o scrivila a mano.`,
        };
      }
      const come = a.provider === 'gemini'
        ? 'scritta dal modello'
        : `a template${a.problemi.length ? ` (${a.problemi[0]})` : ''}`;
      return {
        ok: true,
        message: `Quote pubblicate: in lega si può giocare. Anteprima ${come} mandata su `
          + 'Telegram: copiala nel gruppo.',
      };
    } catch (e) {
      await notifyAdminPlain(
        `📋 QUOTE PUBBLICATE\n\nGiornata ${g.fanta} (Serie A ${g.serieA}).\n`
        + `Si gioca fino a ${new Date(g.lockAt).toLocaleString('it-IT')}.`,
      );
      return {
        ok: true,
        message: 'Quote pubblicate: in lega si può giocare. L\'anteprima non è venuta ('
          + (e as Error).message + '): su Telegram è partito l\'avviso secco.',
      };
    }
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
