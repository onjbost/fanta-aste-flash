import { describe, expect, it } from 'vitest';
import { cognomeDaListone, nominato } from './nomi';

describe('cognomeDaListone', () => {
  it('toglie l\'iniziale puntata, che è il nome e non il cognome', () => {
    expect(cognomeDaListone('TAVARES N.')).toBe('TAVARES');
    expect(cognomeDaListone('MARTINEZ L.')).toBe('MARTINEZ');
    expect(cognomeDaListone('RODRIGUEZ JE.')).toBe('RODRIGUEZ');
  });

  it('lascia stare un nome che l\'iniziale non ce l\'ha', () => {
    expect(cognomeDaListone('KALULU')).toBe('KALULU');
    expect(cognomeDaListone('Yildiz')).toBe('Yildiz');
  });

  it('di un cognome composto tiene la prima parola', () => {
    expect(cognomeDaListone('MILINKOVIC-SAVIC V.')).toBe('MILINKOVIC-SAVIC');
  });
});

describe('nominato', () => {
  /*
   * Il guasto che questa funzione esiste per evitare: la verifica dello
   * scambio pretendeva il nome nella forma del listone, e «TAVARES N.» in un
   * pezzo scritto in italiano non compare mai. Ogni scambio con un giocatore
   * dall'iniziale puntata veniva bocciato due volte su due e finiva al
   * ripiego — che è esattamente quello che succedeva in produzione.
   */
  it('riconosce il cognome da solo, che è come scrive un cronista', () => {
    expect(nominato('Il Borussia si prende Tavares e se la ride.', 'TAVARES N.')).toBe(true);
    expect(nominato('Lautaro Martinez cambia maglia.', 'MARTINEZ L.')).toBe(true);
  });

  it('riconosce anche il nome per intero', () => {
    expect(nominato('Esce TAVARES N., entra KALULU.', 'TAVARES N.')).toBe(true);
  });

  it('non si fa ingannare dalle maiuscole', () => {
    expect(nominato('kalulu saluta', 'KALULU')).toBe(true);
  });

  it('dice di no quando il giocatore non c\'è', () => {
    expect(nominato('Il Borussia si prende un difensore.', 'TAVARES N.')).toBe(false);
  });

  it('non conta un cognome dentro un\'altra parola', () => {
    // «KEAN» dentro «KEANU»: il confine di parola serve a questo
    expect(nominato('Si parla di KEANU tutto il giorno.', 'KEAN')).toBe(false);
  });

  it('tiene il confine anche accanto alla punteggiatura', () => {
    expect(nominato('Saluta Kalulu, e buonanotte.', 'KALULU')).toBe(true);
    expect(nominato('«Tavares»: questo il nome.', 'TAVARES N.')).toBe(true);
  });

  it('un cognome troppo corto non basta: comparirebbe per caso', () => {
    expect(nominato('Va e viene.', 'VA')).toBe(false);
  });
});
