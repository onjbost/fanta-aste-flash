/**
 * La Redazione — il codice del preferito.
 *
 * Una funzione pura, e non una stringa scritta dentro il componente, per due
 * motivi. Il primo è che qui dentro finisce la parola d'ordine dell'import:
 * vale la pena avere un posto solo dove viene montata, con dei test sopra.
 * Il secondo è che il componente che la mostra non può testarla — il bug che
 * rendeva il preferito inservibile stava nel modo in cui React trattava
 * l'attributo `href`, non nel codice, che era sempre stato giusto.
 */

/** Il sito senza la barra finale: `https://x/` e `https://x` devono dare lo stesso preferito. */
function radice(sito: string): string {
  return sito.replace(/\/+$/, '');
}

/**
 * Il preferito: mette in `window` l'indirizzo dell'app e la parola d'ordine,
 * poi tira giù lo script vero. Il `?v=` con l'orologio evita che Chrome serva
 * dalla cache una versione vecchia dell'estrattore dopo un rilascio.
 */
export function codiceBookmarklet(sito: string, segreto: string): string {
  const app = radice(sito);
  return `javascript:(function(){window.__FANTA_REDAZIONE={app:'${app}',secret:'${segreto}'};`
    + `var s=document.createElement('script');s.src='${app}/redazione-bookmarklet.js?v='+Date.now();`
    + `document.body.appendChild(s);})()`;
}
