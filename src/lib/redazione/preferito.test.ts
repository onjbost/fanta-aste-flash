import { describe, expect, it } from 'vitest';
import { codiceBookmarklet } from './preferito';

const SITO = 'https://fanta-aste-flash.vercel.app';
const SEGRETO = 'parola_lunga_a_caso';

describe('codiceBookmarklet', () => {
  it('è un preferito eseguibile, non un link a una pagina', () => {
    expect(codiceBookmarklet(SITO, SEGRETO)).toMatch(/^javascript:\(function\(\)\{/);
  });

  it('porta con sé indirizzo dell\'app e parola d\'ordine', () => {
    const c = codiceBookmarklet(SITO, SEGRETO);
    expect(c).toContain(`app:'${SITO}'`);
    expect(c).toContain(`secret:'${SEGRETO}'`);
  });

  it('carica l\'estrattore dal sito, non da altrove', () => {
    expect(codiceBookmarklet(SITO, SEGRETO))
      .toContain(`s.src='${SITO}/redazione-bookmarklet.js?v='+Date.now()`);
  });

  it('non lascia due barre quando il sito finisce con una', () => {
    const c = codiceBookmarklet(SITO + '/', SEGRETO);
    expect(c).not.toContain('//redazione-bookmarklet.js');
    expect(c).toContain(`app:'${SITO}'`);
    expect(c).toBe(codiceBookmarklet(SITO, SEGRETO));
  });

  it('chiede la versione a ogni click, così un rilascio non resta in cache', () => {
    // Date.now() dev'essere *dentro* il preferito, valutato al click: se fosse
    // interpolato qui resterebbe congelato al momento in cui la pagina è stata
    // aperta, e dopo un rilascio l'admin userebbe l'estrattore vecchio.
    const c = codiceBookmarklet(SITO, SEGRETO);
    expect(c).toContain("+Date.now()");
    expect(c).not.toMatch(/\?v=\d{10,}/);
  });
});
