import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { TopBar } from '../../TopBar';
import { LinkForm, MemberRow } from './LinkForm';

export const dynamic = 'force-dynamic';

export default async function AllenatoriPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const [{ data: teams }, { data: members }, users] = await Promise.all([
    db.from('teams').select('id, name').eq('league_id', ctx.team.leagueId).order('name'),
    db.from('team_members').select('id, team_id, user_id, email, is_admin, created_at')
      .eq('league_id', ctx.team.leagueId),
    db.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const linked = new Set((members ?? []).map((m) => m.user_id));
  const scollegati = (users.data?.users ?? [])
    .filter((u) => !linked.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email ?? '(senza email)',
      lastSignIn: u.last_sign_in_at ?? null,
    }));

  const perTeam = (teams ?? []).map((t) => ({
    ...t,
    members: (members ?? []).filter((m) => m.team_id === t.id),
  }));
  const conPosto = perTeam.filter((t) => t.members.length < 2);

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Pannello admin</p>
      <h1>Allenatori</h1>
      <p className="sub">
        Ogni squadra può averne due: vedono la stessa rosa, gli stessi crediti e gli
        stessi cambi, e possono entrambi chiamare, aderire e rilanciare. Per il mercato
        sono una squadra sola.
      </p>

      <h2>Da collegare</h2>
      {scollegati.length === 0 ? (
        <div className="panel">
          <div className="empty">
            Nessun account in attesa. Quando un allenatore entra per la prima volta
            con il magic link, compare qui.
          </div>
        </div>
      ) : (
        <LinkForm
          users={scollegati}
          teams={conPosto.map((t) => ({
            id: t.id, name: t.name, posti: 2 - t.members.length,
          }))}
        />
      )}

      <h2>Squadre</h2>
      {perTeam.map((t) => (
        <div className="panel" key={t.id} style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1.05rem' }}>{t.name}</b>
            <span className={`tag ${t.members.length === 0 ? 'crit' : t.members.length === 1 ? 'warn' : 'ok'}`}>
              {t.members.length === 0 ? 'nessun allenatore'
                : t.members.length === 1 ? '1 allenatore · c\'è posto'
                : '2 allenatori'}
            </span>
          </div>

          {t.members.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {t.members.map((m) => (
                <MemberRow
                  key={m.id}
                  memberId={m.id}
                  email={m.email ?? '(senza email)'}
                  isAdmin={m.is_admin}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="callout">
        Il limite di due è imposto dal database, non solo da questa pagina: anche una
        query fatta a mano verrebbe rifiutata. Un account può appartenere a una sola
        squadra.
      </div>
    </div>
  );
}
