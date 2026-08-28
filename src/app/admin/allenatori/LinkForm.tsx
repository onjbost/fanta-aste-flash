'use client';

import { useActionState } from 'react';
import { linkCoach, unlinkCoach, toggleAdmin, type LinkState } from './actions';

interface UserRow { id: string; email: string; lastSignIn: string | null }
interface TeamRow { id: string; name: string; posti: number }

export function LinkForm({ users, teams }: { users: UserRow[]; teams: TeamRow[] }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(linkCoach, null);

  return (
    <div className="panel" style={{ padding: 16 }}>
      {users.map((u) => (
        <form action={action} key={u.id}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', paddingBottom: 12 }}>
          <input type="hidden" name="userId" value={u.id} />
          <div className="field" style={{ margin: 0, flex: 2, minWidth: 200 }}>
            <label>Account</label>
            <div style={{ padding: '8px 0', fontWeight: 600 }}>
              {u.email}
              <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: '.85rem' }}>
                {u.lastSignIn
                  ? `ultimo accesso ${new Date(u.lastSignIn).toLocaleDateString('it-IT')}`
                  : 'mai entrato'}
              </span>
            </div>
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
            <label htmlFor={`team-${u.id}`}>Squadra</label>
            <select id={`team-${u.id}`} name="teamId" required defaultValue="">
              <option value="">— scegli —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.posti === 2 ? 'libera' : '1 posto'})
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '0 0 8px', textTransform: 'none', letterSpacing: 0, fontSize: '.85rem' }}>
            <input type="checkbox" name="isAdmin" style={{ width: 'auto' }} />
            admin
          </label>
          <button type="submit" className="primary" disabled={pending} style={{ marginBottom: 8 }}>
            Collega
          </button>
        </form>
      ))}

      {teams.length === 0 && (
        <div className="callout crit">
          Tutte le squadre hanno già due allenatori: per collegarne un altro devi
          prima scollegarne uno.
        </div>
      )}

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status" style={{ marginBottom: 0 }}>
          {state.message}
        </div>
      )}
    </div>
  );
}

export function MemberRow({ memberId, email, isAdmin }: {
  memberId: string; email: string; isAdmin: boolean; isMe?: boolean;
}) {
  const [unlinkState, unlink, unlinking] = useActionState<LinkState, FormData>(unlinkCoach, null);
  const [adminState, toggle, toggling] = useActionState<LinkState, FormData>(toggleAdmin, null);
  const state = unlinkState ?? adminState;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 180 }}>
          {email}
          {isAdmin && <span className="tag ok" style={{ marginLeft: 8 }}>admin</span>}
        </span>
        <form action={toggle}>
          <input type="hidden" name="memberId" value={memberId} />
          <button type="submit" disabled={toggling}>
            {isAdmin ? 'Togli admin' : 'Rendi admin'}
          </button>
        </form>
        <form action={unlink}>
          <input type="hidden" name="memberId" value={memberId} />
          <button type="submit" disabled={unlinking}
                  style={{ color: 'var(--crit)', borderColor: 'var(--border)' }}>
            Scollega
          </button>
        </form>
      </div>
      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status" style={{ margin: '8px 0 0' }}>
          {state.message}
        </div>
      )}
    </div>
  );
}
