import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Una guardia su come si scrive nella coda, non su cosa fa una funzione.
 *
 * `admin_tasks.team_id` serve al raggruppamento per squadra: la coda si
 * legge una rosa per volta, perché il travaso su Leghe Fantacalcio si fa
 * così. La 0028 ha agganciato le righe già scritte leggendo il nome della
 * squadra dentro la frase, ma quello era un travaso una volta sola.
 *
 * Il difetto che questa prova esiste per prendere è già capitato: colonna
 * aggiunta, righe vecchie agganciate, e tutte e tre le insert lasciate come
 * stavano. Le righe nuove sarebbero nate senza squadra e il raggruppamento
 * sarebbe stato morto dal giorno dopo — con i test verdi, perché nessuna
 * funzione pura sa niente di cosa si scrive nel database.
 *
 * Si guarda il codice sorgente perché è l'unico posto dove la cosa si vede
 * senza un database vero. È una prova grossolana, e va bene che lo sia: se
 * un domani una riga della coda non riguarderà nessuna squadra, basterà
 * scriverci `team_id: null` e dire perché.
 */

const SCRITTURE = ['src/lib/settlement.ts', 'src/app/actions.ts'];
const APERTURA = 'from(\'admin_tasks\').insert({';

function insertDellaCoda(file: string): string[] {
  const codice = readFileSync(file, 'utf8');
  return codice.split(APERTURA).slice(1).map((dopo) => {
    const fine = dopo.indexOf('});');
    return fine === -1 ? dopo : dopo.slice(0, fine);
  });
}

describe('chi scrive nella coda operativa', () => {
  it('le insert sono dove le aspettiamo, e sono tre', () => {
    // se questo numero cambia, la prova qui sotto va riletta: è nata su tre
    const quante = SCRITTURE.flatMap(insertDellaCoda).length;
    expect(quante).toBe(3);
  });

  it.each(SCRITTURE)('%s: ogni riga nuova della coda dice a che squadra è', (file) => {
    const blocchi = insertDellaCoda(file);
    expect(blocchi.length).toBeGreaterThan(0);
    for (const b of blocchi) {
      expect(b, `una insert in ${file} non passa team_id:\n${b.trim()}`).toContain('team_id');
    }
  });
});
