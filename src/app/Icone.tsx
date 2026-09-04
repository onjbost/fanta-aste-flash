/**
 * Le icone dell'app, disegnate qui.
 *
 * Niente libreria: nessuna richiesta di rete, nessun peso, e il tratto resta
 * quello — 1.7px su `currentColor`, come le voci della barra in basso. La
 * misura la decide il CSS di chi le usa, non il componente.
 *
 * Il motivo per cui esistono in un posto solo: prima erano glifi di testo
 * sparsi nei componenti (`✓`, `×`, `🏆`), che ereditano il carattere e non il
 * disegno — su Android una spunta e su iPhone un'altra, e nessuna delle due
 * fatta come le nostre.
 */

type Props = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Fatto: conferma di un'azione appena riuscita. */
export function Spunta({ className = 'icona' }: Props) {
  return <svg {...base} className={className}><path d="m4.5 12.5 5 5 10-11" /></svg>;
}

/** Chiudi, annulla, togli: mai «elimina per sempre». */
export function Chiudi({ className = 'icona' }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m6 6 12 12" /><path d="m18 6-12 12" />
    </svg>
  );
}

/** Lo scambio fra due squadre: due frecce che si incrociano di verso. */
export function Scambio({ className = 'icona' }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8h13" /><path d="m14 5 3 3-3 3" />
      <path d="M20 16H7" /><path d="m10 13-3 3 3 3" />
    </svg>
  );
}

/** Il timer del lotto: un cronometro, non un orologio da parete. */
export function Timer({ className = 'icona' }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5V13l2.5 1.5" />
      <path d="M9 2h6" />
    </svg>
  );
}

/** Coppa Mansarda: marca una sfida che vale il trofeo, non il campionato. */
export function Coppa({ className = 'icona' }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5.5H4.5V7a3 3 0 0 0 3 3" />
      <path d="M17 5.5h2.5V7a3 3 0 0 1-3 3" />
      <path d="M12 14v3" /><path d="M9 20h6" /><path d="M10 17h4l.5 3h-5z" />
    </svg>
  );
}
