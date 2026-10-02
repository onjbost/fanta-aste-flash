'use client';

import { useActionState, useEffect, useState } from 'react';
import { Stemma } from '../../Stemma';
import { caricaStemma, rimuoviStemma, type StemmaState } from './stemmi';

/**
 * Carica, sostituisci o togli lo stemma di una squadra.
 *
 * L'anteprima mostra il file scelto già dentro il cerchio, nella misura del
 * banner partita: è lì che si vede se un logo largo viene tagliato o se uno
 * con il fondo bianco fa un buco nel verde.
 */
export function StemmaForm({ teamId, nome, url }: { teamId: string; nome: string; url: string | null }) {
  const [carica, azioneCarica, caricando] = useActionState<StemmaState, FormData>(caricaStemma, null);
  const [togli, azioneTogli, togliendo] = useActionState<StemmaState, FormData>(rimuoviStemma, null);
  const [anteprima, setAnteprima] = useState<string | null>(null);

  useEffect(() => () => { if (anteprima) URL.revokeObjectURL(anteprima); }, [anteprima]);
  // a caricamento riuscito l'anteprima locale lascia il posto al file vero
  useEffect(() => { if (carica?.ok) setAnteprima(null); }, [carica]);

  const esito = togli ?? carica;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      <Stemma nome={nome} url={anteprima ?? url} size={56} />
      <form action={azioneCarica} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="hidden" name="teamId" value={teamId} />
        <label className="btn" style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '.9rem', color: 'var(--ink)' }}>
          {url ? 'Cambia stemma' : 'Carica stemma'}
          <input
            type="file" name="file" accept="image/png,image/webp,image/svg+xml" className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setAnteprima(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>
        {anteprima && (
          <button type="submit" className="primary" disabled={caricando}>
            {caricando ? 'Carico…' : 'Salva'}
          </button>
        )}
      </form>
      {url && !anteprima && (
        <form action={azioneTogli}>
          <input type="hidden" name="teamId" value={teamId} />
          <button type="submit" disabled={togliendo} style={{ color: 'var(--crit)' }}>Togli</button>
        </form>
      )}
      {esito && (
        <span className={`tag ${esito.ok ? 'ok' : 'crit'}`} role="status" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {esito.message}
        </span>
      )}
    </div>
  );
}
