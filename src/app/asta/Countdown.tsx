'use client';

import { useEffect, useState } from 'react';

/** Countdown che non mente: si ricalcola dall'orologio, non conta i tick. */
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

  if (left === 0) return <span>—</span>;

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (d > 0) return <span>{d}g {h}h</span>;
  if (h > 0) return <span>{h}h {String(m).padStart(2, '0')}m</span>;
  if (m > 0) return <span>{m}:{String(sec).padStart(2, '0')}</span>;
  return <span style={{ color: 'var(--crit)' }}>{sec}s</span>;
}
