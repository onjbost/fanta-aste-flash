'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { giornataCorrente, sfideDiGiornata } from '@/lib/tipsterServer';
import type { Mercato } from '@/lib/tipster';

export type ActionState = { ok: boolean; message: string } | null;

async function me() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, teams(id, name, league_id)').eq('user_id', auth.user.id).maybeSingle();
  const j = m as unknown as {
    is_admin: boolean; teams: { id: string; name: string; league_id: string } | null;
  } | null;
  return j?.teams ? { ...j.teams, is_admin: j.is_admin } : null;
}

interface GiocataInviata { fixtureId: string; market: Mercato; selection: string }

/**
 * Salva la schedina della giornata: arriva l'elenco completo delle giocate e
 * sostituisce quello di prima.
 *
 * Due cose che il server non si fida a prendere dal client: la **quota**, che
 * rilegge dal listino delle quote pubblicate, e la **chiusura**, che ricontrolla
 * sull'orologio. Il resto lo impone comunque il database.
 */
export async function salvaSchedina(_prev: ActionState, form: FormData): Promise<ActionState> {
  const team = await me();
  if (!team) return { ok: false, message: 'Non risulti collegato a nessuna squadra.' };

  let giocate: GiocataInviata[];
  try {
    giocate = JSON.parse(String(form.get('giocate') ?? '[]')) as GiocataInviata[];
  } catch {
    return { ok: false, message: 'Schedina illeggibile, riprova.' };
  }

  const giornata = await giornataCorrente(team.league_id);
  if (!giornata) return { ok: false, message: 'Nessuna giornata aperta.' };
  if (!giornata.oddsPublishedAt) return { ok: false, message: 'Le quote non sono ancora pubblicate.' };
  if (new Date() >= new Date(giornata.lockAt)) {
    return { ok: false, message: 'Le schedine di questa giornata sono chiuse.' };
  }

  const admin = supabaseAdmin();
  const { data: lega } = await admin.from('leagues')
    .select('tipster_max_picks').eq('id', team.league_id).single();
  const tetto = Number(lega?.tipster_max_picks ?? 3);

  const sfide = await sfideDiGiornata(giornata.id);
  const valide = new Set(sfide.map((s) => s.id));
  const perSfida = new Map<string, number>();
  for (const g of giocate) {
    if (!valide.has(g.fixtureId)) return { ok: false, message: 'C\'è una sfida che non è di questa giornata.' };
    const n = (perSfida.get(g.fixtureId) ?? 0) + 1;
    perSfida.set(g.fixtureId, n);
    if (n > tetto) return { ok: false, message: `Massimo ${tetto} giocate per sfida.` };
  }

  // le quote non arrivano mai dal client: si rileggono qui
  const { data: quote } = await admin.from('odds')
    .select('fixture_id, market, selection, price').in('fixture_id', [...valide]);
  const prezzo = new Map((quote ?? []).map((q) =>
    [`${q.fixture_id}|${q.market}|${q.selection}`, Number(q.price)]));

  const righe = giocate.map((g) => {
    const p = prezzo.get(`${g.fixtureId}|${g.market}|${g.selection}`);
    if (p == null) throw new Error(`Quota non trovata per ${g.market} ${g.selection}`);
    return { fixture_id: g.fixtureId, market: g.market, selection: g.selection, price: p };
  });

  const db = await supabaseServer();
  const { data: slip, error: eS } = await db.from('slips')
    .upsert({ league_id: team.league_id, matchday_id: giornata.id, team_id: team.id },
            { onConflict: 'matchday_id,team_id' })
    .select('id').single();
  if (eS || !slip) return { ok: false, message: eS?.message ?? 'Non sono riuscito ad aprire la schedina.' };

  const { error: eD } = await db.from('picks').delete().eq('slip_id', slip.id);
  if (eD) return { ok: false, message: eD.message };

  if (righe.length) {
    const { error: eI } = await db.from('picks')
      .insert(righe.map((r) => ({ ...r, slip_id: slip.id })));
    if (eI) return { ok: false, message: eI.message };
  }

  revalidatePath('/schedine');
  const quante = righe.length;
  return {
    ok: true,
    message: quante === 0
      ? 'Schedina svuotata.'
      : `Schedina salvata: ${quante} ${quante === 1 ? 'giocata' : 'giocate'}. Puoi cambiarla fino alla chiusura.`,
  };
}

/**
 * Condivide (o nasconde) una schedina. Passa dal client con la sessione
 * dell'utente, quindi il database lascia toccare solo le proprie.
 */
export async function condividiSchedina(_prev: ActionState, form: FormData): Promise<ActionState> {
  const team = await me();
  if (!team) return { ok: false, message: 'Non risulti collegato a nessuna squadra.' };

  const slipId = String(form.get('slipId') ?? '');
  const condividi = String(form.get('condividi') ?? '') === 'si';

  const db = await supabaseServer();
  const { data, error } = await db.from('slips')
    .update({ shared: condividi })
    .eq('id', slipId).eq('team_id', team.id)
    .select('id');
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: 'Questa schedina non è tua.' };

  revalidatePath('/schedine');
  return {
    ok: true,
    message: condividi ? 'Schedina condivisa con la lega.' : 'Schedina di nuovo privata.',
  };
}
