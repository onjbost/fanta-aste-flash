'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type NavKey = 'rosa' | 'asta' | 'listone' | 'regolamento' | 'admin';

// Icone in linea: niente libreria, niente richieste di rete, e il tratto
// prende il colore della voce (currentColor) senza altro lavoro.
const ICONS: Record<NavKey, ReactNode> = {
  rosa: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 3.5 5 5.2A2 2 0 0 0 4 7v3h3v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10h3V7a2 2 0 0 0-1-1.8l-3.5-1.7" />
      <path d="M8.5 3.5a3.5 3.5 0 0 0 7 0" />
    </svg>
  ),
  asta: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14 4 6 6" /><path d="m17 7-8.5 8.5" /><path d="m11.5 4.5 4 4" />
      <path d="m9 12 3 3" /><path d="M3 21h9" /><path d="m5.5 18.5 5-5" />
    </svg>
  ),
  listone: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5h11" /><path d="M9 12h11" /><path d="M9 19h11" />
      <circle cx="4.5" cy="5" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="19" r="1.2" />
    </svg>
  ),
  regolamento: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z" />
      <path d="M8.5 7.5h6" /><path d="M8.5 11h4" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5.5c0 4 2.9 7.6 7 9.5 4.1-1.9 7-5.5 7-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  ),
};

const VOCI: { key: NavKey; href: string; label: string }[] = [
  { key: 'rosa', href: '/', label: 'Rosa' },
  { key: 'asta', href: '/asta', label: 'Asta' },
  { key: 'listone', href: '/listone', label: 'Listone' },
  { key: 'regolamento', href: '/regolamento', label: 'Regole' },
];

export function BottomNav({ active, isAdmin }: { active: NavKey; isAdmin: boolean }) {
  const [shrunk, setShrunk] = useState(false);
  const last = useRef(0);
  const ticking = useRef(false);

  // Si rimpicciolisce quando si scorre in giù, torna piena appena si risale.
  // Soglia di 6px: un tremolio del dito non la fa lampeggiare.
  useEffect(() => {
    last.current = window.scrollY;
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const d = y - last.current;
        if (Math.abs(d) >= 6) {
          setShrunk(d > 0 && y > 48);
          last.current = y;
        }
        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const voci = isAdmin
    ? [...VOCI, { key: 'admin' as NavKey, href: '/admin', label: 'Admin' }]
    : VOCI;

  return (
    <nav className={shrunk ? 'dock shrunk' : 'dock'} aria-label="Navigazione">
      <div className="capsule">
        {voci.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            className="tab"
            aria-current={active === v.key ? 'page' : undefined}
          >
            {ICONS[v.key]}
            <span className="lbl">{v.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
