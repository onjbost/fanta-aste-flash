'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Il menù dell'area admin.
 *
 * Le voci stavano in una fila di bottoni sulla sola `/admin`: da ogni altra
 * pagina, per passare da «Rose e import» a «Tipster», bisognava tornare
 * indietro. Adesso stanno in un cassetto che si apre da qualunque pagina
 * sotto `/admin`, e il bottone resta appeso in alto a sinistra anche quando
 * la pagina è scorsa — è la ragione per cui è fisso e non dentro la barra:
 * su un telefono, a metà di una tabella di rose, la barra non c'è più.
 *
 * Il cassetto entra da sinistra perché il bottone è a sinistra: la cosa che
 * si apre deve arrivare da dove l'hai toccata.
 */

const VOCI: { href: string; testo: string }[] = [
  { href: '/admin', testo: 'Pannello admin' },
  { href: '/admin/rose', testo: 'Rose e import' },
  { href: '/admin/allenatori', testo: 'Allenatori' },
  { href: '/admin/messaggi', testo: 'Centro messaggi' },
  { href: '/admin/schedine', testo: 'Tipster' },
  { href: '/admin/redazione', testo: 'La redazione' },
  { href: '/asta/sala', testo: 'Sala d\'asta' },
  { href: '/admin/prova', testo: 'Sala di prova' },
];

/** La voce che corrisponde alla pagina di adesso, senza falsi positivi. */
function attiva(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MenuAdmin() {
  const [aperto, setAperto] = useState(false);
  const pathname = usePathname();
  const bottone = useRef<HTMLButtonElement>(null);
  const cassetto = useRef<HTMLElement>(null);

  // cambiando pagina il cassetto si chiude da solo: restare aperto sopra la
  // pagina nuova sembrerebbe che il clic non abbia funzionato
  useEffect(() => { setAperto(false); }, [pathname]);

  useEffect(() => {
    if (!aperto) return;

    const suTasto = (e: KeyboardEvent) => { if (e.key === 'Escape') setAperto(false); };
    document.addEventListener('keydown', suTasto);

    // niente scorrimento della pagina dietro al velo, o il dito sul telefono
    // muove quello che sta sotto invece del menù
    const prima = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    cassetto.current?.focus();
    return () => {
      document.removeEventListener('keydown', suTasto);
      document.body.style.overflow = prima;
    };
  }, [aperto]);

  const chiudi = () => {
    setAperto(false);
    // il fuoco torna da dove è partito: da tastiera, altrimenti si finisce
    // in cima al documento senza sapere dove
    bottone.current?.focus();
  };

  return (
    <>
      <button
        ref={bottone}
        type="button"
        className="menu-admin-apri"
        aria-label={aperto ? 'Chiudi il menù admin' : 'Apri il menù admin'}
        aria-expanded={aperto}
        aria-controls="menu-admin"
        onClick={() => (aperto ? chiudi() : setAperto(true))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {aperto
            ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
            : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
        </svg>
      </button>

      <div
        className={`menu-admin-velo${aperto ? ' aperto' : ''}`}
        onClick={chiudi}
        aria-hidden="true"
      />

      <nav
        id="menu-admin"
        ref={cassetto}
        tabIndex={-1}
        className={`menu-admin${aperto ? ' aperto' : ''}`}
        aria-label="Sezioni admin"
        /*
         * Chiuso, il cassetto non deve esistere per nessuno.
         *
         * È fuori schermo con una trasformazione, non con `display:none`:
         * senza `aria-hidden` il lettore di schermo lo leggerebbe lo stesso,
         * e senza togliere i collegamenti dalla sequenza di tabulazione da
         * tastiera ci si finirebbe dentro senza vedere dove si è.
         *
         * `inert` farebbe le due cose insieme ma React 18 non lo conosce e
         * lo scarterebbe; qui si fa a mano, che è esplicito e funziona su
         * tutti i browser.
         */
        aria-hidden={!aperto}
      >
        <div className="menu-admin-testa">Amministrazione</div>
        <ul>
          {VOCI.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                aria-current={attiva(pathname, v.href) ? 'page' : undefined}
                tabIndex={aperto ? undefined : -1}
                onClick={() => setAperto(false)}
              >
                {v.testo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
