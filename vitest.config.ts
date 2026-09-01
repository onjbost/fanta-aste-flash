import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // in test non c'è il confine client/server di Next: il marcatore
      // 'server-only' va neutralizzato, altrimenti i moduli che lo importano
      // non sono nemmeno caricabili.
      //
      // fileURLToPath e non .pathname: su Windows quest'ultimo restituisce
      // "/C:/Users/..." — con lo slash davanti — e la risoluzione fallisce.
      // Su Linux e Mac i due modi coincidono, per questo l'errore si vedeva
      // solo sul PC.
      'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
