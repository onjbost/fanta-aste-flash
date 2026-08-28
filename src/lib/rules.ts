/**
 * Motore delle regole — Fanta Mansarda, mercato aste flash.
 *
 * Funzioni pure: nessuna query, nessun effetto collaterale. Qui vive
 * l'interpretazione del regolamento, ed è l'unico posto dove va toccata
 * se la lega cambia idea. Tutto è coperto da test in rules.test.ts.
 */

export type Role = 'P' | 'D' | 'C' | 'A';
export const ROLES: Role[] = ['P', 'D', 'C', 'A'];
export const ROLE_LABEL: Record<Role, string> = {
  P: 'Portiere',
  D: 'Difensore',
  C: 'Centrocampista',
  A: 'Attaccante',
};

/** Stato del giocatore in Serie A. */
export type PlayerStatus = 'active' | 'injured_long' | 'banned' | 'out_of_serie_a';

/** Tipo di svincolo: ordinario (75%, consuma un cambio) o gratuito (100%). */
export type ReleaseType = 'flash_75' | 'free_100' | 'trade' | 'repair';

export type Rounding = 'floor' | 'ceil' | 'half_up';

export interface LeagueConfig {
  refundPct: number;              // 0.75
  refundRounding: Rounding;       // 'floor' — decisione della lega
  changes: Record<Role, number>;  // andata: P1 D3 C3 A2
  returnBonus: number;            // +1 per ruolo dal girone di ritorno
  returnStartsOn: string;         // '2027-02-01'
  roster: Record<Role, number>;   // 3 / 8 / 8 / 6
  basePrice: number;              // 1
  minIncrement: number;           // 1
  callDeadlineDays: number;       // 5
  joinDeadlineDays: number;       // 1
}

export const DEFAULT_CONFIG: LeagueConfig = {
  refundPct: 0.75,
  refundRounding: 'floor',
  changes: { P: 1, D: 3, C: 3, A: 2 },
  returnBonus: 1,
  returnStartsOn: '2027-02-01',
  roster: { P: 3, D: 8, C: 8, A: 6 },
  basePrice: 1,
  minIncrement: 1,
  callDeadlineDays: 5,
  joinDeadlineDays: 1,
};

export interface RosterPlayer {
  playerId: string;
  name: string;
  role: Role;
  club: string;
  status: PlayerStatus;
  price: number;                  // prezzo pagato all'acquisto
  freeReleaseApproved?: boolean;  // richiesta di svincolo gratuito approvata dall'admin
  freeReleasePending?: boolean;   // richiesta inviata, in attesa di decisione
  freeReleaseRejected?: boolean;  // richiesta respinta: vale il 75% e consuma il cambio
  /** segnato "fuori lista" nel listone ufficiale: la società non l'ha iscritto */
  outOfList?: boolean;
}

// ------------------------------------------------- richiesta svincolo gratuito

/** Stato di una partecipazione (chiamata o adesione) a un lotto. */
export type ParticipationStatus = 'confirmed' | 'pending_approval' | 'cancelled';

export interface FreeReleaseEligibility {
  canRequest: boolean;
  /** true se lo stato del giocatore rende la richiesta quasi scontata */
  suggested: boolean;
  reason: string;
}

/**
 * Se ha senso chiedere all'admin lo svincolo gratuito.
 *
 * Nell'app c'è solo il pulsante: prove e spiegazioni passano dal gruppo
 * WhatsApp, dove la lega discute già di suo. L'app registra la richiesta,
 * congela l'operazione e aspetta la decisione.
 */
export function freeReleaseEligibility(p: RosterPlayer): FreeReleaseEligibility {
  if (p.freeReleaseApproved) {
    return { canRequest: false, suggested: false, reason: 'Approvato: rimborso al 100%.' };
  }
  if (p.freeReleasePending) {
    return { canRequest: false, suggested: false, reason: 'In attesa della decisione dell\'admin.' };
  }
  if (p.status === 'out_of_serie_a') {
    return { canRequest: true, suggested: true, reason: 'Ha lasciato la Serie A: rimborso pieno quasi certo.' };
  }
  if (p.status === 'banned') {
    return { canRequest: true, suggested: true, reason: 'Squalificato dalla Lega Serie A.' };
  }
  if (p.status === 'injured_long') {
    return { canRequest: true, suggested: true, reason: 'Infortunio lungo segnalato.' };
  }
  if (p.outOfList) {
    return {
      canRequest: true, suggested: true,
      reason: 'Fuori lista nel listone ufficiale: valuta la richiesta.',
    };
  }
  if (p.freeReleaseRejected) {
    return { canRequest: true, suggested: false, reason: 'Già respinta una volta: serve un elemento nuovo.' };
  }
  return { canRequest: true, suggested: false, reason: 'Spiega il motivo nel gruppo: decide l\'admin.' };
}

export interface FreeReleaseScenarios {
  approved: { refund: number; consumesChange: boolean };
  rejected: { refund: number; consumesChange: boolean };
  /** differenza in crediti tra i due esiti */
  delta: number;
}

/**
 * I due esiti possibili, affiancati. Servono all'allenatore prima di chiedere
 * e all'admin per decidere in tre secondi.
 */
export function freeReleaseScenarios(
  p: RosterPlayer,
  cfg: LeagueConfig = DEFAULT_CONFIG,
): FreeReleaseScenarios {
  const ordinario = refundValue({ ...p, freeReleaseApproved: false, status: 'active' }, cfg).value;
  return {
    approved: { refund: p.price, consumesChange: false },
    rejected: { refund: ordinario, consumesChange: true },
    delta: p.price - ordinario,
  };
}

export interface ReleaseRecord {
  role: Role;
  type: ReleaseType;
  at: string;                 // ISO
}

// ---------------------------------------------------------------- rimborsi

function applyRounding(value: number, mode: Rounding): number {
  if (mode === 'ceil') return Math.ceil(value);
  if (mode === 'half_up') return Math.floor(value + 0.5);
  return Math.floor(value);
}

export interface RefundResult {
  value: number;
  type: Extract<ReleaseType, 'flash_75' | 'free_100'>;
  /** true se lo svincolo NON consuma un cambio di ruolo */
  free: boolean;
  reason: string;
}

/**
 * Quanto rende svincolare un giocatore.
 *
 * 100% e nessun cambio consumato quando il giocatore ha lasciato la Serie A,
 * è squalificato dalla lega o ha un infortunio lungo con richiesta approvata
 * (art. 8.3, 11.2). In tutti gli altri casi 75%, arrotondato per difetto,
 * e un cambio in meno nel suo ruolo (art. 8.4, 10.2).
 */
export function refundValue(p: RosterPlayer, cfg: LeagueConfig = DEFAULT_CONFIG): RefundResult {
  if (p.status === 'out_of_serie_a') {
    return { value: p.price, type: 'free_100', free: true, reason: 'Ha lasciato la Serie A' };
  }
  if (p.status === 'banned') {
    return { value: p.price, type: 'free_100', free: true, reason: 'Squalificato dalla Lega Serie A' };
  }
  if (p.status === 'injured_long' && p.freeReleaseApproved) {
    return { value: p.price, type: 'free_100', free: true, reason: 'Infortunio oltre 60 giorni approvato' };
  }
  // Richiesta respinta o ancora pendente: vale lo svincolo ordinario.
  // Finché l'admin non decide, budget e contatori si calcolano al 75%:
  // meglio una sorpresa in meglio che una in meno il giorno dell'asta.
  //
  // Con l'arrotondamento per difetto un giocatore da 1 credito renderebbe
  // zero: uno svincolo che non restituisce niente non ha senso, quindi il
  // minimo è 1. Vale solo per chi è costato qualcosa — un giocatore entrato
  // a costo zero non può generare crediti dal nulla.
  const arrotondato = applyRounding(p.price * cfg.refundPct, cfg.refundRounding);
  return {
    value: p.price > 0 ? Math.max(1, arrotondato) : 0,
    type: 'flash_75',
    free: false,
    reason: 'Svincolo ordinario',
  };
}

// ------------------------------------------------------------------ cambi

/** Cambi spettanti in un ruolo a una certa data (andata + bonus del ritorno). */
export function changesAllowance(role: Role, at: Date, cfg: LeagueConfig = DEFAULT_CONFIG): number {
  const base = cfg.changes[role];
  const returnStart = new Date(cfg.returnStartsOn + 'T00:00:00Z');
  return at >= returnStart ? base + cfg.returnBonus : base;
}

/** Cambi già consumati in un ruolo: contano solo gli svincoli ordinari. */
export function changesUsed(releases: ReleaseRecord[], role: Role): number {
  return releases.filter((r) => r.role === role && r.type === 'flash_75').length;
}

export function changesLeft(
  releases: ReleaseRecord[],
  role: Role,
  at: Date,
  cfg: LeagueConfig = DEFAULT_CONFIG,
): number {
  return Math.max(0, changesAllowance(role, at, cfg) - changesUsed(releases, role));
}

export interface ChangesSummary {
  role: Role;
  allowance: number;
  used: number;
  left: number;
  bonusPending: number; // cambi che si aggiungeranno dal girone di ritorno
}

export function changesSummary(
  releases: ReleaseRecord[],
  at: Date,
  cfg: LeagueConfig = DEFAULT_CONFIG,
): ChangesSummary[] {
  const returnStart = new Date(cfg.returnStartsOn + 'T00:00:00Z');
  const bonusApplied = at >= returnStart;
  return ROLES.map((role) => ({
    role,
    allowance: changesAllowance(role, at, cfg),
    used: changesUsed(releases, role),
    left: changesLeft(releases, role, at, cfg),
    bonusPending: bonusApplied ? 0 : cfg.returnBonus,
  }));
}

// ----------------------------------------------------------------- budget

/**
 * Quanto posso offrire su un lotto: crediti residui più il rimborso del
 * giocatore che ho dichiarato di svincolare. Il rimborso non è ancora
 * incassato, ma è vincolato a questa operazione, quindi fa parte del budget.
 */
export function auctionBudget(
  credits: number,
  release: RosterPlayer,
  cfg: LeagueConfig = DEFAULT_CONFIG,
): number {
  return credits + refundValue(release, cfg).value;
}

/** Un lotto già chiuso nella stessa sessione, dal punto di vista di una squadra. */
export interface SettledLot {
  lotId: string;
  won: boolean;
  /** prezzo pagato, solo se vinto */
  price?: number;
  /** rimborso incassato per lo svincolando dichiarato, solo se vinto */
  refund?: number;
}

/**
 * Crediti residui aggiornati dopo i lotti già chiusi della serata.
 *
 * Chi vince incassa il rimborso e paga il prezzo: 50 residui + 10 di rimborso
 * meno 30 di aggiudicazione fanno 30 crediti con cui affrontare il lotto
 * successivo. Chi perde non muove nulla: il suo giocatore resta in rosa al
 * prezzo d'acquisto originario e nessun rimborso viene accreditato.
 */
export function creditsAfter(baseCredits: number, settled: SettledLot[]): number {
  return settled.reduce((c, s) => {
    if (!s.won) return c;
    return c + (s.refund ?? 0) - (s.price ?? 0);
  }, baseCredits);
}

/**
 * Il budget vero su un lotto al momento in cui si apre: crediti residui
 * aggiornati più il rimborso dello svincolando dichiarato per QUESTO lotto.
 * È questo il valore che fa da tetto ai rilanci, non lo snapshot salvato
 * all'adesione — nel frattempo la serata può aver cambiato le carte.
 */
export function liveBudget(
  baseCredits: number,
  settled: SettledLot[],
  release: RosterPlayer,
  cfg: LeagueConfig = DEFAULT_CONFIG,
): number {
  return creditsAfter(baseCredits, settled) + refundValue(release, cfg).value;
}

// ------------------------------------------------------------ calendario

export type SessionStatus =
  | 'scheduled' | 'calls_open' | 'calls_closed' | 'joins_closed' | 'live' | 'closed';

export interface SessionInfo {
  id: string;
  number: number;
  auctionAt: string;              // ISO
  status: SessionStatus;
  excludesNewSignings: boolean;
}

export function callsCloseAt(s: SessionInfo, cfg: LeagueConfig = DEFAULT_CONFIG): Date {
  const d = new Date(s.auctionAt);
  d.setUTCDate(d.getUTCDate() - cfg.callDeadlineDays);
  return d;
}

export function joinsCloseAt(s: SessionInfo, cfg: LeagueConfig = DEFAULT_CONFIG): Date {
  const d = new Date(s.auctionAt);
  d.setUTCDate(d.getUTCDate() - cfg.joinDeadlineDays);
  return d;
}

/** Lo stato che la sessione dovrebbe avere adesso, in base al calendario. */
export function expectedStatus(
  s: SessionInfo,
  now: Date,
  cfg: LeagueConfig = DEFAULT_CONFIG,
): SessionStatus {
  const auction = new Date(s.auctionAt);
  if (now >= auction) return 'live';
  if (now >= joinsCloseAt(s, cfg)) return 'joins_closed';
  if (now >= callsCloseAt(s, cfg)) return 'calls_closed';
  return 'calls_open';
}

// ------------------------------------------------------------ validazioni

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  budget?: number;
  refund?: RefundResult;
  /**
   * true quando l'operazione è valida ma resta congelata in attesa che l'admin
   * decida sulla richiesta di svincolo gratuito. Nasce come pending_approval,
   * non entra in sala finché non è confermata.
   */
  pendingApproval?: boolean;
}

export interface CallContext {
  now: Date;
  session: SessionInfo;
  cfg?: LeagueConfig;
  /** giocatore svincolato che voglio chiamare */
  target: { playerId: string; role: Role; status: PlayerStatus; signingWindow: 'summer' | 'winter'; isFreeAgent: boolean; lockedUntilSession?: number | null };
  /** giocatore della mia rosa che metto sul piatto */
  release: RosterPlayer | null;
  credits: number;
  releases: ReleaseRecord[];
  /** svincolandi già impegnati da me in questa sessione (altri lotti) */
  committedReleaseIds: string[];
  /** numero di lotti a cui partecipo già, per ruolo, in questa sessione */
  participationsByRole: Record<Role, number>;
  /** lotti già esistenti in sessione, per non chiamare due volte lo stesso */
  calledPlayerIds: string[];
}

/**
 * Valida una chiamata all'asta flash. Restituisce tutti gli errori insieme:
 * chi chiama deve capire subito cosa non va, non scoprirlo un pezzo alla volta.
 */
export function validateCall(ctx: CallContext): ValidationResult {
  const cfg = ctx.cfg ?? DEFAULT_CONFIG;
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- finestra temporale
  if (ctx.session.status !== 'calls_open') {
    errors.push('Le chiamate per questa asta sono chiuse.');
  } else if (ctx.now > callsCloseAt(ctx.session, cfg)) {
    errors.push('È passato il termine dei 5 giorni di preavviso.');
  }

  // --- il giocatore chiamato
  if (!ctx.target.isFreeAgent) {
    errors.push('Il giocatore che hai chiamato è nella rosa di qualcuno.');
  }
  if (ctx.target.lockedUntilSession != null && ctx.target.lockedUntilSession > ctx.session.number) {
    errors.push('Questo giocatore è stato svincolato nell\'ultima asta: sarà chiamabile dalla prossima.');
  }
  if (ctx.session.excludesNewSignings && ctx.target.signingWindow === 'winter') {
    errors.push('Nelle aste di gennaio non si possono chiamare i giocatori arrivati nel mercato invernale (art. 11.2).');
  }
  if (ctx.calledPlayerIds.includes(ctx.target.playerId)) {
    warnings.push('Questo giocatore è già stato chiamato: la tua richiesta diventa un\'adesione al lotto esistente.');
  }

  // --- il giocatore da svincolare
  if (!ctx.release) {
    errors.push('Devi indicare il giocatore da svincolare.');
    return { ok: false, errors, warnings };
  }
  if (ctx.release.role !== ctx.target.role) {
    errors.push(
      `Ruolo diverso: puoi svincolare un ${ROLE_LABEL[ctx.target.role].toLowerCase()} per prendere un ${ROLE_LABEL[ctx.target.role].toLowerCase()}.`,
    );
  }
  if (ctx.committedReleaseIds.includes(ctx.release.playerId)) {
    errors.push('Hai già messo questo giocatore sul piatto in un altro lotto di questa asta.');
  }

  const refund = refundValue(ctx.release, cfg);
  const budget = ctx.credits + refund.value;

  // --- cambi disponibili
  const role = ctx.target.role;
  const left = changesLeft(ctx.releases, role, ctx.now, cfg);
  if (!refund.free) {
    if (left <= 0) {
      errors.push(`Hai esaurito i cambi da ${ROLE_LABEL[role].toLowerCase()} per questa stagione.`);
    } else if (ctx.participationsByRole[role] >= left) {
      errors.push(
        `Ti restano ${left} cambi da ${ROLE_LABEL[role].toLowerCase()}: partecipi già a ${ctx.participationsByRole[role]} lotti in questo ruolo.`,
      );
    }
  }

  // --- budget
  if (budget < cfg.basePrice) {
    errors.push(`Con questo svincolo avresti ${budget} crediti: non basta per la base d'asta di ${cfg.basePrice}.`);
  }
  const pendingApproval = !!ctx.release.freeReleasePending;
  if (pendingApproval) {
    warnings.push(
      'Chiamata congelata: hai chiesto lo svincolo gratuito per questo giocatore. Resta in attesa finché l\'admin non decide — fino ad allora budget e cambi sono calcolati al 75%.',
    );
  }
  if (!refund.free && left === 1) {
    warnings.push(`Attenzione: è il tuo ultimo cambio da ${ROLE_LABEL[role].toLowerCase()}.`);
  }

  return { ok: errors.length === 0, errors, warnings, budget, refund, pendingApproval };
}

export interface JoinContext extends Omit<CallContext, 'target' | 'calledPlayerIds'> {
  lot: { playerId: string; role: Role; callerTeamId: string };
  myTeamId: string;
  alreadyJoined: boolean;
}

/** Valida l'adesione a un lotto già chiamato da qualcun altro. */
export function validateJoin(ctx: JoinContext): ValidationResult {
  const cfg = ctx.cfg ?? DEFAULT_CONFIG;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!['calls_open', 'calls_closed'].includes(ctx.session.status)) {
    errors.push('Le adesioni per questa asta sono chiuse.');
  } else if (ctx.now > joinsCloseAt(ctx.session, cfg)) {
    errors.push('È passato il termine per aderire (1 giorno prima dell\'asta).');
  }
  if (ctx.lot.callerTeamId === ctx.myTeamId) {
    errors.push('Hai chiamato tu questo giocatore: sei già dentro.');
  }
  if (ctx.alreadyJoined) {
    errors.push('Hai già aderito a questo lotto.');
  }

  if (!ctx.release) {
    errors.push('Devi indicare il giocatore da svincolare.');
    return { ok: false, errors, warnings };
  }
  if (ctx.release.role !== ctx.lot.role) {
    errors.push(`Ruolo diverso: serve un ${ROLE_LABEL[ctx.lot.role].toLowerCase()} da svincolare.`);
  }
  if (ctx.committedReleaseIds.includes(ctx.release.playerId)) {
    errors.push('Hai già messo questo giocatore sul piatto in un altro lotto di questa asta.');
  }

  const refund = refundValue(ctx.release, cfg);
  const budget = ctx.credits + refund.value;
  const role = ctx.lot.role;
  const left = changesLeft(ctx.releases, role, ctx.now, cfg);

  if (!refund.free) {
    if (left <= 0) {
      errors.push(`Hai esaurito i cambi da ${ROLE_LABEL[role].toLowerCase()}.`);
    } else if (ctx.participationsByRole[role] >= left) {
      errors.push(
        `Ti restano ${left} cambi da ${ROLE_LABEL[role].toLowerCase()}: partecipi già a ${ctx.participationsByRole[role]} lotti in questo ruolo.`,
      );
    }
  }
  if (budget < cfg.basePrice) {
    errors.push(`Il tuo budget sarebbe ${budget} crediti: non basta nemmeno per la base d'asta.`);
  }

  const pendingApproval = !!ctx.release.freeReleasePending;
  if (pendingApproval) {
    warnings.push(
      'Adesione congelata: hai chiesto lo svincolo gratuito per questo giocatore. Entra in sala solo dopo la decisione dell\'admin.',
    );
  }

  return { ok: errors.length === 0, errors, warnings, budget, refund, pendingApproval };
}

// ------------------------------------------------------------- rilancio

export interface BidContext {
  amount: number;
  currentPrice: number | null;   // null = nessuna offerta ancora
  budget: number;
  cfg?: LeagueConfig;
  lotStatus: 'called' | 'uncontested' | 'live' | 'assigned' | 'cancelled';
  isHighestBidder: boolean;
}

export function validateBid(ctx: BidContext): ValidationResult {
  const cfg = ctx.cfg ?? DEFAULT_CONFIG;
  const errors: string[] = [];
  const min = ctx.currentPrice === null ? cfg.basePrice : ctx.currentPrice + cfg.minIncrement;

  if (ctx.lotStatus !== 'live') errors.push('Il lotto non è aperto.');
  if (ctx.isHighestBidder) errors.push('Sei già tu il migliore offerente.');
  if (ctx.amount < min) errors.push(`L'offerta minima adesso è ${min} crediti.`);
  if (ctx.amount > ctx.budget) errors.push(`Il tuo budget su questo lotto è ${ctx.budget} crediti.`);

  return { ok: errors.length === 0, errors, warnings: [] };
}

/**
 * Risoluzione delle offerte massime automatiche.
 *
 * Regola stile eBay, indipendente dall'ordine in cui arrivano i rilanci:
 * vince il tetto più alto e paga quanto basta per battere il secondo, mai
 * più del proprio tetto né del proprio budget. Un solo rilancio anziché una
 * scaletta di offerte da un credito, così il registro dell'asta resta
 * leggibile e il risultato non dipende da chi ha premuto prima.
 */
export function resolveProxyBid(
  currentPrice: number | null,
  currentLeader: string | null,
  proxies: { teamId: string; max: number; budget: number }[],
  cfg: LeagueConfig = DEFAULT_CONFIG,
): { teamId: string; amount: number } | null {
  const minBid = currentPrice === null ? cfg.basePrice : currentPrice + cfg.minIncrement;

  const candidates = proxies
    .filter((p) => p.teamId !== currentLeader)
    .map((p) => ({ teamId: p.teamId, ceiling: Math.min(p.max, p.budget) }))
    .filter((p) => p.ceiling >= minBid)
    .sort((a, b) => b.ceiling - a.ceiling || a.teamId.localeCompare(b.teamId));

  if (candidates.length === 0) return null;

  const winner = candidates[0];
  const runnerUp = candidates[1]?.ceiling ?? (currentPrice ?? 0);
  const amount = Math.min(winner.ceiling, Math.max(minBid, runnerUp + cfg.minIncrement));
  return { teamId: winner.teamId, amount };
}
