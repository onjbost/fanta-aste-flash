/**
 * I toni di lega, condivisi da tutto quello che scrive per il gruppo.
 *
 * Modulo minuscolo e senza effetti collaterali apposta: `modello.ts` porta
 * con sé `ModelloGemini` e `scegliModello()`, che leggono variabili
 * d'ambiente e fanno `fetch` — roba da server. `scambio.ts` invece finisce
 * anche nel bundle del browser (il form di modifica scambio lo usa lato
 * client), quindi non può importare `modello.ts` senza trascinarsi dietro
 * Gemini. Chi vuole solo il tono importa da qui.
 */

export const TONI: Record<number, string> = {
  1: 'affettuoso, nessuna presa in giro',
  2: 'ironico ma bonario: battute leggere, nessuno si sente attaccato',
  3: 'sfottò da gruppo WhatsApp: chi perde viene punzecchiato, chi vince ridimensionato',
  4: 'cronaca sportiva velenosa: sarcasmo marcato, il perdente viene smontato pezzo per pezzo',
  5: 'nessuna pietà: insulto sportivo pieno',
};

export function tono(n: number): string {
  return TONI[n] ?? TONI[3];
}
