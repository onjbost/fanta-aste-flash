import { redirect } from 'next/navigation';
import { loadTeamContext } from '@/lib/queries';
import { freeReleaseEligibility, ROLE_LABEL, type Role } from '@/lib/rules';
import { FreeReleaseButton } from './FreeReleaseButton';
import { TopBar } from './TopBar';

export const dynamic = 'force-dynamic';

const STATUS_TAG: Record<string, { cls: string; label: string } | null> = {
  active: null,
  injured_long: { cls: 'crit', label: 'Infortunato' },
  banned: { cls: 'crit', label: 'Squalificato' },
  out_of_serie_a: { cls: 'warn', label: 'Fuori Serie A' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default async function Dashboard() {
  const ctx = await loadTeamContext();
  if (!ctx) redirect('/login');

  const { team, credits, roster, changes, nextSession } = ctx;
  const byRole = (r: Role) => roster.filter((p) => p.role === r);
  const rosterValue = roster.reduce((s, p) => s + p.price, 0);

  return (
    <div className="shell">
      <TopBar teamName={team.name} isAdmin={team.isAdmin} active="rosa" />

      <p className="eyebrow">La mia squadra</p>
      <h1>{team.name}</h1>
      <p className="sub">
        {nextSession
          ? <>Prossima asta flash · <b>#{nextSession.number}</b> · {formatDate(nextSession.auctionAt)}</>
          : 'Nessuna asta flash in calendario.'}
      </p>

      <div className="stats">
        <div className="stat">
          <div className="k">Crediti residui</div>
          <div className="v">{credits}</div>
          <div className="note">spesi {rosterValue} sulla rosa</div>
        </div>
        <div className="stat">
          <div className="k">Rosa</div>
          <div className="v">{roster.length}<small>/25</small></div>
          <div className="note">
            {(['P', 'D', 'C', 'A'] as Role[]).map((r) => `${byRole(r).length}${r}`).join(' · ')}
          </div>
        </div>
        <div className="stat">
          <div className="k">Valore di svincolo totale</div>
          <div className="v">{roster.reduce((s, p) => s + p.refund, 0)}</div>
          <div className="note">se svincolassi tutti oggi</div>
        </div>
      </div>

      <h2>Cambi rimasti</h2>
      <div className="changes">
        {changes.map((c) => (
          <div key={c.role} className={`chg ${c.left === 0 ? 'zero' : c.left === 1 ? 'one' : ''}`}>
            <div className="role">{c.role}</div>
            <div className="left">{c.left}<span className="of">/{c.allowance}</span></div>
            <div className="role" style={{ fontWeight: 400, letterSpacing: 0 }}>
              {c.bonusPending > 0 ? `+${c.bonusPending} a febbraio` : 'ritorno incluso'}
            </div>
          </div>
        ))}
      </div>

      <h2>La mia rosa</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>R</th>
                <th>Giocatore</th>
                <th>Club</th>
                <th className="num">Pagato</th>
                <th className="num">Svincolo</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
                const tag = STATUS_TAG[p.status];
                const el = freeReleaseEligibility(p);
                return (
                  <tr key={p.playerId}>
                    <td><span className="role-badge" title={ROLE_LABEL[p.role]}>{p.role}</span></td>
                    <td><b>{p.name}</b></td>
                    <td style={{ color: 'var(--muted)' }}>{p.club}</td>
                    <td className="num">{p.price}</td>
                    <td className="num">
                      {p.refund}
                      {p.refundFree && <span className="tag ok" style={{ marginLeft: 6 }}>100%</span>}
                    </td>
                    <td>
                      {tag && <span className={`tag ${tag.cls}`}>{tag.label}</span>}
                      {p.freeReleasePending && <span className="tag warn">In attesa</span>}
                      {p.freeReleaseApproved && <span className="tag ok">Gratuito</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <FreeReleaseButton
                        playerId={p.playerId}
                        playerName={p.name}
                        price={p.price}
                        refund={p.refund}
                        canRequest={el.canRequest && !p.refundFree}
                        pending={!!p.freeReleasePending}
                        hint={p.refundFree ? 'Già al 100%' : el.reason}
                      />
                    </td>
                  </tr>
                );
              })}
              {roster.length === 0 && (
                <tr><td colSpan={7}><div className="empty">Rosa non ancora caricata. L'admin deve importare le rose dopo l'asta.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout">
        Il valore di svincolo è il 75% del prezzo pagato, arrotondato per difetto. Diventa il 100%
        — e non consuma un cambio — per chi ha lasciato la Serie A, è squalificato dalla Lega o ha
        un infortunio oltre 60 giorni approvato dall'admin.
      </div>
    </div>
  );
}
