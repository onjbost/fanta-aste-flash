/**
 * Il marchio dell'app: il martello del banditore, a contorno. È lo stesso
 * disegno delle icone (favicon e schermata Home), che `scripts/icone.mjs`
 * genera con le stesse misure: se cambia qui, cambia anche là.
 *
 * Il tratto prende il colore del testo, il pieno quello del fondo: sta
 * dentro un riquadro colorato (`.login-logo`).
 */
export function Logo({ tratto = 6 }: { tratto?: number }) {
  const t = { stroke: 'currentColor', strokeWidth: tratto, strokeLinejoin: 'round' as const, fill: 'var(--logo-fondo, var(--accent))' };
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="logo">
      <rect x="21" y="67" width="26" height="8" rx="4" {...t} />
      <path d="M10 89 C10 81 16 75 25 75 H43 C52 75 58 81 58 89 Z" {...t} />
      <g transform="translate(40 33) rotate(45)">
        <rect x="0" y="-4.5" width="64" height="9" rx="4.5" {...t} />
        <rect x="-8" y="-15" width="16" height="30" {...t} />
        <rect x="-11" y="-27" width="22" height="12" rx="3.5" {...t} />
        <rect x="-11" y="15" width="22" height="12" rx="3.5" {...t} />
      </g>
    </svg>
  );
}
