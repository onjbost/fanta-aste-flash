import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { refundValue, ROLE_LABEL, type Role, type PlayerStatus } from '@/lib/rules';
import { TopBar } from '../../TopBar';
import { RosterEditor } from './RosterEditor';
import { SyncForm } from './SyncForm';

export const dynamic = 'force-dynamic';

export default async function RosePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const { data: teams } = await db.from('teams')
    .select('id, name').eq('league_id', ctx.team.leagueId).order('name');

  const sp = await searchParams;
  const selected = sp.team ?? teams?.[0]?.id ?? '';

  const [{ data: contracts }, { data: credits }, { data: freeAgents }] = await Promise.all([
    db.from('contracts')
      .select('id, price, acquisition_type, players(id, name, role, club, status)')
      .eq('team_id', selected).is('released_at', null),
    db.from('v_team_credits').select('credits').eq('team_id', selected).maybeSingle(),
    db.from('v_free_agents').select('id, name, role, club, quotation')
      .order('quotation', { ascending: false }).limit(600),
  ]);

  type Row = {
    id: string; price: number; acquisition_type: string;
    players: { id: string; name: string; role: Role; club: string; status: PlayerStatus } | null;
  };
  const roster = ((contracts ?? []) as unknown as Row[])
    .filter((c) => c.players)
    .map((c) => ({
      contractId: c.id,
      playerId: c.players!.id,
      name: c.players!.name,
      role: c.players!.role,
      club: c.players!.club,
      price: c.price,
      source: c.acquisition_type,
      refund: refundValue({
        playerId: c.players!.id, name: c.players!.name, role: c.players!.role,
        club: c.players!.club, status: c.players!.status, price: c.price,
      }, ctx.cfg).value,
    }))
    .sort((a, b) => 'PDCA'.indexOf(a.role) - 'PDCA'.indexOf(b.role) || b.price - a.price);

  const composition = { P: 0, D: 0, C: 0, A: 0 };
  roster.forEach((r) => { composition[r.role] += 1; });
  const spent = roster.reduce((s, r) => s + r.price, 0);
  const teamName = teams?.find((t) => t.id === selected)?.name ?? '';

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Pannello admin</p>
      <h1>Rose</h1>
      <p className="sub">
        Correzioni a mano o ri-sincronizzazione da un nuovo export della lega.
        Ogni modifica genera il movimento di credito che la compensa e finisce nel registro.
      </p>

      <div className="filters">
        {(teams ?? []).map((t) => (
          <Link key={t.id} href={`/admin/rose?team=${t.id}`}
                className="btn" style={t.id === selected
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
            {t.name}
          </Link>
        ))}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">Crediti residui</div>
          <div className="v">{credits?.credits ?? 0}</div>
          <div className="note">{spent} spesi sulla rosa</div>
        </div>
        <div className="stat">
          <div className="k">Composizione</div>
          <div className="v">{roster.length}<small>/25</small></div>
          <div className="note">
            {(['P', 'D', 'C', 'A'] as Role[]).map((r) => `${composition[r]}${r}`).join(' · ')}
            {(composition.P !== 3 || composition.D !== 8 || composition.C !== 8 || composition.A !== 6)
              && ' · da sistemare'}
          </div>
        </div>
      </div>

      <RosterEditor
        teamId={selected}
        teamName={teamName}
        roster={roster}
        freeAgents={(freeAgents ?? []).map((p) => ({
          id: p.id, name: p.name, role: p.role as Role, club: p.club, quotation: p.quotation,
        }))}
      />

      <h2>Aggiorna da file</h2>
      <SyncForm />

      <div className="callout">
        Le correzioni sono visibili a tutta la lega nel registro: sei admin e allenatore
        insieme, quindi è giusto che gli altri possano vedere cosa hai toccato.
        {' '}Le voci usano il nome dei giocatori, non solo gli id.
      </div>
      <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
        Ruoli: {(['P', 'D', 'C', 'A'] as Role[]).map((r) => `${r} = ${ROLE_LABEL[r]}`).join(' · ')}
      </p>
    </div>
  );
}
