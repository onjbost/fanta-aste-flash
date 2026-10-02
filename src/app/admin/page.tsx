import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { freeReleaseScenarios, type Role, type PlayerStatus } from '@/lib/rules';
import { leggiLaCoda } from '@/lib/codaLettura';
import { Coda } from './Coda';
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
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const [{ data: reqs }, coda] = await Promise.all([
    db.from('free_release_requests')
      .select(`id, created_at, lot_participant_id,
               teams(name),
               players(id, name, role, club, status),
               lot_participants(is_caller, lots(session_id, players(name)))`)
      .eq('status', 'pending').order('created_at'),
    /*
     * Tutta la coda, fatte comprese: le due viste si cambiano nel browser e
     * sono poche righe — una stagione intera ne fa qualche decina. Prima si
     * leggevano solo le venti da fare più recenti, e con una coda che non si
     * svuotava mai erano proprio le più vecchie a sparire dal fondo.
     */
    leggiLaCoda(ctx.team.leagueId),
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
      <h1>Coda operativa</h1>
      <TelegramCheck configured={telegramConfigured()} />

      <h2>
        Svincoli gratuiti <span className="h2-conta">{requests.length}</span>
      </h2>
      {requests.length === 0 && (
        <div className="panel"><div className="empty">Nessuna richiesta in attesa.</div></div>
      )}

      <ul className="decisioni">
        {requests.map((r) => {
          const price = prices.get(r.players?.id ?? '') ?? 0;
          const s = freeReleaseScenarios({
            playerId: '', name: '', role: r.players?.role ?? 'D', club: '',
            status: r.players?.status ?? 'active', price,
          }, ctx.cfg);
          const op = r.lot_participants;
          const target = op?.lots?.players?.name;

          return (
            <li className="decisione" key={r.id}>
              <div className="lotto-riga">
                <span className="role-badge">{r.players?.role}</span>
                <div className="lotto-chi">
                  <b>{r.players?.name}</b>
                  <small>{r.teams?.name} · {r.players?.club} · {STATUS_NOTE[r.players?.status ?? 'active']}</small>
                </div>
                <span className="carta-cifre"><b className="num">{price}</b><small>pagato</small></span>
              </div>

              <div className="esiti-due">
                <div><span>Se approvi</span><b className="num">{s.approved.refund} cr</b><small>cambio non consumato</small></div>
                <div><span>Se rifiuti</span><b className="num">{s.rejected.refund} cr</b><small>cambio consumato · −{s.delta}</small></div>
              </div>

              <p className="foglio-nota">
                {target
                  ? <>Congela la <b>{op?.is_caller ? 'chiamata' : 'adesione'}</b> su <b>{target}</b>. Se annulli, {r.teams?.name} può rifarla con un altro giocatore.</>
                  : 'Nessuna chiamata collegata: decide solo quanto varrà questo giocatore quando verrà svincolato.'}
              </p>

              <DecideForm requestId={r.id} hasOperation={!!target} />
            </li>
          );
        })}
      </ul>

      <Coda voci={coda.voci} avviso={coda.avviso} />
    </div>
  );
}
