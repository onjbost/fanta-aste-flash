/**
 * Centro messaggi: i cinque testi che l'admin incolla nel gruppo WhatsApp.
 *
 * Funzioni pure — entrano i dati della sessione, esce il testo formattato.
 * Nessun modello è scritto a mano due volte: se cambia una scadenza o un
 * prezzo, cambia il messaggio.
 */

import { ROLE_LABEL, type Role } from './rules';

export type MessageKind = 'call' | 'calls_closed' | 'joins_closed' | 'room_open' | 'results';

export const MESSAGE_LABEL: Record<MessageKind, string> = {
  call: 'Nuova chiamata',
  calls_closed: 'Chiusura chiamate · T−5',
  joins_closed: 'Chiusura adesioni · T−1',
  room_open: 'Apertura sala',
  results: 'Esiti e movimenti',
};

export interface MsgSession {
  number: number;
  auctionAt: string;
  callsCloseAt: string;
  joinsCloseAt: string;
  excludesNewSignings: boolean;
}

export interface MsgPlayer { name: string; role: Role; club: string }

export interface MsgParticipant {
  teamName: string;
  isCaller: boolean;
  /** svelati solo dal messaggio di apertura sala in poi */
  releaseName?: string;
  releasePrice?: number;
  refund?: number;
  budget?: number;
}

export interface MsgLot {
  index: number;
  player: MsgPlayer;
  callerTeam: string;
  participants: MsgParticipant[];
  /** esito, solo nel messaggio finale */
  winnerTeam?: string;
  finalPrice?: number;
  runnerUpPrice?: number;
  uncontested?: boolean;
  releasedName?: string;
  refund?: number;
  creditsBefore?: number;
  creditsAfter?: number;
  changesLeftLabel?: string;
}

// ------------------------------------------------------------------ date

const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Formattazione in fuso Europe/Rome, indipendente dal fuso del server. */
function parts(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return {
    weekday: get('weekday'), day: get('day'), month: get('month'),
    hour: get('hour'), minute: get('minute'),
    monthName: MONTHS[Number(get('month')) - 1] ?? '',
  };
}

export function longDate(iso: string): string {
  const p = parts(iso);
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

export function shortDeadline(iso: string): string {
  const p = parts(iso);
  return `${p.weekday} ${p.day}/${p.month.padStart(2, '0')}, ore ${p.hour}:${p.minute}`;
}

export function dateTime(iso: string): string {
  const p = parts(iso);
  return `${p.weekday} ${p.day} ${p.monthName}, ore ${p.hour}:${p.minute}`;
}

const NUM = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const numero = (n: number) => (n <= 9 ? NUM[n] : `${n}.`);

const head = (s: MsgSession) => `⚡ ASTA FLASH #${s.number} · ${dateTime(s.auctionAt)}`;

const playerLine = (p: MsgPlayer) => `${p.name} · ${p.role} · ${p.club}`;

// -------------------------------------------------------------- modelli

/** 1 · appena qualcuno chiama. Automatico: prima esce, più tempo hanno gli altri. */
export function msgNewCall(s: MsgSession, callerTeam: string, player: MsgPlayer): string {
  return [
    head(s),
    '',
    `📢 ${callerTeam} ha chiamato lo svincolato`,
    `   ${playerLine(player)}`,
    '',
    'Chi vuole partecipare all\'asta può aderire dall\'app',
    'indicando il proprio giocatore da svincolare.',
    '',
    `🔒 Chiamate aperte fino a ${shortDeadline(s.callsCloseAt)}`,
    `🔒 Adesioni aperte fino a ${shortDeadline(s.joinsCloseAt)}`,
  ].join('\n');
}

/** 2 · T−5, chiamate chiuse. Con conferma dell'admin. */
export function msgCallsClosed(s: MsgSession, lots: MsgLot[]): string {
  if (lots.length === 0) {
    return [
      head(s),
      '',
      '🔒 CHIAMATE CHIUSE · nessun giocatore chiamato',
      '',
      'Questa asta flash non si terrà. Ci si vede alla prossima.',
    ].join('\n');
  }
  const body = lots.map((l) => {
    const others = l.participants.filter((p) => !p.isCaller).map((p) => p.teamName);
    return [
      `${numero(l.index)} ${playerLine(l.player)}`,
      `    Chiamato da: ${l.callerTeam}`,
      `    Partecipanti: ${others.length ? others.join(', ') : 'nessuno'}`,
    ].join('\n');
  }).join('\n\n');

  return [
    head(s),
    `🔒 CHIAMATE CHIUSE · ${lots.length} ${lots.length === 1 ? 'giocatore' : 'giocatori'} all'asta`,
    s.excludesNewSignings ? '❄️ Finestra di gennaio: nuovi acquisti esclusi' : '',
    '',
    body,
    '',
    `⏰ Adesioni aperte fino a ${shortDeadline(s.joinsCloseAt)}.`,
    'Chi non aderisce entro quell\'ora resta fuori.',
  ].filter((x) => x !== '').join('\n');
}

/** 3 · T−1, adesioni chiuse. Svincolandi e budget restano segreti. */
export function msgJoinsClosed(s: MsgSession, lots: MsgLot[]): string {
  const body = lots.map((l) => {
    const names = l.participants.map((p) => p.teamName);
    if (names.length <= 1) {
      return [
        `🔨 LOTTO ${l.index} · ${l.player.name} (${l.player.role}, ${l.player.club})`,
        `   Nessun contendente → va a ${l.callerTeam}`,
        '   all\'apertura della sala',
      ].join('\n');
    }
    return [
      `🔨 LOTTO ${l.index} · ${l.player.name} (${l.player.role}, ${l.player.club})`,
      `   Partecipanti (${names.length}): ${names.join(', ')}`,
    ].join('\n');
  }).join('\n\n');

  return [
    `⚡ ASTA FLASH #${s.number} · DOMANI, ore ${parts(s.auctionAt).hour}:${parts(s.auctionAt).minute}`,
    '✅ ADESIONI CHIUSE · ecco i lotti',
    '',
    body,
    '',
    'Svincolandi e budget restano segreti fino a domani.',
    'Base d\'asta 1 credito, rilancio minimo 1, timer 10".',
  ].join('\n');
}

/** 4 · giorno dell'asta: svelamento simultaneo di svincolandi e budget. */
export function msgRoomOpen(s: MsgSession, lots: MsgLot[], roomUrl?: string): string {
  const body = lots.map((l) => {
    const rows = l.participants.map((p) =>
      [
        `   • ${p.teamName} — svincola ${p.releaseName ?? '?'}`,
        p.releasePrice != null && p.refund != null ? ` (${p.releasePrice} cr → +${p.refund})` : '',
        `\n     budget d'asta: ${p.budget ?? '?'} crediti`,
      ].join(''));
    return [
      `🔨 LOTTO ${l.index} · ${l.player.name} (${l.player.role}, ${l.player.club})`,
      ...rows,
    ].join('\n');
  }).join('\n\n');

  return [
    `⚡ ASTA FLASH #${s.number} · SI COMINCIA`,
    '🎬 Svincolandi e budget svelati',
    '',
    body,
    '',
    roomUrl ? `Tutti in sala: ${roomUrl}` : 'Tutti in sala.',
  ].join('\n');
}

/** 5 · a fine serata: chi ha preso chi, a quanto, e come restano i conti. */
export function msgResults(s: MsgSession, lots: MsgLot[], nextSessionAt?: string): string {
  const body = lots.map((l) => {
    const lines = [`🏆 ${l.player.name} → ${l.winnerTeam} per ${l.finalPrice} crediti`];
    if (l.uncontested) {
      lines.push(`   (nessun contendente, 75% di ${l.releasedName})`);
    } else if (l.runnerUpPrice != null) {
      const second = l.participants.find((p) => p.teamName !== l.winnerTeam);
      lines.push(`   (${second?.teamName ?? 'il secondo'} si ferma a ${l.runnerUpPrice})`);
    }
    lines.push(`   Svincolato: ${l.releasedName} · +${l.refund} cr`);
    lines.push(`   Crediti: ${l.creditsBefore} → ${l.creditsAfter}${l.changesLeftLabel ? ` · ${l.changesLeftLabel}` : ''}`);
    return lines.join('\n');
  }).join('\n\n');

  return [
    `⚡ ASTA FLASH #${s.number} · RISULTATI`,
    '',
    lots.length ? body : 'Nessun lotto assegnato.',
    '',
    nextSessionAt
      ? `📅 Prossima asta flash: ${longDate(nextSessionAt)}\n   Chiamate aperte da adesso.`
      : '📅 Era l\'ultima asta flash della stagione.',
  ].join('\n');
}
