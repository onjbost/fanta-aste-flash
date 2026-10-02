'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from './actions';
import { ICONE } from './BottomNav';
import { Stemma } from './Stemma';
import { GRUPPI_ADMIN } from './vociAdmin';

/**
 * Il cassetto ☰, uno solo per tutti.
 *
 * Prima ce n'erano due: la barra in basso con sette voci e, per l'admin, un
 * secondo cassetto appeso in alto a sinistra. Adesso la barra ha le cinque
 * cose che si fanno, e qui stanno quelle che si consultano — più l'area admin
 * raggruppata in fondo, che chi non è admin non vede proprio.
 */

const COMUNI = [
  { href: '/registro', testo: 'Registro', icona: ICONE.registro },
  { href: '/regolamento', testo: 'Regolamento', icona: ICONE.regolamento },
];


/** La voce che corrisponde alla pagina di adesso, senza falsi positivi. */
function attiva(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Disegna la testata e, accanto a lei (non dentro), velo e cassetto.
 *
 * Il resto della testata (marchio, saldo) arriva come `children`. Stare fuori
 * dalla testata non è un dettaglio: qualunque cosa la renda contenitore dei
 * figli `position:fixed` — uno sfondo sfocato, una trasformazione, un browser
 * che fa a modo suo — chiudeva il cassetto nei suoi 64px. Da fratello non
 * c'è antenato che lo possa rimpicciolire.
 */
export function Cassetto({ squadra, crediti, stemma, isAdmin, indietro, children }: {
  squadra: string; crediti: number | null; stemma: string | null; isAdmin: boolean;
  /** se c'è, al posto del ☰ una freccia che porta qui */
  indietro?: string;
  children?: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const pathname = usePathname();
  const bottone = useRef<HTMLButtonElement>(null);
  const pannello = useRef<HTMLElement>(null);

  // cambiando pagina il cassetto si chiude da solo: restare aperto sopra la
  // pagina nuova sembrerebbe che il tocco non abbia funzionato
  useEffect(() => { setAperto(false); }, [pathname]);

  useEffect(() => {
    if (!aperto) return;
    const suTasto = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', suTasto);
    // niente scorrimento della pagina dietro al velo, o il dito sul telefono
    // muove quello che sta sotto invece del cassetto
    const prima = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    pannello.current?.focus();
    return () => {
      document.removeEventListener('keydown', suTasto);
      document.body.style.overflow = prima;
    };
  }, [aperto]);

  function chiudi() {
    setAperto(false);
    // il fuoco torna da dove è partito: da tastiera, altrimenti si finisce
    // in cima al documento senza sapere dove
    bottone.current?.focus();
  }

  // chiuso, il cassetto non esiste per nessuno: fuori dalla tabulazione e
  // nascosto ai lettori di schermo (React 18 non conosce `inert`)
  const tab = aperto ? undefined : -1;

  return (
    <>
      <header className="topbar">
      {/* nelle pagine a schermo pieno il primo tasto riporta indietro: da lì
          si esce, non si naviga altrove */}
      {indietro ? (
        <Link href={indietro} className="icon-btn" aria-label="Indietro">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </Link>
      ) : (
        <button
          ref={bottone} type="button" className="icon-btn"
          aria-label="Apri il menù" aria-expanded={aperto} aria-controls="cassetto"
          onClick={() => setAperto(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></svg>
        </button>
      )}
      {children}
      </header>

      <div className={`cassetto-velo${aperto ? ' aperto' : ''}`} onClick={chiudi} aria-hidden="true" />

      <nav
        id="cassetto" ref={pannello} tabIndex={-1} aria-label="Menù"
        className={`cassetto${aperto ? ' aperto' : ''}`} aria-hidden={!aperto}
      >
        <div className="cassetto-testa">
          <Stemma nome={squadra} url={stemma} size={44} />
          <div className="chi">
            <div className="nome">{squadra}</div>
            {crediti !== null && <div className="crediti">{crediti} crediti</div>}
          </div>
        </div>

        <ul>
          {COMUNI.map((v) => (
            <li key={v.href}>
              <Link href={v.href} tabIndex={tab} aria-current={attiva(pathname, v.href) ? 'page' : undefined}>
                {v.icona}{v.testo}
              </Link>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <>
            <div className="cassetto-sezione">Admin</div>
            {GRUPPI_ADMIN.map((g, i) => (
              <div key={g.titolo ?? `gruppo-${i}`}>
                {g.titolo && <div className="cassetto-gruppo">{g.titolo}</div>}
                <ul>
                  {g.voci.map((v) => (
                    <li key={v.href}>
                      <Link href={v.href} tabIndex={tab} aria-current={attiva(pathname, v.href) ? 'page' : undefined}
                            style={{ paddingLeft: g.titolo ? 54 : 42 }}>
                        {v.testo}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        <form action={signOut} style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button type="submit" className="voce esci" tabIndex={tab}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" />
            </svg>
            Esci
          </button>
        </form>
      </nav>
    </>
  );
}
