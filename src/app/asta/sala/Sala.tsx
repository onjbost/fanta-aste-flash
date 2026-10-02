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

  const vivo = rows.find((l) => l.status === 'live');
  const prossimo = rows.find((l) => l.status === 'called');
  const riassunto = !isLive ? 'Sala da aprire'
    : vivo ? `Lotto ${vivo.index} · ${vivo.player.name}`
    : prossimo ? `Prossimo: lotto ${prossimo.index} · ${prossimo.player.name}`
    : 'Tutti i lotti chiusi';

  return (
    <div className={isAdmin ? 'sala con-regia' : 'sala'}>
      {isLive
        ? <AuctionRoom myTeamId={myTeamId} lots={rows} tempi={tempi} scarto={scarto.current} />
        : (
          <div className="sala-vuota">
            {rows.length} {rows.length === 1 ? 'lotto pronto' : 'lotti pronti'}.
            Si comincia quando l&apos;admin apre la sala.
          </div>
        )}

      {isAdmin && (
        <CassettoRegia riassunto={riassunto} acceso={Boolean(vivo) || !isLive}>
          <RoomControls
            sessionId={sessionId} isLive={isLive} lots={rows}
            tempi={tempi} scarto={scarto.current}
          />
          {children}
        </CassettoRegia>
      )}
    </div>
  );
}

/**
 * La regia dell'admin, in un cassetto da tirare su dal fondo.
 *
 * Chiuso, è una barra che dice a che punto è la serata; aperto, porta tutti i
 * comandi. Non è modale: con la regia aperta l'anello del timer resta visibile
 * sopra, ed è proprio quello che l'admin guarda prima di battere il martello.
 * Resta aperto finché non lo chiudi, così fra un lotto e l'altro non va
 * ritirato su ogni volta.
 */
function CassettoRegia({ riassunto, acceso, children }: {
  riassunto: string; acceso: boolean; children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <aside className={`regia${aperto ? ' aperta' : ''}`} aria-label="Regia dell'admin">
      <button type="button" className="regia-maniglia" aria-expanded={aperto} onClick={() => setAperto((x) => !x)}>
        <span className="foglio-maniglia" aria-hidden="true" />
        <span className="regia-riga">
          <span className="regia-k">Regia</span>
          <span className="regia-riassunto">
            {acceso && <i className="pallino-live" aria-hidden="true" />}{riassunto}
          </span>
          <svg className="giu" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
        </span>
      </button>
      {aperto && <div className="regia-corpo">{children}</div>}
    </aside>
  );
}
