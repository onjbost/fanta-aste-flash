'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { placeBid, settleExpiredLot } from '../actions';
import { Countdown } from '../Countdown';
import { Timer } from '../../Icone';

export interface LotView {
  id: string;
  index: number;
  status: string;
  player: { name: string; role: string; club: string };
  callerTeam: string;
  currentPrice: number | null;
  currentLeader: string | null;
  currentLeaderId: string | null;
  timerEndsAt: string | null;
  winnerTeam: string | null;
  finalPrice: number | null;
  participants: {
    teamId: string; teamName: string; isCaller: boolean;
    releaseName: string; budget: number; liveCredits: number;
  }[];
  myBudget: number | null;
  iParticipate: boolean;
}

export function AuctionRoom({ myTeamId, lots }: { myTeamId: string; lots: LotView[] }) {
  const [rows, setRows] = useState(lots);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const settling = useRef<Set<string>>(new Set());

  useEffect(() => setRows(lots), [lots]);

  // Realtime: seguo i lotti della sessione. Ogni rilancio cambia una riga di
  // `lots`, quindi basta ascoltare quella tabella per avere prezzo, leader e
  // nuovo timer senza ricaricare la pagina.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const db = createBrowserClient(url, key);

    const channel = db.channel('sala')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lots' }, (payload) => {
        const n = payload.new as Record<string, unknown>;
        setRows((prev) => prev.map((l) => l.id === n.id ? {
          ...l,
          status: String(n.status),
          currentPrice: (n.current_price as number) ?? null,
          currentLeaderId: (n.current_leader as string) ?? null,
          currentLeader: l.participants.find((p) => p.teamId === n.current_leader)?.teamName ?? l.currentLeader,
          timerEndsAt: (n.timer_ends_at as string) ?? null,
          winnerTeam: l.participants.find((p) => p.teamId === n.winner_team_id)?.teamName ?? l.winnerTeam,
          finalPrice: (n.final_price as number) ?? l.finalPrice,
        } : l));
      })
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, []);

  const live = useMemo(() => rows.find((l) => l.status === 'live'), [rows]);

  const bid = useCallback((lotId: string, amount: number) => {
    startTransition(async () => {
      const r = await placeBid(lotId, amount);
      setNotice(r?.message ?? null);
    });
  }, []);

  /** Il timer è scaduto: chiedo al server di chiudere. È idempotente. */
  const onExpire = useCallback((lotId: string) => {
    if (settling.current.has(lotId)) return;
    settling.current.add(lotId);
    startTransition(async () => {
      await settleExpiredLot(lotId);
      settling.current.delete(lotId);
    });
  }, []);

  return (
    <>
      {live ? <LiveLot lot={live} myTeamId={myTeamId} onBid={bid} onExpire={onExpire} /> : (
        <div className="panel"><div className="empty">Nessun lotto aperto in questo momento.</div></div>
      )}

      {notice && <div className="callout" role="status">{notice}</div>}

      <h2>Programma della serata</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>#</th><th>Giocatore</th><th>Partecipanti</th><th className="num">Esito</th></tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} style={{ opacity: l.status === 'assigned' ? .65 : 1 }}>
                  <td className="num">{l.index}</td>
                  <td>
                    <span className="role-badge">{l.player.role}</span>{' '}
                    <b>{l.player.name}</b>{' '}
                    <span style={{ color: 'var(--muted)' }}>{l.player.club}</span>
                  </td>
                  <td style={{ fontSize: '.86rem' }}>
                    {l.participants.map((p) => (
                      <div key={p.teamId}>
                        {p.teamName} <span style={{ color: 'var(--muted)' }}>
                          — svincola {p.releaseName} · budget {p.budget}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="num">
                    {l.status === 'assigned'
                      ? <><b>{l.winnerTeam}</b><br />{l.finalPrice} cr</>
                      : l.status === 'live' ? <span className="tag crit">In corso</span>
                      : <span className="tag muted">In attesa</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LiveLot({ lot, myTeamId, onBid, onExpire }: {
  lot: LotView; myTeamId: string;
  onBid: (lotId: string, amount: number) => void;
  onExpire: (lotId: string) => void;
}) {
  const iLead = lot.currentLeaderId === myTeamId;
  const price = lot.currentPrice ?? 0;
  const next = lot.currentPrice === null ? 1 : price + 1;
  const budget = lot.myBudget ?? 0;
  const canBid = lot.iParticipate && !iLead && budget >= next;

  const steps = [1, 5, 10].map((s) => (lot.currentPrice === null ? s : price + s));

  return (
    <div className="panel sala-lotto">
      <div className="sala-testa">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Lotto {lot.index} · all&apos;asta adesso</p>
          <div className="sala-nome">{lot.player.name}</div>
          <div className="sala-meta">
            {lot.player.role} · {lot.player.club} · chiamato da {lot.callerTeam}
          </div>
        </div>
        <div className="sala-cifra">
          <div className="k">Offerta corrente</div>
          <div className="sala-prezzo">{lot.currentPrice ?? '—'}</div>
          <div className="sala-chi">
            {lot.currentLeader ? `di ${lot.currentLeader}` : 'nessuna offerta'}
          </div>
          {lot.timerEndsAt && (
            <div className="sala-timer">
              <Timer className="" />
              <Countdown to={lot.timerEndsAt} onExpire={() => onExpire(lot.id)} />
              <span className="sr-only">al termine del lotto</span>
            </div>
          )}
        </div>
      </div>

      {lot.iParticipate ? (
        <>
          <div className="sala-offerte">
            {steps.map((amount, i) => (
              <button key={amount} className={i === 0 ? 'primary' : ''}
                      disabled={!canBid || amount > budget}
                      onClick={() => onBid(lot.id, amount)}>
                {amount} cr
              </button>
            ))}
            <span className="sala-budget mono">budget {budget} cr</span>
          </div>
          {iLead && <div className="callout" style={{ marginTop: 12 }}>Sei tu il migliore offerente.</div>}
          {!iLead && budget < next && (
            <div className="callout crit" style={{ marginTop: 12 }}>
              Il tuo budget non arriva a {next} crediti: su questo lotto sei fuori.
            </div>
          )}
        </>
      ) : (
        <div className="callout" style={{ marginTop: 18 }}>
          Non partecipi a questo lotto: puoi solo guardare.
        </div>
      )}

      <h3 className="micro-titolo">In gara</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>Squadra</th><th>Mette sul piatto</th><th className="num">Budget</th></tr>
          </thead>
          <tbody>
            {lot.participants.map((p) => (
              <tr key={p.teamId} className={p.teamId === lot.currentLeaderId ? 'in-testa' : undefined}>
                <td>{p.teamName}{p.isCaller && <span className="tag muted" style={{ marginLeft: 6 }}>chiamante</span>}</td>
                <td>{p.releaseName}</td>
                <td className="num">{p.budget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

