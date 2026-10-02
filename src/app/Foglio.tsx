'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Il foglio dal basso: il dettaglio che si apre sopra la pagina.
 *
 * È un `<dialog>` vero, quindi il fuoco resta dentro, Esc chiude e la pagina
 * sotto è inerte senza altro lavoro. Il tocco sul velo chiude anche lui: il
 * velo è il dialog stesso, fuori dal contenuto.
 *
 * `bloccato` toglie entrambe le uscite: serve alla conferma di presenza in
 * sala, che è una porta da attraversare e non un avviso da scacciare.
 */
export function Foglio({ aperto, onChiudi, titolo, bloccato = false, children }: {
  aperto: boolean;
  onChiudi: () => void;
  titolo: ReactNode;
  bloccato?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aperto && !d.open) d.showModal();
    if (!aperto && d.open) d.close();
  }, [aperto]);

  return (
    <dialog
      ref={ref} className="foglio"
      onCancel={(e) => { e.preventDefault(); if (!bloccato) onChiudi(); }}
      onClick={(e) => { if (!bloccato && e.target === e.currentTarget) onChiudi(); }}
    >
      <div className="foglio-maniglia" aria-hidden="true" />
      <div className="foglio-testa">
        <h2>{titolo}</h2>
        {!bloccato && (
          <button type="button" className="icon-btn" aria-label="Chiudi" onClick={onChiudi}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        )}
      </div>
      {/* il contenuto si monta solo a foglio aperto: i form ripartono puliti */}
      {aperto && children}
    </dialog>
  );
}
