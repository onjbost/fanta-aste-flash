/**
 * Centro messaggi: i cinque testi che l'admin incolla nel gruppo WhatsApp.
 *
 * Funzioni pure — entrano i dati della sessione, esce il testo formattato.
 * Nessun modello è scritto a mano due volte: se cambia una scadenza o un
 * prezzo, cambia il messaggio.
 */

import { ROLE_LABEL, type Role } from './rules';

export type MessageKind =
  'call' | 'calls_closed' | 'joins_closed' | 'room_open' | 'results' | 'trade';

export const MESSAGE_LABEL: Record<MessageKind, string> = {
  call: 'Nuova chiamata',
  calls_closed: 'Chiusura chiamate · T−5',
  joins_closed: 'Chiusura adesioni · T−1',
  room_open: 'Apertura sala',
  results: 'Esiti e movimenti',
  trade: 'Fantacalciomercato · scambio',
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

/**
 * Intestazione della rubrica: la stessa del riepilogo di giornata della
 * Redazione (`montaMessaggio`), perché nel gruppo i due testi si leggono di
 * seguito e devono sembrare due puntate della stessa cosa, non due app.
 */
const RIGA = '─'.repeat(28);

const testata = (titolo: string) => [`🏆 FANTA MANSARDA · ${titolo}`, RIGA, ''].join('\n');

/** Sezione con titolo in maiuscolo e corpo rientrato di tre spazi. */
const sezione = (titolo: string, righe: string[]) =>
  [titolo, ...righe.map((r) => `   ${r}`)].join('\n');

const plurale = (n: number, uno: string, molti: string) =>
  `${n} ${n === 1 ? uno : molti}`;

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

/**
 * 5 · a fine serata: chi ha preso chi, a quanto, e come restano i conti.
 *
 * Montato come il riepilogo di giornata: testata della lega, una riga di
 * apertura che dice com'è andata in generale, un blocco per lotto con il titolo
 * sulla prima riga e i dettagli rientrati sotto, e in coda le sezioni con il
 * bilancio e il prossimo appuntamento.
 */
export function msgResults(s: MsgSession, lots: MsgLot[], nextSessionAt?: string): string {
  const spesi = lots.reduce((n, l) => n + (l.finalPrice ?? 0), 0);
  const rimborsi = lots.reduce((n, l) => n + (l.refund ?? 0), 0);
  const piuCaro = lots.reduce<MsgLot | null>(
    (best, l) => ((l.finalPrice ?? 0) > (best?.finalPrice ?? -1) ? l : best), null);

  const blocchi = lots.map((l) => {
    const righe = [
      `⚡ ${l.player.name} → ${l.winnerTeam} per ${l.finalPrice} crediti`,
      `   ${l.player.role} · ${l.player.club}`,
    ];
    if (l.uncontested) {
      righe.push(`   (nessun contendente, 75% di ${l.releasedName})`);
    } else if (l.runnerUpPrice != null) {
      const second = l.participants.find((p) => p.teamName !== l.winnerTeam);
      righe.push(`   (${second?.teamName ?? 'il secondo'} si ferma a ${l.runnerUpPrice})`);
    }
    righe.push(`   Svincolato: ${l.releasedName} · +${l.refund} cr`);
    righe.push(`   Crediti: ${l.creditsBefore} → ${l.creditsAfter}${l.changesLeftLabel ? ` · ${l.changesLeftLabel}` : ''}`);
    return righe.join('\n');
  }).join('\n\n');

  if (lots.length === 0) {
    return [
      testata(`ASTA FLASH #${s.number}`),
      'Serata chiusa senza assegnazioni: nessun lotto è andato a buon fine.',
      '',
      sezione('📅 PROSSIMO APPUNTAMENTO', nextSessionAt
        ? [`Prossima asta flash: ${longDate(nextSessionAt)}`, 'Chiamate aperte da adesso.']
        : ['Era l\'ultima asta flash della stagione.']),
    ].join('\n');
  }

  return [
    testata(`ASTA FLASH #${s.number}`),
    `Serata chiusa: ${plurale(lots.length, 'lotto assegnato', 'lotti assegnati')}.`,
    '',
    blocchi,
    '',
    sezione('📊 IL BILANCIO DELLA SERATA', [
      `Crediti spesi: ${spesi} · rimborsi incassati: ${rimborsi}`,
      piuCaro ? `Il colpo più caro: ${piuCaro.player.name} a ${piuCaro.finalPrice} crediti (${piuCaro.winnerTeam})` : '',
    ].filter(Boolean)),
    '',
    sezione('📅 PROSSIMO APPUNTAMENTO', nextSessionAt
      ? [`Prossima asta flash: ${longDate(nextSessionAt)}`, 'Chiamate aperte da adesso.']
      : ['Era l\'ultima asta flash della stagione.']),
  ].join('\n');
}

// ------------------------------------------------------- fantacalciomercato

export interface MsgTrade {
  /** chi ha proposto lo scambio */
  fromTeam: string;
  /** il giocatore che la richiedente mette sul piatto */
  fromPlayer: string;
  /** chi ha accettato */
  toTeam: string;
  /** il giocatore che l'accettante mette sul piatto */
  toPlayer: string;
  /** crediti di conguaglio; assente o 0 significa scambio alla pari */
  settlement?: number;
  /** chi versa il conguaglio: la richiedente o l'accettante */
  settlementPayer?: 'from' | 'to';
}

/**
 * 6 · rubrica fantacalciomercato: uno scambio chiuso fra due squadre.
 *
 * L'app non gestisce gli scambi — restano come li fa la lega, e il registro
 * ufficiale è sempre Leghe Fantacalcio. Qui si scrive solo l'annuncio, con lo
 * stesso taglio del riepilogo di giornata, così la rubrica sembra una rubrica.
 */
export function msgTrade(t: MsgTrade): string {
  const conguaglio = t.settlement && t.settlement > 0 ? t.settlement : 0;
  const paga = t.settlementPayer === 'to' ? t.toTeam : t.fromTeam;
  const incassa = t.settlementPayer === 'to' ? t.fromTeam : t.toTeam;

  const righe = [
    testata('FANTACALCIOMERCATO'),
    conguaglio
      ? `Scambio chiuso fra ${t.fromTeam} e ${t.toTeam}, con conguaglio.`
      : `Scambio chiuso fra ${t.fromTeam} e ${t.toTeam}, alla pari.`,
    '',
    `🔁 ${t.fromTeam}  ⇄  ${t.toTeam}`,
    `   ${t.fromTeam} cede ${t.fromPlayer}`,
    `   ${t.toTeam} cede ${t.toPlayer}`,
  ];

  if (conguaglio) {
    righe.push('', sezione('💰 CONGUAGLIO', [
      `${plurale(conguaglio, 'credito', 'crediti')} da ${paga} a ${incassa}`,
    ]));
  }

  righe.push('', sezione('📋 COME RESTANO LE ROSE', [
    `${t.fromTeam}: fuori ${t.fromPlayer}, dentro ${t.toPlayer}`,
    `${t.toTeam}: fuori ${t.toPlayer}, dentro ${t.fromPlayer}`,
  ]));

  return righe.join('\n');
}
