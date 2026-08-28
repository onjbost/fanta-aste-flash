'use client';

import { useActionState, useState } from 'react';
import { editPrice, removePlayer, addPlayer, type EditState } from './actions';
import type { Role } from '@/lib/rules';

interface RosterRow {
  contractId: string; playerId: string; name: string; role: Role;
  club: string; price: number; refund: number; source: string;
}
interface FreeAgent { id: string; name: string; role: Role; club: string; quotation: number }

const SOURCE_LABEL: Record<string, string> = {
  initial_auction: 'Asta iniziale',
  flash_auction: 'Asta flash',
  trade: 'Scambio',
  repair_auction: 'Riparazione',
  correction: 'Correzione',
};

export function RosterEditor({ teamId, teamName, roster, freeAgents }: {
  teamId: string; teamName: string; roster: RosterRow[]; freeAgents: FreeAgent[];
}) {
  const [priceState, doEditPrice, savingPrice] = useActionState<EditState, FormData>(editPrice, null);
  const [removeState, doRemove, removing] = useActionState<EditState, FormData>(removePlayer, null);
  const [addState, doAdd, adding] = useActionState<EditState, FormData>(addPlayer, null);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const state = priceState ?? removeState ?? addState;
  const filtered = freeAgents
    .filter((p) => !q.trim() || p.name.includes(q.trim().toUpperCase()))
    .slice(0, 40);

  return (
    <>
      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">{state.message}</div>
      )}

      <h2>{teamName}</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>R</th><th>Giocatore</th><th>Origine</th>
                <th className="num">Pagato</th><th className="num">Svincolo</th><th />
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.contractId}>
                  <td><span className="role-badge">{r.role}</span></td>
                  <td>
                    <b>{r.name}</b>{' '}
                    <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{r.club}</span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: '.82rem' }}>
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </td>
                  <td className="num">
                    {editing === r.contractId ? (
                      <form action={doEditPrice} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="hidden" name="contractId" value={r.contractId} />
                        <input name="price" type="number" min={0} step={1} defaultValue={r.price}
                               style={{ width: 80 }} autoFocus />
                        <input name="note" placeholder="motivo" style={{ width: 120 }} />
                        <button type="submit" className="primary" disabled={savingPrice}>OK</button>
                        <button type="button" onClick={() => setEditing(null)}>×</button>
                      </form>
                    ) : (
                      <button type="button" className="link" onClick={() => setEditing(r.contractId)}>
                        {r.price}
                      </button>
                    )}
                  </td>
                  <td className="num" style={{ color: 'var(--muted)' }}>{r.refund}</td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={doRemove} style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <input type="hidden" name="contractId" value={r.contractId} />
                      <label style={{ display: 'flex', gap: 4, alignItems: 'center', margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '.75rem' }}>
                        <input type="checkbox" name="refund" defaultChecked style={{ width: 'auto' }} />
                        rimborsa
                      </label>
                      <button type="submit" disabled={removing}
                              style={{ color: 'var(--crit)', borderColor: 'var(--border)' }}>
                        Togli
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {roster.length === 0 && (
                <tr><td colSpan={6}><div className="empty">Rosa vuota.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Aggiungi un giocatore</h2>
      <div className="panel" style={{ padding: 16 }}>
        <form action={doAdd}>
          <input type="hidden" name="teamId" value={teamId} />
          <div className="filters">
            <div className="field">
              <label htmlFor="q">Cerca tra gli svincolati</label>
              <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cognome" />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="playerId">Giocatore</label>
              <select id="playerId" name="playerId" required>
                <option value="">— scegli —</option>
                {filtered.map((p) => (
                  <option key={p.id} value={p.id}>{p.role} · {p.name} ({p.club}) · qt {p.quotation}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 120 }}>
              <label htmlFor="price">Prezzo</label>
              <input id="price" name="price" type="number" min={0} step={1} defaultValue={1} required />
            </div>
            <div className="field" style={{ maxWidth: 180 }}>
              <label htmlFor="note">Motivo</label>
              <input id="note" name="note" placeholder="es. errore in asta" />
            </div>
            <button type="submit" className="primary" disabled={adding}>
              {adding ? 'Aggiungo…' : 'Aggiungi'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
