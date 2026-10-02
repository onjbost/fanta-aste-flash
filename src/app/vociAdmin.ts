/**
 * Le sezioni dell'area admin. Stanno qui, fuori dal cassetto, perché le
 * legge anche la Home dell'admin per le scorciatoie: un modulo client non
 * può prestare un semplice elenco a una pagina del server.
 */
export const VOCI_ADMIN: { href: string; testo: string }[] = [
  { href: '/admin', testo: 'Da decidere' },
  { href: '/admin/rose', testo: 'Rose e import' },
  { href: '/admin/allenatori', testo: 'Allenatori e stemmi' },
  { href: '/admin/messaggi', testo: 'Centro messaggi' },
  { href: '/admin/scambi', testo: 'Scambi' },
  { href: '/admin/schedine', testo: 'Tipster' },
  { href: '/admin/redazione', testo: 'La redazione' },
  { href: '/admin/gazzetta', testo: 'La Gazzetta' },
  { href: '/admin/infortuni', testo: 'Indisponibili' },
  { href: '/admin/prova', testo: 'Sala di prova' },
  { href: '/admin/changelog', testo: 'Novità dell\'app' },
];
