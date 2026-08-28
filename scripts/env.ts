import { existsSync, readFileSync } from 'node:fs';

/**
 * Carica .env.local dentro process.env.
 *
 * Gli script da riga di comando non passano da Next, che invece i file .env
 * li legge da solo: senza questo, l'import non troverebbe le chiavi anche
 * avendole scritte nel posto giusto. Nessuna dipendenza esterna, una
 * ventina di righe: fa esattamente quello che serve e niente di più.
 *
 * Le variabili già presenti nell'ambiente vincono sul file, così si può
 * sempre forzare un valore al volo senza modificare niente.
 */
export function loadEnv(file = '.env.local'): void {
  if (!existsSync(file)) return;

  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();

    // toglie le virgolette se ci sono, ma solo se aprono e chiudono
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
