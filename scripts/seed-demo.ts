/**
 * Dati di prova per vedere l'app funzionare prima dell'asta del 1° settembre.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Crea la lega, il calendario, 8 squadre, un listone finto di 320 giocatori e
 * 8 rose complete da 25 con prezzi coerenti (500 crediti a squadra).
 * Non tocca niente se la lega esiste già con delle rose dentro.
 */
import { createClient } from '@supabase/supabase-js';
import { CALENDAR } from './calendar';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TEAMS = [
  'Montester United', 'Real Sballo', 'Atletico Divano', 'Deportivo Mansarda',
  'Borussia Panchina', 'Inter Rotta', 'Sporting Ritardo', 'Bayern Mancano',
];

const CLUBS = ['Inter', 'Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Bologna',
  'Fiorentina', 'Torino', 'Udinese', 'Genoa', 'Como', 'Verona', 'Cagliari', 'Lecce',
  'Parma', 'Empoli', 'Monza', 'Venezia'];

const COGNOMI = ['ROSSI', 'BIANCHI', 'FERRARI', 'ESPOSITO', 'RUSSO', 'COLOMBO', 'RICCI', 'MARINO',
  'GRECO', 'BRUNO', 'GALLO', 'CONTI', 'DE LUCA', 'MANCINI', 'COSTA', 'GIORDANO', 'RIZZO', 'LOMBARDI',
  'BARBIERI', 'FONTANA', 'SANTORO', 'MARIANI', 'RINALDI', 'CARUSO', 'FERRARA', 'GALLI', 'MARTINI',
  'LEONE', 'LONGO', 'GENTILE', 'MARTINELLI', 'VITALE', 'LOMBARDO', 'SERRA', 'CONTE', 'FIORE',
  'DE SANTIS', 'COPPOLA', 'D AMICO', 'SALA'];

const ROLE_PLAN: { role: 'P' | 'D' | 'C' | 'A'; count: number; roster: number }[] = [
  { role: 'P', count: 40, roster: 3 },
  { role: 'D', count: 110, roster: 8 },
  { role: 'C', count: 110, roster: 8 },
  { role: 'A', count: 60, roster: 6 },
];

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

async function main() {
  const rand = rng(42);

  let { data: league } = await db.from('leagues').select('*').limit(1).maybeSingle();
  if (!league) {
    const { data, error } = await db.from('leagues')
      .insert({ name: 'Fanta Mansarda', season: '2026/2027' }).select().single();
    if (error) throw error;
    league = data;
    await db.from('auction_sessions').insert(CALENDAR.map((c) => ({
      league_id: league!.id, number: c.number, auction_at: c.at,
      excludes_new_signings: c.winterWindow, status: 'scheduled',
    })));
  }

  const { count } = await db.from('contracts')
    .select('id', { count: 'exact', head: true }).eq('league_id', league.id);
  if ((count ?? 0) > 0) {
    console.log('Ci sono già dei contratti: non tocco niente.');
    return;
  }

  // squadre
  const { data: teams, error: tErr } = await db.from('teams').upsert(
    TEAMS.map((name, i) => ({
      league_id: league!.id, name, manager_name: name.split(' ')[0],
      email: `allenatore${i + 1}@esempio.it`, is_admin: i === 0,
    })), { onConflict: 'league_id,name' },
  ).select();
  if (tErr) throw tErr;

  // listone finto
  const players: Record<string, unknown>[] = [];
  let n = 0;
  for (const plan of ROLE_PLAN) {
    for (let i = 0; i < plan.count; i++) {
      n++;
      const base = plan.role === 'A' ? 12 : plan.role === 'C' ? 8 : plan.role === 'D' ? 6 : 5;
      players.push({
        league_id: league.id, ext_id: `demo-${n}`,
        name: `${COGNOMI[n % COGNOMI.length]} ${plan.role}${i + 1}`,
        role: plan.role, club: CLUBS[n % CLUBS.length],
        quotation: Math.max(1, Math.round(base * (0.4 + rand() * 2.2))),
        signing_window: i % 25 === 0 ? 'winter' : 'summer',
        status: i % 40 === 7 ? 'injured_long' : i % 60 === 13 ? 'out_of_serie_a' : 'active',
      });
    }
  }
  for (let i = 0; i < players.length; i += 500) {
    const { error } = await db.from('players').upsert(players.slice(i, i + 500), { onConflict: 'league_id,ext_id' });
    if (error) throw error;
  }
  const { data: saved } = await db.from('players').select('id, role, quotation').eq('league_id', league.id);

  // rose: ogni squadra pesca dal proprio blocco, prezzi normalizzati a ~490 crediti
  const pool: Record<string, { id: string; quotation: number }[]> = { P: [], D: [], C: [], A: [] };
  (saved ?? []).forEach((p) => pool[p.role as 'P'].push({ id: p.id, quotation: p.quotation }));
  Object.values(pool).forEach((list) => list.sort(() => rand() - 0.5));

  const contracts: Record<string, unknown>[] = [];
  const movements: Record<string, unknown>[] = [];

  (teams ?? []).forEach((team, ti) => {
    const picks: { id: string; quotation: number }[] = [];
    ROLE_PLAN.forEach((plan) => {
      const slice = pool[plan.role].slice(ti * plan.roster, ti * plan.roster + plan.roster);
      picks.push(...slice);
    });
    const rawTotal = picks.reduce((s, p) => s + p.quotation, 0);
    const target = 470 + Math.floor(rand() * 25);
    let spent = 0;
    picks.forEach((p, i) => {
      const price = i === picks.length - 1
        ? Math.max(1, target - spent)
        : Math.max(1, Math.round((p.quotation / rawTotal) * target));
      spent += price;
      contracts.push({
        league_id: league!.id, team_id: team.id, player_id: p.id,
        price, acquisition_type: 'initial_auction',
      });
    });
    movements.push(
      { league_id: league!.id, team_id: team.id, amount: league!.initial_credits, reason: 'initial', note: 'Budget iniziale' },
      { league_id: league!.id, team_id: team.id, amount: -spent, reason: 'purchase', note: 'Asta iniziale' },
    );
  });

  const { error: cErr } = await db.from('contracts').insert(contracts);
  if (cErr) throw cErr;
  const { error: mErr } = await db.from('credit_movements').insert(movements);
  if (mErr) throw mErr;

  console.log(`Fatto: ${TEAMS.length} squadre, ${players.length} giocatori, ${contracts.length} contratti.`);
  console.log('Collega il tuo utente alla squadra admin con:');
  console.log(`  update teams set user_id = '<il tuo auth.users.id>' where name = 'Montester United';`);
}

main().catch((e) => { console.error(e); process.exit(1); });
