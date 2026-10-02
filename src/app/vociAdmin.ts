/**
 * Le sezioni dell'area admin, raggruppate come le mostra il cassetto. Stanno
 * qui, fuori dal cassetto, perché un modulo client non può prestare un
 * semplice elenco a una pagina del server.
 *
 * L'ordine è quello del lavoro: prima la coda delle cose da fare, poi le
 * squadre, poi i testi per la lega, e in fondo gli strumenti.
 */
export interface VoceAdmin { href: string; testo: string }
export interface GruppoAdmin { titolo: string | null; voci: VoceAdmin[] }

export const GRUPPI_ADMIN: GruppoAdmin[] = [
  { titolo: null, voci: [{ href: '/admin', testo: 'Coda operativa' }] },
  {
    titolo: 'Gestione squadre',
    voci: [
      { href: '/admin/rose', testo: 'Gestione rose' },
      { href: '/admin/crediti', testo: 'Gestione crediti' },
      { href: '/admin/allenatori', testo: 'Allenatori e stemmi' },
      { href: '/admin/scambi', testo: 'Scambi' },
      { href: '/admin/infortuni', testo: 'Indisponibili' },
    ],
  },
  {
    titolo: 'Comunicazione',
    voci: [
      { href: '/admin/messaggi', testo: 'Testi per il gruppo' },
      { href: '/admin/gazzetta', testo: 'La Gazzetta' },
      { href: '/admin/redazione', testo: 'La redazione' },
    ],
  },
  {
    titolo: null,
    voci: [
      { href: '/admin/schedine', testo: 'Tipster' },
      { href: '/admin/prova', testo: 'Sala di prova' },
      { href: '/admin/changelog', testo: 'Novità dell\'app' },
      // TEMPORANEO: collaudo del calcolo automatico, da togliere
      { href: '/admin/prova-cron', testo: 'Prova del cron (temporaneo)' },
    ],
  },
];

/** Tutte le voci in fila, per chi non ha bisogno dei gruppi. */
export const VOCI_ADMIN: VoceAdmin[] = GRUPPI_ADMIN.flatMap((g) => g.voci);
