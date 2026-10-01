'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { placeBid, confermaPresenzaLotto } from '../actions';
import { LiveLot, ProgrammaSerata, type LotView, type TempiSala } from './PezziSala';

export type { LotView };

/**
 * La sala vista da un allenatore: il lotto aperto e il programma della serata.
 *
 * I lotti arrivano già aggiornati in tempo reale da `Sala`, che tiene il
 * canale per tutti: qui non c'è nessuna sottoscrizione, così la regia
 * dell'admin e questa vista non possono mostrare due stati diversi dello
 * stesso lotto.
 */
export function AuctionRoom({ myTeamId, lots, tempi, scarto }: {
  myTeamId: string; lots: LotView[]; tempi: TempiSala; scarto: number;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [confermando, setConfermando] = useState(false);
  const [, startTransition] = useTransition();

  const live = useMemo(() => lots.find((l) => l.status === 'live'), [lots]);

  const bid = useCallback((lotId: string, amount: number) => {
    startTransition(async () => {
      const r = await placeBid(lotId, amount);
      setNotice(r?.message ?? null);
    });
  }, []);

  /**
   * «Conferma presenza». Nessun client chiude più un lotto: a timer scaduto
   * si aspetta il martello dell'admin, e questa è l'unica cosa che un
   * allenatore fa prima che il countdown esista.
   */
  const conferma = useCallback((lotId: string) => {
    setConfermando(true);
    setNotice(null);
    startTransition(async () => {
      const r = await confermaPresenzaLotto(lotId);
      setNotice(r?.ok ? null : r?.message ?? null);
      setConfermando(false);
    });
  }, []);

  return (
    <>
      {live ? (
        <LiveLot
          lot={live} myTeamId={myTeamId} tempi={tempi} scarto={scarto}
          onBid={bid} onConferma={conferma} confermando={confermando}
          errore={notice}
        />
      ) : (
        <div className="panel"><div className="empty">Nessun lotto aperto in questo momento.</div></div>
      )}

      {/*
        * Il messaggio del server si vede sempre, anche a lotto aperto: un
        * rilancio rifiutato («tempo scaduto», «budget») è la cosa che chi
        * gioca deve leggere subito. Quando è aperta la finestra delle
        * presenze il resto della pagina è inerte, e per quel caso lo stesso
        * testo entra dentro la finestra.
        */}
      {notice && <div className="callout" role="status">{notice}</div>}

      <ProgrammaSerata rows={lots} />
    </>
  );
}
