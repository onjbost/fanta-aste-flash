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

export interface NotifyResult { sent: boolean; reason?: string; parts?: number }

/** Telegram taglia i messaggi oltre i 4096 caratteri: meglio spezzarli noi. */
const LIMITE = 3900;

/**
 * Divide un testo lungo in pezzi, tagliando sulle righe vuote e poi sulle
 * righe singole. Un riepilogo d'asta spezzato a metà di una parola sarebbe
 * inutilizzabile proprio quando serve copiarlo.
 */
export function splitMessage(text: string, limite = LIMITE): string[] {
  if (text.length <= limite) return [text];

  const parti: string[] = [];
  let corrente = '';
  for (const blocco of text.split('\n')) {
    if (corrente.length + blocco.length + 1 > limite) {
      if (corrente) parti.push(corrente.trimEnd());
      // una singola riga più lunga del limite: si taglia dove capita
      if (blocco.length > limite) {
        for (let i = 0; i < blocco.length; i += limite) parti.push(blocco.slice(i, i + limite));
        corrente = '';
        continue;
      }
      corrente = blocco + '\n';
    } else {
      corrente += blocco + '\n';
    }
  }
  if (corrente.trim()) parti.push(corrente.trimEnd());
  return parti;
}

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

/**
 * Manda un testo così com'è, senza formattazione.
 *
 * Serve per i messaggi del centro messaggi: sono già scritti per WhatsApp e
 * devono arrivare identici, pronti da copiare. Passarli dal formattatore di
 * Telegram li rovinerebbe — e con MarkdownV2 fallirebbe l'invio al primo
 * punto o parentesi non protetta.
 */
export async function notifyAdminPlain(text: string): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: 'Telegram non configurato' };

  const parti = splitMessage(text);
  for (const [i, parte] of parti.entries()) {
    try {
      const res = await fetch(`${API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: parti.length > 1 ? `${parte}\n\n— parte ${i + 1} di ${parti.length}` : parte,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { sent: false, reason: `Telegram ha risposto ${res.status}: ${body.slice(0, 120)}` };
      }
    } catch (e) {
      return { sent: false, reason: (e as Error).message };
    }
  }
  return { sent: true, parts: parti.length };
}

const KIND_LABEL: Record<string, string> = {
  call: 'Nuova chiamata',
  calls_closed: 'Chiusura chiamate · T−5',
  joins_closed: 'Chiusura adesioni · T−1',
  room_open: 'Apertura sala',
  results: 'Esiti e movimenti',
  trade: 'Fantacalciomercato · scambio',
};

/**
 * Archivia su Telegram un messaggio del centro messaggi, con una riga di
 * intestazione che dice quale è e a che asta appartiene. Il testo sotto è
 * quello esatto da incollare nel gruppo: si copia direttamente da Telegram.
 *
 * `sessionNumber` può mancare: uno scambio di mercato non appartiene a
 * nessuna asta, e scrivergli sopra «Asta flash #0» sarebbe una bugia.
 */
export async function archiveMessage(
  kind: string, sessionNumber: number | null | undefined, body: string,
): Promise<NotifyResult> {
  const dove = sessionNumber ? ` · Asta flash #${sessionNumber}` : '';
  const intestazione = `📋 CENTRO MESSAGGI${dove}`
    + `\n${KIND_LABEL[kind] ?? kind} · generato ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`
    + `\n${'─'.repeat(28)}\n\n`;
  return notifyAdminPlain(intestazione + body);
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

/**
 * Qualcuno ha aperto l'app per la prima volta: c'è un account da collegare
 * a una squadra. È il momento in cui l'admin deve fare qualcosa, quindi vale
 * una notifica invece di lasciarla scoprire per caso.
 */
export function tgFirstLogin(email: string, alreadyLinked: boolean): string {
  return [
    '🔑 *Primo accesso*',
    '',
    `${escapeMarkdown(email)} è entrato nell'app per la prima volta\\.`,
    alreadyLinked
      ? 'È già collegato a una squadra: non devi fare niente\\.'
      : '*Non è ancora collegato a nessuna squadra\\.*',
    '',
    link(alreadyLinked ? 'Pannello allenatori' : 'Collegalo a una squadra', '/admin/allenatori'),
  ].join('\n');
}

/** Una chiamata o un'adesione annullata: cambia i lotti della serata. */
export function tgParticipationCancelled(
  teamName: string, playerName: string, isCaller: boolean, byAdmin: boolean, reason?: string,
): string {
  return [
    `🚫 *${isCaller ? 'Chiamata' : 'Adesione'} annullata*`,
    '',
    `${escapeMarkdown(teamName)} su *${escapeMarkdown(playerName)}*`,
    byAdmin ? 'Annullata dall\'admin\\.' : 'Ritirata dalla squadra\\.',
    reason ? `Motivo: ${escapeMarkdown(reason)}` : '',
    '',
    link('Vedi i lotti', '/asta'),
  ].filter(Boolean).join('\n');
}
