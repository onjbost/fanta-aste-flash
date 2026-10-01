'use client';

import { useState } from 'react';
import { rigaDellaCoda, testoDellaCoda, totaleDellaCoda, type VoceDellaCoda } from '@/lib/coda';

/**
 * Quello che l'admin deve fare a mano su Leghe Fantacalcio.
 *
 * I lotti senza contendenti non vanno all'asta: si assegnano da soli al 75%
 * dello svincolando. Nell'app il movimento è registrato, fuori no — e fuori
 * il lavoro è manuale, una rosa per volta. Fino a ieri questo elenco non
 * esisteva da nessuna parte: il messaggio di apertura mostra solo i lotti
 * contesi, e lo svincolando resta coperto fino all'apertura della sala.
 *
 * Le righe si spuntano: con otto squadre e quattro movimenti, perdere il
 * segno è questione di un attimo. La spunta vive in questa pagina e basta —
 * è un promemoria per i dieci minuti che ci vogliono, non uno stato da
 * conservare.
 */
export function CodaOperativa({ voci, aperta }: { voci: VoceDellaCoda[]; aperta: boolean }) {
  const [fatte, setFatte] = useState<string[]>([]);
  const [copiato, setCopiato] = useState(false);

  if (!voci.length) return null;

  const spunta = (id: string) => setFatte((v) =>
    (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

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
      <p className="eyebrow" style={{ margin: '0 0 4px' }}>Coda operativa · solo admin</p>
      <p className="sub" style={{ margin: '0 0 10px' }}>
        {voci.length} {voci.length === 1 ? 'lotto si assegna' : 'lotti si assegnano'} senza asta,
        per {totaleDellaCoda(voci)} crediti in tutto.
        {aperta
          ? ' Nell’app è già fatto: questi movimenti vanno riportati su Leghe Fantacalcio.'
          : ' Si assegnano nel momento in cui apri la sala.'}
      </p>

      <ul className="coda-righe">
        {voci.map((v) => (
          <li key={v.lottoId} className={fatte.includes(v.lottoId) ? 'fatta' : undefined}>
            <label>
              <input
                type="checkbox" checked={fatte.includes(v.lottoId)}
                onChange={() => spunta(v.lottoId)}
              />
              <span>{rigaDellaCoda(v)}</span>
            </label>
          </li>
        ))}
      </ul>

      <button type="button" className="ghost" onClick={copia}>
        {copiato ? 'Copiato' : 'Copia l’elenco'}
      </button>
    </div>
  );
}
