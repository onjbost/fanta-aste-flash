import { describe, expect, it } from 'vitest';
import { italianizza, nellInsiemeSicuro, soloTesto } from './glifi';

describe('italianizza', () => {
  it('non tocca gli accenti italiani: BERNABÈ resta BERNABÈ', () => {
    // toglierli non sarebbe una semplificazione, sarebbe un errore
    for (const n of ['BERNABÈ', 'CALÒ', 'LUCUMÌ', 'SOULÈ', 'DODÒ', 'KESSIÈ', 'perché', 'è', 'così']) {
      expect(soloTesto(n)).toBe(n);
    }
  });

  it('italianizza i nomi slavi come fa il listone', () => {
    expect(soloTesto('Milinković-Savić')).toBe('Milinkovic-Savic');
    expect(soloTesto('Pašalić')).toBe('Pasalic');
    expect(soloTesto('Vlašić')).toBe('Vlasic');
    expect(soloTesto('Đurić')).toBe('Duric');
  });

  it('italianizza i nomi turchi, ı senza punto compresa', () => {
    expect(soloTesto('Yıldız')).toBe('Yildiz');
    expect(soloTesto('Çalhanoğlu')).toBe('Calhanoglu');
    expect(soloTesto('İstanbul')).toBe('Istanbul');
  });

  it('italianizza polacco, danese e tedesco', () => {
    expect(soloTesto('Zieliński')).toBe('Zielinski');
    expect(soloTesto('Håland')).toBe('Haland');
    expect(soloTesto('Højbjerg')).toBe('Hojbjerg');
    expect(soloTesto('Gerhardsson Weiß')).toBe('Gerhardsson Weiss');
  });

  it('raddrizza la punteggiatura tipografica, che i font spesso non hanno', () => {
    expect(soloTesto('l’unica — e poi…')).toBe("l'unica - e poi...");
  });

  it('dice cosa ha sostituito, così l\'admin lo vede nell\'editor', () => {
    const r = italianizza('Pašalić');
    expect(r.testo).toBe('Pasalic');
    expect(r.sostituiti).toEqual(['š→s', 'ć→c']);
  });

  it('non segnala niente quando non ha toccato niente', () => {
    expect(italianizza('Ntonia ne fa quattro perché è così').sostituiti).toEqual([]);
  });

  it('toglie un carattere che non sa tradurre invece di lasciare un quadratino', () => {
    const r = italianizza('Ntonia 中 quattro');
    expect(r.testo).toBe('Ntonia  quattro');
    expect(r.sostituiti).toEqual(['中→(tolto)']);
  });

  it('non lascia passare niente fuori dall\'insieme sicuro', () => {
    // la garanzia che conta: qualunque cosa entri, quello che esce è
    // disegnabile dai font che abbiamo verificato
    const brutto = 'Ćevapčići øre Łódź ß æ œ 中 ’ — Yıldız';
    expect([...soloTesto(brutto)].every(nellInsiemeSicuro)).toBe(true);
  });

  it('regge una stringa vuota e una fatta solo di spazi', () => {
    expect(soloTesto('')).toBe('');
    expect(soloTesto('   ')).toBe('   ');
  });

  it('la stella della sottotestata diventa un pallino: nessun font in uso ha U+2605', () => {
    const { testo, sostituiti } = italianizza('STRUMENTI \u2605 SCARAMANZIE');
    expect(testo).toBe('STRUMENTI \u2022 SCARAMANZIE');
    expect(sostituiti).toContain('\u2605\u2192\u2022');
  });

  it('il pallino passa intatto: \u00e8 nell\'insieme sicuro', () => {
    expect(soloTesto('A \u2022 B')).toBe('A \u2022 B');
  });
});
