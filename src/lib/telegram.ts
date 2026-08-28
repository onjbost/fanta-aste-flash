import 'server-only';

/**
 * Notifiche Telegram — solo per l'admin.
 *
 * Gli allenatori non installano niente: per loro esistono l'app e il gruppo
 * WhatsApp. Il bot serve a te che amministri, per non dover aprire l'app per
 * sapere se c'è qualcosa da fare.
 *
 * In sola uscita: il bot scrive, non legge e non accetta comandi. Se non è
 * configurato, o se Telegram non risponde, l'app va avanti lo stesso — una
 * notifica persa non deve mai far fallire un'operazione di mercato.
 */

const API = 'https://api.telegram.org';

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID);
}

/** Telegram usa un MarkdownV2 permaloso: meglio disinnescare i caratteri speciali. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export interface NotifyResult { sent: boolean; reason?: string }

/**
 * Manda un messaggio all'admin. Non lancia mai: restituisce l'esito e basta,
 * così chi la chiama può ignorarlo senza try/catch.
 */
export async function notifyAdmin(text: string): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: 'Telegram non configurato' };

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
      // se Telegram è lento non blocchiamo un'asta: dopo 5 secondi lasciamo perdere
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, reason: `Telegram ha risposto ${res.status}: ${body.slice(0, 120)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

// -------------------------------------------------------------- modelli

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? '';

function link(label: string, path: string): string {
  const base = siteUrl();
  return base ? `[${escapeMarkdown(label)}](${base}${path})` : `*${escapeMarkdown(label)}*`;
}

/** Qualcuno ha chiamato un giocatore: c'è un messaggio pronto da girare al gruppo. */
export function tgNewCall(teamName: string, playerName: string, sessionNumber: number): string {
  return [
    `⚡ *Asta flash \\#${sessionNumber}* · nuova chiamata`,
    '',
    `${escapeMarkdown(teamName)} ha chiamato *${escapeMarkdown(playerName)}*\\.`,
    '',
    `Il testo per il gruppo è pronto: ${link('centro messaggi', '/admin/messaggi')}`,
  ].join('\n');
}

/** Una richiesta di svincolo gratuito congela un'operazione: serve una decisione. */
export function tgFreeReleaseRequest(
  teamName: string, playerName: string, approved: number, rejected: number, blocking?: string,
): string {
  return [
    '🩺 *Svincolo gratuito da decidere*',
    '',
    `${escapeMarkdown(teamName)} chiede il 100% per *${escapeMarkdown(playerName)}*\\.`,
    `Accetti: ${approved} cr, cambio non consumato\\.`,
    `Declini: ${rejected} cr, cambio consumato\\.`,
    blocking ? `\nCongela ${escapeMarkdown(blocking)}\\.` : '',
    '',
    link('Decidi ora', '/admin'),
  ].filter(Boolean).join('\n');
}

/** Cambio di fase: è il momento di mandare un riepilogo al gruppo. */
export function tgPhaseChange(sessionNumber: number, phase: string, lots: number): string {
  const label: Record<string, string> = {
    calls_closed: 'chiamate chiuse',
    joins_closed: 'adesioni chiuse',
    calls_open: 'chiamate aperte',
  };
  return [
    `📅 *Asta flash \\#${sessionNumber}* · ${escapeMarkdown(label[phase] ?? phase)}`,
    '',
    `${lots} ${lots === 1 ? 'lotto' : 'lotti'} in programma\\.`,
    'Il riepilogo per il gruppo ti aspetta in bozza\\.',
    '',
    link('Apri il centro messaggi', '/admin/messaggi'),
  ].join('\n');
}

/** Lotto assegnato: la riga da replicare su Leghe Fantacalcio. */
export function tgLotSettled(body: string): string {
  return [
    '✅ *Lotto assegnato*',
    '',
    escapeMarkdown(body),
    '',
    link('Coda operativa', '/admin'),
  ].join('\n');
}

/** Serata finita. */
export function tgSessionClosed(sessionNumber: number, assigned: number): string {
  return [
    `🏁 *Asta flash \\#${sessionNumber} chiusa*`,
    '',
    `${assigned} ${assigned === 1 ? 'lotto assegnato' : 'lotti assegnati'}\\.`,
    'Genera il messaggio dei risultati quando vuoi\\.',
    '',
    link('Centro messaggi', '/admin/messaggi'),
  ].join('\n');
}
