/**
 * Il velo di caricamento: la pagina che sta arrivando resta sotto, sfocata,
 * e al centro un pallone che rotola dentro l'anello di avanzamento.
 *
 * Tutto in CSS e SVG, niente JavaScript e nessuna immagine da scaricare:
 * l'animazione parte nello stesso istante in cui parte l'attesa, che è
 * esattamente quando servirebbe di più e quando il browser ha meno tempo.
 *
 * Dopo qualche secondo compare da sola una riga di spiegazione: se Supabase
 * dormiva da giorni la prima richiesta lo sveglia, e sapere perché si aspetta
 * rende l'attesa molto più corta di quanto sia.
 */
export function Caricamento({ nota }: { nota?: string }) {
  return (
    <div className="caricamento" role="status" aria-live="polite">
      <div className="caricamento-centro">
        {/* l'anello, stile Windows 11: un arco che gira e cambia lunghezza */}
        <svg className="anello" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="anello-pista" cx="50" cy="50" r="42" />
          <circle className="anello-arco" cx="50" cy="50" r="42" />
        </svg>

        {/* il pallone: dondola da un lato all'altro mentre rotola */}
        <span className="pallone-dondolo">
          <svg className="pallone" viewBox="-50 -50 100 100" aria-hidden="true">
            <circle className="cuoio" cx="0" cy="0" r="30" />
            <g className="pezze">
              <polygon points="0,-14 13.3,-4.3 8.2,11.3 -8.2,11.3 -13.3,-4.3" />
              <path d="M0,-14 L0,-30" /><path d="M13.3,-4.3 L28.5,-9.3" />
              <path d="M8.2,11.3 L17.6,24.3" /><path d="M-8.2,11.3 L-17.6,24.3" />
              <path d="M-13.3,-4.3 L-28.5,-9.3" />
            </g>
          </svg>
        </span>
      </div>

      <p className="caricamento-nota">
        {nota ?? 'Ci sto mettendo più del solito: sveglio il database e arrivo.'}
      </p>
      <span className="sr-only">Carico…</span>
    </div>
  );
}
