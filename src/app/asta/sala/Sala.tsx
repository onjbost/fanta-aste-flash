'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { AuctionRoom } from './AuctionRoom';
import { RoomControls } from './RoomControls';
import type { LotView, TempiSala } from './PezziSala';

/**
 * La sala intera, con una sola fonte di verità in tempo reale.
 *
 * Esisteva per un difetto preciso: il realtime stava dentro `AuctionRoom`, e
 * la regia dell'admin riceveva i lotti come proprietà dal server. Appena le
 * squadre confermavano la presenza, il countdown partiva per loro e per
 * l'admin no: la sua regia restava a «si aspettano le presenze» e il bottone
 * per aggiudicare non compariva mai. Dato che adesso **solo** l'admin può
 * chiudere un lotto, quello era un lotto che non si chiudeva più.
 *
 * Qui lo stato dei lotti si tiene una volta, si aggiorna da Postgres e si
 * passa a entrambi. Un canale solo, due viste che non possono divergere.
 */
export function Sala({ myTeamId, isAdmin, sessionId, isLive, lots, tempi, adesso, children }: {
  myTeamId: string;
  isAdmin: boolean;
  sessionId: string;
  isLive: boolean;
  lots: LotView[];
  tempi: TempiSala;
  /** l'ora del server quando ha disegnato la pagina: serve a correggere l'orologio locale */
  adesso: string;
  /** la coda operativa, che è roba del server: entra già disegnata */
  children?: React.ReactNode;
}) {
  const [rows, setRows] = useState(lots);
  useEffect(() => setRows(lots), [lots]);

  /*
   * Lo scarto fra l'orologio del server e quello di qui.
   *
   * `timer_ends_at` è un istante scritto da Postgres: confrontarlo con
   * `Date.now()` di un telefono con l'ora sbagliata di venti secondi dava un
   * lotto «già congelato» appena aperto, coi pulsanti di rilancio spenti per
   * tutta la durata dell'asta. Si misura una volta sola, al montaggio: fra il
   * disegno del server e questa riga passa il tempo della rete, cioè
   * frazioni di secondo — e qui si ragiona in secondi.
   */
  const scarto = useRef<number>(Date.parse(adesso) - Date.now());

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const db = createBrowserClient(url, key);

    const channel = db.channel('sala')
      // ogni rilancio, e l'accensione del countdown, cambiano una riga di `lots`
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lots' }, (payload) => {
        const n = payload.new as Record<string, unknown>;
        setRows((prev) => prev.map((l) => l.id === n.id ? {
          ...l,
          status: String(n.status),
          currentPrice: (n.current_price as number) ?? null,
          currentLeaderId: (n.current_leader as string) ?? null,
          currentLeader: l.participants.find((p) => p.teamId === n.current_leader)?.teamName ?? null,
          timerEndsAt: (n.timer_ends_at as string) ?? null,
          winnerTeam: l.participants.find((p) => p.teamId === n.winner_team_id)?.teamName ?? l.winnerTeam,
          finalPrice: (n.final_price as number) ?? l.finalPrice,
        } : l));
      })
      /*
       * Le presenze: è questo che fa muovere l'attesa su tutti gli schermi
       * mentre gli allenatori confermano. Il countdown invece arriva
       * dall'UPDATE qui sopra, perché a scriverlo è la conferma dell'ultima
       * squadra, dentro Postgres.
       */
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lot_presences' }, (payload) => {
        const n = payload.new as { lot_id: string; team_id: string; confirmed_at: string };
        setRows((prev) => prev.map((l) => l.id !== n.lot_id
          || l.presenze.some((p) => p.teamId === n.team_id)
          ? l
          : { ...l, presenze: [...l.presenze, { teamId: n.team_id, quando: n.confirmed_at }] }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lot_presences' }, (payload) => {
        // un lotto rimesso in programma cancella le sue presenze: la riga
        // vecchia porta solo la chiave primaria, quindi si ripulisce per lotto
        const o = payload.old as { lot_id?: string };
        if (!o.lot_id) return;
        setRows((prev) => prev.map((l) => l.id === o.lot_id ? { ...l, presenze: [] } : l));
      })
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, []);

  return (
    <>
      {isAdmin && (
        <>
          <RoomControls
            sessionId={sessionId} isLive={isLive} lots={rows}
            tempi={tempi} scarto={scarto.current}
          />
          {children}
        </>
      )}

      {isLive
        ? <AuctionRoom myTeamId={myTeamId} lots={rows} tempi={tempi} scarto={scarto.current} />
        : (
          <div className="panel">
            <div className="empty">
              {rows.length} lotti pronti. Si comincia quando l&apos;admin apre la sala.
            </div>
          </div>
        )}
    </>
  );
}
