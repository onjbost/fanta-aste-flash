/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * resvg è un modulo nativo: webpack prova a impacchettare il `.node` e si
   * ferma su «Unexpected character». Va lasciato fuori dal bundle e caricato
   * a runtime da Node, che è quello che `serverExternalPackages` fa.
   *
   * Satori sta qui per la stessa famiglia di ragioni, scoperta guardando il
   * build: impacchettato, cerca i suoi `.wasm` (yoga e harfbuzz) accanto al
   * file generato — `.next/server/app/api/gazzetta/[id]/png/hb.wasm` — dove
   * non ci sono mai stati. Il build finiva bene lo stesso e l'esportazione
   * sarebbe fallita solo in produzione.
   */
  serverExternalPackages: ['@resvg/resvg-js', 'satori'],

  /*
   * I font della Gazzetta si leggono dal disco a runtime (Satori per il PNG,
   * la rotta `/api/gazzetta/font` per l'anteprima). Next traccia i file che
   * una funzione importa, ma un `readFile` con un percorso costruito non lo
   * vede: senza questa riga, in produzione la cartella non viene deployata e
   * l'esportazione fallisce solo lì, cioè dove non si prova mai prima.
   */
  outputFileTracingIncludes: {
    '/api/gazzetta/**': ['./src/lib/gazzetta/font/**'],
  },
};

export default nextConfig;
