'use server';

import { revalidatePath } from 'next/cache';
import { annota } from '@/lib/registroServer';
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
  return j?.teams ? { ...j.teams, is_admin: j.is_admin, userId: auth.user.id } : null;
}

interface GiocataInviata { fixtureId: string; market: Mercato; selection: string }

type Controllate =
  | { ok: false; message: string }
  | {
    ok: true;
    team: NonNullable<Awaited<ReturnType<typeof me>>>;
    giornata: NonNullable<Awaited<ReturnType<typeof giornataCorrente>>>;
    giocate: GiocataInviata[];
    prezzo: Map<string, number>;
  };

/**
 * I controlli comuni a «Salva» e «Gioca»: chi sei, se la giornata è aperta,
 * se le giocate sono di questa giornata e nel tetto per sfida.
 *
 * Due cose che il server non si fida a prendere dal client: la **quota**, che
 * rilegge dal listino delle quote pubblicate, e la **chiusura**, che ricontrolla
 * sull'orologio. Il resto lo impone comunque il database.
 */
async function controlla(form: FormData): Promise<Controllate> {
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
  for (const g of giocate) {
    if (!prezzo.has(`${g.fixtureId}|${g.market}|${g.selection}`)) {
      return { ok: false, message: `Quota non trovata per ${g.market} ${g.selection}: ricarica la pagina.` };
    }
  }
  return { ok: true, team, giornata, giocate, prezzo };
}

/**
 * «Salva»: tiene le scelte senza giocarle. Solo quali esiti, nessun prezzo —
 * una schedina non giocata segue le quote di adesso, che il giro delle 15
 * aggiorna fino alla chiusura.
 */
export async function salvaBozza(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = await controlla(form);
  if (!c.ok) return c;
  const { error } = await supabaseAdmin().from('slip_drafts').upsert({
    team_id: c.team.id, matchday_id: c.giornata.id,
    picks: c.giocate.map((g) => ({ fixtureId: g.fixtureId, market: g.market, selection: g.selection })),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'team_id,matchday_id' });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/schedine');
  return {
    ok: true,
    message: c.giocate.length
      ? 'Bozza salvata: non è ancora giocata, le quote restano quelle di adesso.'
      : 'Bozza svuotata.',
  };
}

/**
 * «Gioca schedina»: gioca le scelte alle quote di adesso e le congela. Se per
 * la giornata c'era già una schedina giocata la sostituisce tutta — la
 * conferma la chiede la pagina, prima — e la bozza non serve più.
 */
export async function giocaSchedina(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = await controlla(form);
  if (!c.ok) return c;
  const { team, giornata, giocate, prezzo } = c;
  if (!giocate.length) return { ok: false, message: 'Scegli almeno una giocata.' };

  const righe = giocate.map((g) => ({
    fixture_id: g.fixtureId, market: g.market, selection: g.selection,
    price: prezzo.get(`${g.fixtureId}|${g.market}|${g.selection}`) as number,
  }));

  const db = await supabaseServer();
  const { data: slip, error: eS } = await db.from('slips')
    .upsert({
      league_id: team.league_id, matchday_id: giornata.id, team_id: team.id,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'matchday_id,team_id' })
    .select('id').single();
  if (eS || !slip) return { ok: false, message: eS?.message ?? 'Non sono riuscito ad aprire la schedina.' };

  const { error: eD } = await db.from('picks').delete().eq('slip_id', slip.id);
  if (eD) return { ok: false, message: eD.message };

  const { error: eI } = await db.from('picks')
    .insert(righe.map((r) => ({ ...r, slip_id: slip.id })));
  if (eI) return { ok: false, message: eI.message };

  await supabaseAdmin().from('slip_drafts').delete()
    .eq('team_id', team.id).eq('matchday_id', giornata.id);

  /*
   * Nel registro una schedina è una riga sola per giornata, non una per
   * giocata: si può rigiocare fino alla chiusura, e dieci ripensamenti
   * sarebbero dieci righe che dicono la stessa cosa. L'impronta tiene ferma
   * la riga, e `aggiorna` la riscrive coi numeri di adesso.
   */
  const quante = righe.length;
  await annota({
    leagueId: team.league_id, azione: 'schedina', impronta: `schedina:${slip.id}`, aggiorna: true,
    attore: { userId: team.userId, teamId: team.id, nome: team.name },
    dati: { giornata: giornata.fanta ?? giornata.serieA, giocate: quante },
  });

  revalidatePath('/schedine');
  revalidatePath('/');
  return {
    ok: true,
    message: `Schedina giocata: ${quante} ${quante === 1 ? 'giocata' : 'giocate'}, quote congelate. `
      + 'Puoi rigiocarla fino alla chiusura.',
  };
}
