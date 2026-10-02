import Link from 'next/link';
import { GRUPPI_ADMIN } from '../vociAdmin';

/**
 * Le azioni rapide di una pagina admin: le altre voci del suo gruppo nel
 * menu. Su Gestione rose, per dire, Gestione crediti, Allenatori, Scambi e
 * Indisponibili. Vengono dallo stesso elenco del cassetto, quindi menu e
 * scorciatoie non possono andare fuori passo.
 */
export function AzioniGruppo({ pagina }: { pagina: string }) {
  const gruppo = GRUPPI_ADMIN.find((g) => g.voci.some((v) => v.href === pagina));
  const altre = gruppo?.voci.filter((v) => v.href !== pagina) ?? [];
  if (!altre.length) return null;
  return (
    <nav className="azioni-gruppo" aria-label={gruppo?.titolo ?? 'Altre sezioni'}>
      {altre.map((v) => <Link key={v.href} href={v.href}>{v.testo}</Link>)}
    </nav>
  );
}
