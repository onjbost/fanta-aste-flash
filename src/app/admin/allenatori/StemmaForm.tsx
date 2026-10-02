'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Stemma } from '../../Stemma';
import { caricaStemma, rimuoviStemma, type StemmaState } from './stemmi';

/**
 * Carica, sostituisci o togli lo stemma di una squadra.
 *
 * L'anteprima mostra il file scelto già dentro il cerchio, nella misura del
 * banner partita: è lì che si vede se un logo largo viene tagliato o se uno
 * con il fondo bianco fa un buco nel verde.
 */
/** Il lato lungo dello stemma salvato: il cerchio più grande è di 56px, 256 basta anche agli schermi densi. */
const LATO = 256;
const MAX_BYTE = 500 * 1024;

/**
 * Rimpicciolisce un'immagine nel browser e la riconsegna in WebP (o PNG dove
 * il WebP non si sa scrivere).
 *
 * Esiste per un motivo preciso: le azioni del server accettano al massimo
 * 1 MB, e un logo scaricato da internet lo supera facilmente. Oltre quella
 * soglia Next non fa nemmeno partire l'azione — risponde con una pagina
 * d'errore, ed è quello che è successo con lo stemma del Montester. Così
 * qualunque PNG, JPG o WebP arriva al server già piccolo.
 */
async function rimpicciolisci(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scala = Math.min(1, LATO / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scala));
  const h = Math.max(1, Math.round(bitmap.height * scala));
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  tela.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/webp', 0.9));
  if (!blob) throw new Error('immagine illeggibile');
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `stemma.${ext}`, { type: blob.type });
}

export function StemmaForm({ teamId, nome, url }: { teamId: string; nome: string; url: string | null }) {
  const [carica, azioneCarica, caricando] = useActionState<StemmaState, FormData>(caricaStemma, null);
  const [togli, azioneTogli, togliendo] = useActionState<StemmaState, FormData>(rimuoviStemma, null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [pronto, setPronto] = useState<File | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  useEffect(() => () => { if (anteprima) URL.revokeObjectURL(anteprima); }, [anteprima]);
  // a caricamento riuscito l'anteprima locale lascia il posto al file vero
  useEffect(() => { if (carica?.ok) { setAnteprima(null); setPronto(null); } }, [carica]);

  async function scegli(f: File | undefined) {
    setAvviso(null);
    setPronto(null);
    setAnteprima(null);
    if (!f) return;
    try {
      // l'SVG è già leggero e resta vettoriale: si manda com'è, se ci sta
      const file = f.type === 'image/svg+xml' ? f : await rimpicciolisci(f);
      if (file.size > MAX_BYTE) {
        setAvviso('Questo SVG supera i 500 KB: usa un PNG, lo rimpicciolisco io.');
        return;
      }
      setPronto(file);
      setAnteprima(URL.createObjectURL(file));
    } catch {
      setAvviso('Non riesco a leggere questa immagine: prova con un PNG o un JPG.');
    }
  }

  function salva() {
    if (!pronto) return;
    const fd = new FormData();
    fd.set('teamId', teamId);
    fd.set('file', pronto);
    startTransition(() => azioneCarica(fd));
  }

  const esito = avviso ? { ok: false, message: avviso } : togli ?? carica;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      <Stemma nome={nome} url={anteprima ?? url} size={56} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="btn" style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '.9rem', color: 'var(--ink)' }}>
          {url ? 'Cambia stemma' : 'Carica stemma'}
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only"
            onChange={(e) => { void scegli(e.target.files?.[0]); }}
          />
        </label>
        {pronto && (
          <button type="button" className="primary" disabled={caricando} onClick={salva}>
            {caricando ? 'Carico…' : 'Salva'}
          </button>
        )}
      </div>
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
