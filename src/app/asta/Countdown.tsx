'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown che non mente: si ricalcola dall'orologio, non conta i tick.
 *
 * L'urgenza è graduata, non accesa sempre. Il timer di un lotto dura dieci
 * secondi: colorare di rosso «sotto il minuto» avrebbe tinto di rosso tutta
 * l'asta, e un allarme che suona sempre non è un allarme. Rosso sono gli
 * ultimi tre secondi, ambra i dieci prima.
 */
export function Countdown({ to, onExpire }: { to: string; onExpire?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(to).getTime() - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const ms = Math.max(0, new Date(to).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) onExpire?.();
    }, 250);
    return () => clearInterval(id);
  }, [to, onExpire]);

  if (left === 0) return <span className="conto">—</span>;

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const stato = s <= 3 ? ' critico' : s <= 10 ? ' avviso' : '';
  const cls = `conto${stato}`;

  if (d > 0) return <span className={cls}>{d}g {h}h</span>;
  if (h > 0) return <span className={cls}>{h}h {String(m).padStart(2, '0')}m</span>;
  if (m > 0) return <span className={cls}>{m}:{String(sec).padStart(2, '0')}</span>;
  return <span className={cls}>{sec}s</span>;
}
