'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { placeBid, settleExpiredLot } from '../actions';
import { LiveLot, ProgrammaSerata, type LotView } from './PezziSala';

export type { LotView };

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

      <ProgrammaSerata rows={rows} />
    </>
  );
}
