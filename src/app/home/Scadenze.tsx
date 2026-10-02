'use client';

import { useEffect, useState } from 'react';

export interface TesseraScadenza {
  chiave: string;
  titolo: string;
  /** ISO, o null se non c'è niente di aperto */
  quando: string | null;
  /** la data già scritta dal server, in ora di Roma */
  data: string | null;
  prossima: boolean;
  /** cosa scrivere quando non c'è una scadenza aperta */
  vuota: string;
}

const ORA = 3_600_000;

function mancano(ms: number): string {
  const min = Math.floor(ms / 60_000);
  const g = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (g >= 2) return `${g}g`;
  if (g === 1) return `1g ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${Math.max(1, m)}m`;
}

/**
 * Le quattro tessere, ferme al loro posto. Il tempo che manca è il numero
 * grande; si colora quando stringe: rosso sotto le 24 ore, arancio sotto i tre
 * giorni. La più vicina ha il bordo d'oro.
 *
 * Il conto parte dopo il montaggio: calcolato anche sul server, l'orologio
 * dei due lati non coinciderebbe e React segnalerebbe una pagina diversa.
 * Fino ad allora la tessera mostra la data, che è comunque giusta.
 */
export function Scadenze({ tessere }: { tessere: TesseraScadenza[] }) {
  const [ora, setOra] = useState<number | null>(null);
  useEffect(() => {
    setOra(Date.now());
    const id = setInterval(() => setOra(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="tessere">
      {tessere.map((t) => {
        const ms = t.quando && ora !== null ? Date.parse(t.quando) - ora : null;
        const scaduta = ms !== null && ms <= 0;
        const tono = ms === null || scaduta ? '' : ms < 24 * ORA ? ' urgente' : ms < 72 * ORA ? ' vicina' : '';
        return (
          <div key={t.chiave} className={`tessera${t.prossima && !scaduta ? ' prossima' : ''}`}>
            <div className="k">{t.titolo}</div>
            {t.quando ? (
              <>
                <div className={`v${tono}${scaduta ? ' chiusa' : ''}`}>
                  {ms === null ? '…' : scaduta ? 'chiusa' : mancano(ms)}
                </div>
                <div className="d">{t.data}</div>
              </>
            ) : (
              <>
                <div className="v chiusa">—</div>
                <div className="d">{t.vuota}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
