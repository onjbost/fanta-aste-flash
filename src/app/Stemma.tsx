/**
 * Lo stemma di una squadra.
 *
 * Gli stemmi li carica a mano l'admin (pagina Allenatori). Finché una squadra
 * non ce l'ha, al suo posto c'è il monogramma con le iniziali: l'app deve
 * reggersi anche il giorno zero, con nessuno stemma caricato.
 */
export function Stemma({ nome, url, size = 36 }: { nome: string; url?: string | null; size?: number }) {
  const stile = { ['--d' as string]: `${size}px` };
  return (
    <span className="stemma" style={stile} aria-hidden="true">
      {url
        // eslint-disable-next-line @next/next/no-img-element -- file nostro su Supabase, piccolo e già ritagliato
        ? <img src={url} alt="" loading="lazy" decoding="async" />
        : iniziali(nome)}
    </span>
  );
}

/** «Real Tettoia» → «RT», «Mansarda FC» → «MF», «Abbaino» → «AB». */
export function iniziali(nome: string): string {
  const parole = nome.trim().split(/\s+/).filter(Boolean);
  if (parole.length === 0) return '?';
  if (parole.length === 1) return parole[0].slice(0, 2).toUpperCase();
  return (parole[0][0] + parole[1][0]).toUpperCase();
}
