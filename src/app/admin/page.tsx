import { redirect } from 'next/navigation';
import { loadTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { freeReleaseScenarios, type Role, type PlayerStatus } from '@/lib/rules';
import { TopBar } from '../TopBar';
import { DecideForm } from './DecideForm';
import { TelegramCheck } from './TelegramCheck';
import { telegramConfigured } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

interface RequestRow {
  id: string;
  created_at: string;
  lot_participant_id: string | null;
  teams: { name: string } | null;
  players: { id: string; name: string; role: Role; club: string; status: PlayerStatus } | null;
  lot_participants: {
    is_caller: boolean;
    lots: { players: { name: string } | null; session_id: string } | null;
  } | null;
}

const STATUS_NOTE: Record<string, string> = {
  injured_long: 'risulta infortunato',
  banned: 'risulta squalificato',
  out_of_serie_a: 'risulta fuori dalla Serie A',
  active: 'risulta regolarmente in Serie A',
};

export default async function AdminPage() {
  const ctx = await loadTeamContext();
  if (!ctx) redirect('/login');
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const [{ data: reqs }, { data: tasks }] = await Promise.all([
    db.from('free_release_requests')
      .select(`id, created_at, lot_participant_id,
               teams(name),
               players(id, name, role, club, status),
               lot_participants(is_caller, lots(session_id, players(name)))`)
      .eq('status', 'pending').order('created_at'),
    db.from('admin_tasks').select('id, body, done, created_at')
      .eq('done', false).order('created_at', { ascending: false }).limit(20),
  ]);

  const requests = (reqs ?? []) as unknown as RequestRow[];

  const prices = new Map<string, number>();
  if (requests.length) {
    const { data: contracts } = await db.from('contracts')
      .select('player_id, price')
      .in('player_id', requests.map((r) => r.players?.id).filter(Boolean) as string[])
      .is('released_at', null);
    (contracts ?? []).forEach((c) => prices.set(c.player_id, c.price));
  }

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Pannello admin</p>
      <h1>Da decidere</h1>
      <TelegramCheck configured={telegramConfigured()} />
      <div className="filters" style={{ marginTop: 0 }}>
        <a className="btn" href="/admin/rose">Rose e import</a>
        <a className="btn" href="/admin/messaggi">Centro messaggi</a>
        <a className="btn" href="/asta/sala">Sala d'asta</a>
      </div>
      <p className="sub">
        {requests.length === 0
          ? 'Nessuna richiesta in attesa.'
          : `${requests.length} richieste di svincolo gratuito congelano altrettante operazioni.`}
      </p>

      {requests.map((r) => {
        const price = prices.get(r.players?.id ?? '') ?? 0;
        const s = freeReleaseScenarios({
          playerId: '', name: '', role: r.players?.role ?? 'D', club: '',
          status: r.players?.status ?? 'active', price,
        }, ctx.cfg);
        const op = r.lot_participants;
        const target = op?.lots?.players?.name;

        return (
          <div className="panel" key={r.id} style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <b style={{ fontSize: '1.05rem' }}>{r.players?.name}</b>{' '}
                <span className="role-badge">{r.players?.role}</span>{' '}
                <span style={{ color: 'var(--muted)' }}>{r.players?.club}</span>
                <div style={{ color: 'var(--muted)', fontSize: '.9rem', marginTop: 2 }}>
                  {r.teams?.name} · pagato {price} cr · {STATUS_NOTE[r.players?.status ?? 'active']}
                </div>
              </div>
              <div className="mono" style={{ textAlign: 'right', fontSize: '.85rem' }}>
                <div><b>Approva</b> · {s.approved.refund} cr · cambio non consumato</div>
                <div style={{ color: 'var(--muted)' }}>
                  Rifiuta · {s.rejected.refund} cr · cambio consumato
                </div>
                <div style={{ color: 'var(--muted)' }}>differenza {s.delta} cr</div>
              </div>
            </div>

            {target ? (
              <div className="callout" style={{ margin: '14px 0 0' }}>
                Congela la <b>{op?.is_caller ? 'chiamata' : 'adesione'}</b> su <b>{target}</b>.
                Se annulli, {r.teams?.name} può rifarla mettendo sul piatto un altro giocatore.
              </div>
            ) : (
              <p style={{ fontSize: '.9rem', color: 'var(--muted)', margin: '12px 0 0' }}>
                Nessuna chiamata collegata: decide solo quanto varrà questo giocatore quando
                verrà svincolato.
              </p>
            )}

            <DecideForm requestId={r.id} hasOperation={!!target} />
          </div>
        );
      })}

      <h2>Coda operativa</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead><tr><th>Da fare su Leghe Fantacalcio.it</th><th className="num">Quando</th></tr></thead>
            <tbody>
              {(tasks ?? []).map((t) => (
                <tr key={t.id}>
                  <td>{t.body}</td>
                  <td className="num" style={{ color: 'var(--muted)' }}>
                    {new Date(t.created_at).toLocaleDateString('it-IT')}
                  </td>
                </tr>
              ))}
              {(tasks ?? []).length === 0 && (
                <tr><td colSpan={2}><div className="empty">Niente in coda.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
