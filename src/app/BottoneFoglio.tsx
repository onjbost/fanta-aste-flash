'use client';

import { useState, type ReactNode } from 'react';
import { Foglio } from './Foglio';

/**
 * Un bottone che apre un foglio con dentro quello che gli passa il server:
 * i filtri del registro, per esempio, che sono un form GET qualunque.
 */
export function BottoneFoglio({ etichetta, titolo, conteggio = 0, children }: {
  etichetta: string; titolo: string; conteggio?: number; children: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <button type="button" className="chip" aria-pressed={conteggio > 0} onClick={() => setAperto(true)}>
        {etichetta}{conteggio > 0 && <span className="livello">{conteggio}</span>}
      </button>
      <Foglio aperto={aperto} onChiudi={() => setAperto(false)} titolo={titolo}>
        <div>{children}</div>
      </Foglio>
    </>
  );
}
