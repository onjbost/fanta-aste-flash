import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // in test non c'è il confine client/server di Next: il marcatore
      // 'server-only' va neutralizzato, altrimenti i moduli che lo importano
      // non sono nemmeno caricabili.
      'server-only': new URL('./test/server-only.ts', import.meta.url).pathname,
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
