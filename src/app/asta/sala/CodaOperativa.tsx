'use client';

import { useState } from 'react';
import { rigaDellaCoda, testoDellaCoda, totaleDellaCoda, type VoceDellaCoda } from '@/lib/coda';

/**
 * I lotti che si assegnano senza asta: l'anteprima, non la coda.
 *
 * I lotti senza contendenti non vanno all'asta: si assegnano da soli al 75%
 * dello svincolando nel momento in cui la sala apre. Il messaggio di
 * apertura elenca solo i lotti contesi, e lo svincolando resta coperto fino
 * a quell'istante: senza questo pannello l'admin sa chi entra ma non chi
 * esce. È successo davvero alla prima asta.
 *
 * Qui non si spunta più niente. Le spunte c'erano e vivevano nella pagina:
 * ricaricando ripartivano da zero. Le righe da spuntare sono quelle della
 * coda operativa qui sotto, che stanno nel database e si segnano una volta
 * per tutte; questo pannello dice soltanto cosa sta per succedere.
 */
export function CodaOperativa({ voci, aperta }: { voci: VoceDellaCoda[]; aperta: boolean }) {
  const [copiato, setCopiato] = useState(false);

  if (!voci.length) return null;

  async function copia() {
    try {
      await navigator.clipboard.writeText(testoDellaCoda(voci));
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <div className="panel coda" style={{ padding: 16, marginBottom: 20 }}>
      <p className="eyebrow" style={{ margin: '0 0 4px' }}>Si assegnano senza asta · solo admin</p>
      <p className="sub" style={{ margin: '0 0 10px' }}>
        {voci.length} {voci.length === 1 ? 'lotto si assegna' : 'lotti si assegnano'} senza asta,
        per {totaleDellaCoda(voci)} crediti in tutto.
        {aperta
          ? ' Nell’app è già fatto: li ritrovi nella coda operativa, da spuntare mentre li riporti.'
          : ' Si assegnano nel momento in cui apri la sala.'}
      </p>

      <ul className="coda-righe coda-anteprima">
        {voci.map((v) => (
          <li key={v.lottoId}><span>{rigaDellaCoda(v)}</span></li>
        ))}
      </ul>

      <button type="button" className="ghost" onClick={copia}>
        {copiato ? 'Copiato' : 'Copia l’elenco'}
      </button>
    </div>
  );
}
