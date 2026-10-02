/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * Le azioni del server accettano 1 MB per difetto, e oltre quella soglia
   * Next non le fa nemmeno partire: risponde con una pagina d'errore. Lo
   * stemma del Montester era più grosso, e l'admin si è trovato davanti
   * «Application error» invece di un messaggio. Il browser adesso
   * rimpicciolisce le immagini prima di mandarle; questo margine fa sì che un
   * file sfuggito arrivi comunque all'azione, che lo rifiuta a parole.
   */
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },

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
    '/api/gazzetta/**': [
      './src/lib/gazzetta/font/**',
      /*
       * `hb.wasm` è la seconda metà dello stesso problema, e in produzione
       * è costata un'esportazione: Satori disegna il testo con harfbuzz, e
       * harfbuzz carica il suo `.wasm` con un `readFile` costruito a
       * runtime. Il tracciatore segue gli import, quindi porta con sé
       * `hb.js` — che infatti c'era — ma non il `.wasm` che quel file apre.
       *
       * Il sintomo era «ENOENT: /var/task/node_modules/harfbuzzjs/hb.wasm»
       * e succedeva solo su Vercel, perché in locale `node_modules` c'è
       * tutto. Si controlla senza aspettare un deploy: dopo il build, in
       * `.next/server/app/api/gazzetta/[id]/png/route.js.nft.json` deve
       * comparire `harfbuzzjs/hb.wasm`.
       *
       * Yoga invece non serve: `yoga-layout` si porta il wasm dentro il
       * JavaScript, in base64.
       */
      './node_modules/harfbuzzjs/hb.wasm',
    ],

    /*
     * Il changelog è il CHANGELOG.md del repo, letto a runtime: stesso
     * problema dei font, stessa cura. Senza questa riga la pagina
     * funzionerebbe in locale e in produzione direbbe «il file non è
     * arrivato nel pacchetto» — che almeno è un messaggio onesto, ma non è
     * la pagina.
     */
    '/admin/changelog': ['./CHANGELOG.md'],
  },
};

export default nextConfig;
