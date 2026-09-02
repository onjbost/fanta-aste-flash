import { describe, expect, it } from 'vitest';
import { percorsoPubblico } from './middleware';

/**
 * Questi test nascono da un errore vero, trovato solo in produzione: il
 * middleware rimandava al login anche le rotte API e il file del preferito.
 * L'endpoint dell'import rispondeva 405 e il preferito riceveva la pagina di
 * login travestita da JavaScript — due sintomi che non dicono niente sulla
 * causa. Da qui in poi la decisione è provata.
 */
describe('percorsoPubblico', () => {
  it('lascia passare le rotte API, che si autenticano da sole', () => {
    expect(percorsoPubblico('/api/redazione/importa')).toBe(true);
    expect(percorsoPubblico('/api/cron')).toBe(true);
  });

  it('lascia passare il file del preferito, caricato dalla pagina della lega', () => {
    expect(percorsoPubblico('/redazione-bookmarklet.js')).toBe(true);
  });

  it('lascia passare login e callback di autenticazione', () => {
    expect(percorsoPubblico('/login')).toBe(true);
    expect(percorsoPubblico('/auth/callback')).toBe(true);
  });

  it('protegge tutto il resto', () => {
    for (const p of ['/', '/admin', '/admin/redazione', '/asta/sala', '/schedine', '/listone']) {
      expect(percorsoPubblico(p)).toBe(false);
    }
  });

  it('non si fa aprire da un percorso che somiglia a uno pubblico', () => {
    expect(percorsoPubblico('/apixyz')).toBe(false);
    expect(percorsoPubblico('/redazione-bookmarklet.js.map')).toBe(false);
  });
});
