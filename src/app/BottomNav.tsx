import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Le voci di navigazione. Le prime cinque stanno nella barra in basso; le
 * altre vivono nel cassetto ☰ e servono qui solo perché le pagine dicono
 * dove si trovano con la stessa chiave.
 */
export type NavKey =
  | 'home' | 'listone' | 'asta' | 'schedine' | 'rosa'
  | 'registro' | 'regolamento' | 'classifica' | 'admin';

// Icone in linea: niente libreria, niente richieste di rete, e il tratto
// prende il colore della voce (currentColor) senza altro lavoro.
export const ICONE: Record<NavKey, ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  // Svincolati: un giocatore libero, e il più che dice «lo puoi prendere».
  listone: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 11.4-4.3" />
      <path d="M18 14.5v6" /><path d="M15 17.5h6" />
    </svg>
  ),
  asta: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14 4 6 6" /><path d="m17 7-8.5 8.5" /><path d="m11.5 4.5 4 4" />
      <path d="m9 12 3 3" /><path d="M3 21h9" /><path d="m5.5 18.5 5-5" />
    </svg>
  ),
  schedine: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z" />
      <path d="M9.5 9.5h5" /><path d="M9.5 13.5h3" />
    </svg>
  ),
  rosa: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 3.5 5 5.2A2 2 0 0 0 4 7v3h3v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10h3V7a2 2 0 0 0-1-1.8l-3.5-1.7" />
      <path d="M8.5 3.5a3.5 3.5 0 0 0 7 0" />
    </svg>
  ),
  // Il registro: righe annotate una sotto l'altra, in ordine di tempo.
  registro: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5z" />
      <path d="M8.5 8h7" /><path d="M8.5 12h7" /><path d="M8.5 16h4" />
    </svg>
  ),
  regolamento: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z" />
      <path d="M8.5 7.5h6" /><path d="M8.5 11h4" />
    </svg>
  ),
  classifica: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h16" /><path d="M6 20v-6h3v6" /><path d="M10.5 20V9h3v11" /><path d="M15 20v-9h3v9" />
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
  { key: 'home', href: '/', label: 'Home' },
  { key: 'listone', href: '/listone', label: 'Svincolati' },
  { key: 'asta', href: '/asta', label: 'Asta' },
  { key: 'schedine', href: '/schedine', label: 'Schedine' },
  { key: 'rosa', href: '/rosa', label: 'Rosa' },
];

/**
 * La barra in basso: cinque voci, l'Asta al centro in una bolla d'oro.
 *
 * Quando la sala è aperta la bolla porta un pallino rosso: è l'unico invito
 * che l'app fa da qualunque pagina, perché è l'unica cosa che non aspetta.
 */
export function BottomNav({ active, salaLive = false }: { active: NavKey; salaLive?: boolean }) {
  return (
    <nav className="tabbar" aria-label="Navigazione">
      <div className="tabbar-voci">
        {VOCI.map((v) => {
          const corrente = active === v.key ? 'page' : undefined;
          if (v.key === 'asta') {
            return (
              <Link key={v.key} href={salaLive ? '/asta/sala' : v.href} className="centro" aria-current={corrente}>
                <span className="bolla">{ICONE.asta}</span>
                {salaLive && <span className="live" aria-hidden="true" />}
                <span>{salaLive ? 'Sala live' : v.label}</span>
              </Link>
            );
          }
          return (
            <Link key={v.key} href={v.href} aria-current={corrente}>
              {ICONE[v.key]}
              <span>{v.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
