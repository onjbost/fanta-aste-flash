import { redirect } from 'next/navigation';
import Link from 'next/link';
import { loadFreeAgents, loadTeamContext } from '@/lib/queries';
import { ROLE_LABEL, type Role } from '@/lib/rules';
import { TopBar } from '../TopBar';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['P', 'D', 'C', 'A'];

export default async function ListonePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  const ctx = await loadTeamContext();
  if (!ctx) redirect('/login');

  const sp = await searchParams;
  const role = ROLES.includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const q = sp.q?.trim() || undefined;
  const players = await loadFreeAgents({ role, q });

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="listone" />

      <p className="eyebrow">Mercato</p>
      <h1>Svincolati</h1>
      <p className="sub">
        {players.length} giocatori liberi{role ? ` · ${ROLE_LABEL[role].toLowerCase()}i` : ''}.
        Chi è uscito da una rosa nell'ultima asta torna chiamabile dalla prossima.
      </p>

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="q">Cerca</label>
          <input id="q" name="q" defaultValue={q ?? ''} placeholder="Cognome" />
        </div>
        <div className="field" style={{ maxWidth: 180 }}>
          <label htmlFor="role">Ruolo</label>
          <select id="role" name="role" defaultValue={role ?? ''}>
            <option value="">Tutti</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <button type="submit" className="primary">Filtra</button>
        {(role || q) && <Link className="btn" href="/listone">Azzera</Link>}
      </form>

      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>R</th><th>Giocatore</th><th>Club</th>
                <th className="num">Quotazione</th><th>Note</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td><span className="role-badge" title={ROLE_LABEL[p.role]}>{p.role}</span></td>
                  <td><b>{p.name}</b></td>
                  <td style={{ color: 'var(--muted)' }}>{p.club}</td>
                  <td className="num">{p.quotation}</td>
                  <td>
                    {p.status === 'injured_long' && <span className="tag crit">Infortunato</span>}
                    {p.status === 'out_of_serie_a' && <span className="tag warn">Fuori Serie A</span>}
                    {p.outOfList && <span className="tag warn">Fuori lista</span>}
                    {p.lockedUntilNumber != null && (
                      <span className="tag muted">Chiamabile dall'asta #{p.lockedUntilNumber}</span>
                    )}
                    {p.signingWindow === 'winter' && <span className="tag muted">Arrivo di gennaio</span>}
                  </td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr><td colSpan={5}><div className="empty">Nessun giocatore con questi filtri.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout">
        Nelle aste di gennaio (#7, #8, #9) i giocatori arrivati in Serie A nel mercato invernale
        non si possono chiamare — art. 11.2. L'app li segnala e blocca la chiamata.
      </div>
    </div>
  );
}
