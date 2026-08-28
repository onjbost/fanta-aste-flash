import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeMarkdown, telegramConfigured, notifyAdmin,
  tgNewCall, tgFreeReleaseRequest, tgPhaseChange, tgLotSettled, tgSessionClosed,
  splitMessage, archiveMessage,
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

describe('archivio dei messaggi del centro messaggi', () => {
  it('spezza i testi lunghi sulle righe, non a metà parola', () => {
    const riga = 'KOLASINAC · D · Atalanta chiamato da Montester United';
    const lungo = Array(200).fill(riga).join('\n');
    const parti = splitMessage(lungo, 1000);

    expect(parti.length).toBeGreaterThan(1);
    parti.forEach((p) => expect(p.length).toBeLessThanOrEqual(1000));
    // nessuna riga è stata tagliata a metà
    parti.join('\n').split('\n').filter(Boolean).forEach((r) => expect(r).toBe(riga));
  });

  it('lascia intatto un testo che ci sta', () => {
    expect(splitMessage('corto')).toEqual(['corto']);
  });

  it('regge una riga singola più lunga del limite', () => {
    const parti = splitMessage('x'.repeat(2500), 1000);
    expect(parti).toHaveLength(3);
  });

  it('manda il testo del centro messaggi senza formattazione, così arriva identico', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const corpo = '⚡ ASTA FLASH #3\n\n📢 Montester United ha chiamato KOLASINAC (D, Atalanta).';
    const r = await archiveMessage('call', 3, corpo);

    expect(r.sent).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // niente parse_mode: i punti e le parentesi arriverebbero rotti
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).toContain('CENTRO MESSAGGI · Asta flash #3');
    expect(body.text).toContain('Nuova chiamata');
    expect(body.text).toContain(corpo);
  });

  it('numera le parti quando il messaggio è spezzato', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await archiveMessage('results', 3, 'riga\n'.repeat(2000));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    const primo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(primo.text).toMatch(/parte 1 di \d+/);
  });

  it('senza bot configurato non prova nemmeno a mandare', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const r = await archiveMessage('call', 1, 'testo');
    expect(r).toEqual({ sent: false, reason: 'Telegram non configurato' });
  });
});
