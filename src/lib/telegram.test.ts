import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeMarkdown, telegramConfigured, notifyAdmin,
  tgNewCall, tgFreeReleaseRequest, tgPhaseChange, tgLotSettled, tgSessionClosed,
} from './telegram';

const ENV = { ...process.env };

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '999';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://aste.example.it';
});

afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe('configurazione', () => {
  it('sa quando il bot è pronto', () => {
    expect(telegramConfigured()).toBe(true);
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(telegramConfigured()).toBe(false);
  });
});

describe('escape di MarkdownV2', () => {
  it('disinnesca i caratteri che farebbero fallire l\'invio', () => {
    expect(escapeMarkdown('Martinez L. (Inter) 75%-100%'))
      .toBe('Martinez L\\. \\(Inter\\) 75%\\-100%');
  });

  it('lascia in pace il testo normale', () => {
    expect(escapeMarkdown('Kolasinac Atalanta')).toBe('Kolasinac Atalanta');
  });
});

describe('invio', () => {
  it('non manda niente e non esplode se il bot non è configurato', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const r = await notifyAdmin('ciao');
    expect(r).toEqual({ sent: false, reason: 'Telegram non configurato' });
  });

  it('chiama l\'API di Telegram con la chat dell\'admin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await notifyAdmin('prova');
    expect(r.sent).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ chat_id: '999', text: 'prova', parse_mode: 'MarkdownV2' });
  });

  it('se Telegram risponde male lo dice, ma non lancia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => 'bad request',
    }));
    const r = await notifyAdmin('prova');
    expect(r.sent).toBe(false);
    expect(r.reason).toContain('400');
  });

  it('se la rete cade, l\'operazione di mercato non deve fallire', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await notifyAdmin('prova');
    expect(r).toEqual({ sent: false, reason: 'offline' });
  });
});

describe('i messaggi per l\'admin', () => {
  it('la chiamata dice squadra, giocatore e dove trovare il testo', () => {
    const m = tgNewCall('Montester United', 'KOLASINAC', 3);
    expect(m).toContain('Montester United');
    expect(m).toContain('KOLASINAC');
    expect(m).toContain('https://aste.example.it/admin/messaggi');
  });

  it('la richiesta di svincolo mostra i due esiti a confronto', () => {
    const m = tgFreeReleaseRequest('Real Sballo', 'PERIN', 40, 30, 'la chiamata su MAIGNAN');
    expect(m).toContain('Accetti: 40 cr');
    expect(m).toContain('Declini: 30 cr');
    expect(m).toContain('MAIGNAN');
  });

  it('la richiesta senza operazione collegata non inventa il congelamento', () => {
    expect(tgFreeReleaseRequest('Real Sballo', 'PERIN', 40, 30)).not.toContain('Congela');
  });

  it('il cambio di fase dice quanti lotti ci sono', () => {
    expect(tgPhaseChange(3, 'calls_closed', 2)).toContain('2 lotti');
    expect(tgPhaseChange(3, 'joins_closed', 1)).toContain('1 lotto');
  });

  it('il lotto assegnato porta con sé la riga operativa', () => {
    const m = tgLotSettled('Nella rosa Montester United: svincolare SCALVINI (+24 cr)');
    expect(m).toContain('svincolare SCALVINI');
    expect(m).toContain('Coda operativa');
  });

  it('la chiusura della serata riassume quanti lotti sono andati', () => {
    expect(tgSessionClosed(3, 3)).toContain('3 lotti assegnati');
  });

  it('senza indirizzo del sito non mette link rotti', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const m = tgNewCall('Montester United', 'KOLASINAC', 3);
    expect(m).not.toContain('](');
    expect(m).toContain('centro messaggi');
  });
});
