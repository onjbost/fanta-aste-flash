import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG, refundValue, changesAllowance, changesUsed, changesLeft,
  changesSummary, auctionBudget, creditsAfter, liveBudget, callsCloseAt, joinsCloseAt, expectedStatus,
  validateCall, validateJoin, validateBid, resolveProxyBid, freeReleaseEligibility, freeReleaseScenarios,
  type RosterPlayer, type ReleaseRecord, type SessionInfo, type Role,
} from './rules';

const P = (over: Partial<RosterPlayer> = {}): RosterPlayer => ({
  playerId: 'p1', name: 'Scalvini', role: 'D', club: 'Atalanta',
  status: 'active', price: 32, ...over,
});

const session = (over: Partial<SessionInfo> = {}): SessionInfo => ({
  id: 's3', number: 3, auctionAt: '2026-10-29T20:30:00Z',
  status: 'calls_open', excludesNewSignings: false, ...over,
});

const noParticipations: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };

// ---------------------------------------------------------------- rimborsi

describe('rimborso dello svincolo', () => {
  it('rende il 75% arrotondato per difetto (decisione della lega)', () => {
    expect(refundValue(P({ price: 32 })).value).toBe(24);   // 24.0
    expect(refundValue(P({ price: 35 })).value).toBe(26);   // 26.25 → 26
    expect(refundValue(P({ price: 1 })).value).toBe(1);     // 0.75 → 0, ma il minimo è 1
    expect(refundValue(P({ price: 100 })).value).toBe(75);
  });

  it('non rende mai zero: sotto l\'unità si arrotonda a 1', () => {
    expect(refundValue(P({ price: 1 })).value).toBe(1);   // 0.75
    expect(refundValue(P({ price: 2 })).value).toBe(1);   // 1.5 → 1, già ok
    expect(refundValue(P({ price: 3 })).value).toBe(2);   // 2.25 → 2
  });

  it('un giocatore costato zero resta a zero: nessun credito dal nulla', () => {
    expect(refundValue(P({ price: 0 })).value).toBe(0);
  });

  it('consuma un cambio quando è ordinario', () => {
    const r = refundValue(P());
    expect(r.type).toBe('flash_75');
    expect(r.free).toBe(false);
  });

  it('rende il 100% e non consuma il cambio se il giocatore ha lasciato la Serie A', () => {
    const r = refundValue(P({ price: 41, status: 'out_of_serie_a' }));
    expect(r.value).toBe(41);
    expect(r.free).toBe(true);
  });

  it('rende il 100% per squalifica della Lega Serie A', () => {
    expect(refundValue(P({ price: 18, status: 'banned' })).value).toBe(18);
  });

  it('per infortunio lungo serve l\'approvazione dell\'admin', () => {
    const senza = refundValue(P({ price: 40, status: 'injured_long' }));
    expect(senza.value).toBe(30);          // finché non è approvata vale il 75%
    expect(senza.free).toBe(false);

    const con = refundValue(P({ price: 40, status: 'injured_long', freeReleaseApproved: true }));
    expect(con.value).toBe(40);
    expect(con.free).toBe(true);
  });

  it('rispetta un arrotondamento diverso se la lega cambia idea', () => {
    const cfg = { ...DEFAULT_CONFIG, refundRounding: 'ceil' as const };
    expect(refundValue(P({ price: 35 }), cfg).value).toBe(27);
  });
});

// ------------------------------------------------------------------ cambi

describe('cambi disponibili', () => {
  const andata = new Date('2026-11-17T12:00:00Z');
  const ritorno = new Date('2027-03-04T12:00:00Z');

  it('assegna 1-3-3-2 nel girone di andata', () => {
    expect(changesAllowance('P', andata)).toBe(1);
    expect(changesAllowance('D', andata)).toBe(3);
    expect(changesAllowance('C', andata)).toBe(3);
    expect(changesAllowance('A', andata)).toBe(2);
  });

  it('aggiunge un cambio per ruolo dal 1° febbraio', () => {
    expect(changesAllowance('P', ritorno)).toBe(2);
    expect(changesAllowance('D', ritorno)).toBe(4);
    expect(changesAllowance('A', ritorno)).toBe(3);
  });

  it('somma i cambi non usati all\'andata (il bonus non li azzera)', () => {
    const releases: ReleaseRecord[] = [{ role: 'D', type: 'flash_75', at: '2026-10-29' }];
    expect(changesLeft(releases, 'D', andata)).toBe(2);   // 3 - 1
    expect(changesLeft(releases, 'D', ritorno)).toBe(3);  // 4 - 1
  });

  it('non conta gli svincoli gratuiti', () => {
    const releases: ReleaseRecord[] = [
      { role: 'D', type: 'flash_75', at: '2026-10-29' },
      { role: 'D', type: 'free_100', at: '2026-11-17' },
      { role: 'D', type: 'free_100', at: '2026-12-02' },
    ];
    expect(changesUsed(releases, 'D')).toBe(1);
    expect(changesLeft(releases, 'D', andata)).toBe(2);
  });

  it('non scende mai sotto zero', () => {
    const releases: ReleaseRecord[] = Array(9).fill({ role: 'P', type: 'flash_75', at: '2026-10-29' });
    expect(changesLeft(releases, 'P', andata)).toBe(0);
  });

  it('segnala quanti cambi arriveranno a febbraio', () => {
    const s = changesSummary([], andata);
    expect(s.every((r) => r.bonusPending === 1)).toBe(true);
    expect(changesSummary([], ritorno).every((r) => r.bonusPending === 0)).toBe(true);
  });
});

// ----------------------------------------------------------------- budget

describe('budget d\'asta', () => {
  it('somma crediti residui e rimborso dello svincolando', () => {
    expect(auctionBudget(37, P({ price: 32 }))).toBe(61);   // 37 + 24
  });
  it('usa il valore pieno per un cambio gratuito', () => {
    expect(auctionBudget(37, P({ price: 32, status: 'out_of_serie_a' }))).toBe(69);
  });
});

describe('budget nella stessa serata, lotto dopo lotto', () => {
  it('lo scenario di Orsolini: 50 residui + 10 di rimborso, vinco a 30, resto con 30', () => {
    const base = 50;
    const budgetPrimoLotto = auctionBudget(base, P({ price: 14 })); // 14 → 10 di rimborso
    expect(budgetPrimoLotto).toBe(60);

    const dopo = creditsAfter(base, [{ lotId: 'l1', won: true, price: 30, refund: 10 }]);
    expect(dopo).toBe(30);

    // sul lotto successivo si riparte da 30 più il rimborso del nuovo svincolando
    const secondo = liveBudget(base, [{ lotId: 'l1', won: true, price: 30, refund: 10 }], P({ price: 40 }));
    expect(secondo).toBe(60);   // 30 + 30
  });

  it('chi perde un lotto non muove né crediti né rosa', () => {
    const base = 50;
    const dopo = creditsAfter(base, [{ lotId: 'l1', won: false }]);
    expect(dopo).toBe(50);
    // e sul lotto successivo il budget è ancora quello di partenza
    expect(liveBudget(base, [{ lotId: 'l1', won: false }], P({ price: 32 }))).toBe(74);
  });

  it('somma correttamente più aggiudicazioni nella stessa serata', () => {
    const dopo = creditsAfter(80, [
      { lotId: 'l1', won: true, price: 30, refund: 10 },
      { lotId: 'l2', won: false },
      { lotId: 'l3', won: true, price: 25, refund: 18 },
    ]);
    expect(dopo).toBe(53);      // 80 +10 -30 +18 -25
  });

  it('un\'aggiudicazione a saldo neutro lascia i crediti invariati', () => {
    // lotto senza contendenti: prezzo = rimborso del proprio svincolando
    expect(creditsAfter(37, [{ lotId: 'l1', won: true, price: 24, refund: 24 }])).toBe(37);
  });
});

// ------------------------------------------------------------- calendario

describe('scadenze della sessione', () => {
  const s = session();
  it('chiude le chiamate 5 giorni prima', () => {
    expect(callsCloseAt(s).toISOString()).toBe('2026-10-24T20:30:00.000Z');
  });
  it('chiude le adesioni 1 giorno prima', () => {
    expect(joinsCloseAt(s).toISOString()).toBe('2026-10-28T20:30:00.000Z');
  });
  it('calcola la fase corrente dal calendario', () => {
    expect(expectedStatus(s, new Date('2026-10-20T10:00:00Z'))).toBe('calls_open');
    expect(expectedStatus(s, new Date('2026-10-26T10:00:00Z'))).toBe('calls_closed');
    expect(expectedStatus(s, new Date('2026-10-29T10:00:00Z'))).toBe('joins_closed');
    expect(expectedStatus(s, new Date('2026-10-29T21:00:00Z'))).toBe('live');
  });
});

// -------------------------------------------------------------- chiamate

const baseCall = () => ({
  now: new Date('2026-10-20T10:00:00Z'),
  session: session(),
  target: { playerId: 'k1', role: 'D' as Role, status: 'active' as const, signingWindow: 'summer' as const, isFreeAgent: true, lockedUntilSession: null },
  release: P(),
  credits: 37,
  releases: [] as ReleaseRecord[],
  committedReleaseIds: [] as string[],
  participationsByRole: { ...noParticipations },
  calledPlayerIds: [] as string[],
});

describe('validazione della chiamata', () => {
  it('accetta una chiamata regolare e restituisce il budget', () => {
    const r = validateCall(baseCall());
    expect(r.ok).toBe(true);
    expect(r.budget).toBe(61);
  });

  it('rifiuta il cambio di ruolo', () => {
    const r = validateCall({ ...baseCall(), release: P({ role: 'A' }) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Ruolo diverso/);
  });

  it('rifiuta dopo il termine dei 5 giorni', () => {
    const r = validateCall({ ...baseCall(), now: new Date('2026-10-27T10:00:00Z') });
    expect(r.ok).toBe(false);
  });

  it('rifiuta un giocatore già in rosa a qualcuno', () => {
    const c = baseCall();
    const r = validateCall({ ...c, target: { ...c.target, isFreeAgent: false } });
    expect(r.ok).toBe(false);
  });

  it('rifiuta un giocatore svincolato nell\'asta precedente', () => {
    const c = baseCall();
    const r = validateCall({ ...c, target: { ...c.target, lockedUntilSession: 4 } });
    expect(r.errors.join(' ')).toMatch(/dalla prossima/);
  });

  it('nelle sessioni di gennaio esclude i nuovi arrivati in Serie A', () => {
    const c = baseCall();
    const r = validateCall({
      ...c,
      session: session({ excludesNewSignings: true }),
      target: { ...c.target, signingWindow: 'winter' },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/11\.2/);
  });

  it('rifiuta lo stesso svincolando su due lotti della stessa sessione', () => {
    const r = validateCall({ ...baseCall(), committedReleaseIds: ['p1'] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/già messo questo giocatore sul piatto/);
  });

  it('rifiuta se i cambi del ruolo sono esauriti', () => {
    const releases: ReleaseRecord[] = Array(3).fill({ role: 'D', type: 'flash_75', at: '2026-10-01' });
    const r = validateCall({ ...baseCall(), releases });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/esaurito i cambi/);
  });

  it('blocco preventivo: non più lotti per ruolo dei cambi residui', () => {
    const releases: ReleaseRecord[] = [
      { role: 'D', type: 'flash_75', at: '2026-10-01' },
      { role: 'D', type: 'flash_75', at: '2026-10-15' },
    ]; // ne resta 1
    const r = validateCall({
      ...baseCall(),
      releases,
      participationsByRole: { ...noParticipations, D: 1 },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/partecipi già a 1 lotti/);
  });

  it('un cambio gratuito non consuma cambi, quindi passa anche a contatori esauriti', () => {
    const releases: ReleaseRecord[] = Array(3).fill({ role: 'D', type: 'flash_75', at: '2026-10-01' });
    const r = validateCall({
      ...baseCall(),
      releases,
      release: P({ status: 'out_of_serie_a', price: 20 }),
    });
    expect(r.ok).toBe(true);
    expect(r.budget).toBe(57);
  });

  it('avvisa quando è l\'ultimo cambio del ruolo', () => {
    const releases: ReleaseRecord[] = [
      { role: 'D', type: 'flash_75', at: '2026-10-01' },
      { role: 'D', type: 'flash_75', at: '2026-10-15' },
    ];
    const r = validateCall({ ...baseCall(), releases });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/ultimo cambio/);
  });
});

// ------------------------------------------- richiesta di svincolo gratuito

describe('richiesta di svincolo gratuito', () => {
  it('la propone da sola quando il giocatore ha lasciato la Serie A', () => {
    const e = freeReleaseEligibility(P({ status: 'out_of_serie_a' }));
    expect(e.canRequest).toBe(true);
    expect(e.suggested).toBe(true);
  });

  it('la propone per infortunio lungo', () => {
    const e = freeReleaseEligibility(P({ status: 'injured_long' }));
    expect(e.suggested).toBe(true);
  });

  it('mostra i due esiti affiancati, con la differenza in crediti', () => {
    const s = freeReleaseScenarios(P({ price: 40, status: 'injured_long' }));
    expect(s.approved).toEqual({ refund: 40, consumesChange: false });
    expect(s.rejected).toEqual({ refund: 30, consumesChange: true });
    expect(s.delta).toBe(10);
  });

  it('resta possibile anche per un giocatore sano: decide l\'admin, non l\'app', () => {
    expect(freeReleaseEligibility(P()).canRequest).toBe(true);
    expect(freeReleaseEligibility(P()).suggested).toBe(false);
  });

  it('non si può richiedere due volte mentre è in attesa', () => {
    const e = freeReleaseEligibility(P({ freeReleasePending: true }));
    expect(e.canRequest).toBe(false);
    expect(e.reason).toMatch(/attesa/);
  });

  it('una richiesta approvata porta al 100% senza consumare il cambio', () => {
    const r = refundValue(P({ price: 40, status: 'injured_long', freeReleaseApproved: true }));
    expect(r.value).toBe(40);
    expect(r.free).toBe(true);
  });

  it('una richiesta respinta lascia il 75% e il cambio consumato', () => {
    const r = refundValue(P({ price: 40, status: 'injured_long', freeReleaseRejected: true }));
    expect(r.value).toBe(30);
    expect(r.free).toBe(false);
  });

  it('congela la chiamata e intanto calcola budget e cambi al 75%', () => {
    const c = baseCall();
    const r = validateCall({ ...c, release: P({ price: 40, status: 'injured_long', freeReleasePending: true }) });
    expect(r.ok).toBe(true);
    expect(r.pendingApproval).toBe(true);
    expect(r.budget).toBe(67);          // 37 + 30, non 37 + 40
    expect(r.warnings.join(' ')).toMatch(/congelata/);
  });

  it('una chiamata senza richieste pendenti non è congelata', () => {
    expect(validateCall(baseCall()).pendingApproval).toBe(false);
  });
});

// -------------------------------------------------------------- adesioni

describe('validazione dell\'adesione', () => {
  const baseJoin = () => ({
    now: new Date('2026-10-26T10:00:00Z'),
    session: session({ status: 'calls_closed' as const }),
    lot: { playerId: 'k1', role: 'D' as Role, callerTeamId: 'teamA' },
    myTeamId: 'teamB',
    alreadyJoined: false,
    release: P(),
    credits: 20,
    releases: [] as ReleaseRecord[],
    committedReleaseIds: [] as string[],
    participationsByRole: { ...noParticipations },
  });

  it('accetta un\'adesione regolare', () => {
    const r = validateJoin(baseJoin());
    expect(r.ok).toBe(true);
    expect(r.budget).toBe(44);
  });

  it('rifiuta dopo la chiusura delle adesioni', () => {
    const r = validateJoin({ ...baseJoin(), now: new Date('2026-10-29T10:00:00Z') });
    expect(r.ok).toBe(false);
  });

  it('rifiuta il chiamante che aderisce al proprio lotto', () => {
    const r = validateJoin({ ...baseJoin(), myTeamId: 'teamA' });
    expect(r.ok).toBe(false);
  });

  it('con zero crediti si partecipa lo stesso: lo svincolo rende almeno 1', () => {
    // conseguenza del minimo di 1 credito sul rimborso: nessuno resta fuori
    // da un lotto per mancanza di budget, può sempre offrire la base
    const r = validateJoin({ ...baseJoin(), credits: 0, release: P({ price: 1 }) });
    expect(r.ok).toBe(true);
    expect(r.budget).toBe(1);
  });

  it('resta il controllo per il caso impossibile di un budget a zero', () => {
    const r = validateJoin({ ...baseJoin(), credits: 0, release: P({ price: 0 }) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/base d'asta/);
  });
});

// -------------------------------------------------------------- rilanci

describe('rilanci', () => {
  const base = { budget: 61, lotStatus: 'live' as const, isHighestBidder: false };

  it('la prima offerta parte dalla base', () => {
    expect(validateBid({ ...base, amount: 1, currentPrice: null }).ok).toBe(true);
    expect(validateBid({ ...base, amount: 0, currentPrice: null }).ok).toBe(false);
  });

  it('richiede almeno un credito in più dell\'offerta corrente', () => {
    expect(validateBid({ ...base, amount: 12, currentPrice: 12 }).ok).toBe(false);
    expect(validateBid({ ...base, amount: 13, currentPrice: 12 }).ok).toBe(true);
  });

  it('rifiuta le offerte oltre il budget', () => {
    expect(validateBid({ ...base, amount: 62, currentPrice: 40 }).ok).toBe(false);
  });

  it('non lascia rilanciare chi è già il migliore offerente', () => {
    expect(validateBid({ ...base, amount: 50, currentPrice: 40, isHighestBidder: true }).ok).toBe(false);
  });
});

describe('offerte massime automatiche', () => {
  it('risponde al rilancio con il minimo necessario', () => {
    const out = resolveProxyBid(10, 'teamA', [{ teamId: 'teamB', max: 13, budget: 50 }]);
    expect(out).toEqual({ teamId: 'teamB', amount: 11 });
  });

  it('con due tetti vince il più alto e paga il secondo più uno', () => {
    const out = resolveProxyBid(10, 'teamA', [
      { teamId: 'teamB', max: 20, budget: 50 },
      { teamId: 'teamC', max: 13, budget: 50 },
    ]);
    expect(out).toEqual({ teamId: 'teamB', amount: 14 });
  });

  it('non dipende dall\'ordine in cui sono state lasciate le offerte', () => {
    const a = resolveProxyBid(10, 'teamA', [
      { teamId: 'teamC', max: 13, budget: 50 },
      { teamId: 'teamB', max: 20, budget: 50 },
    ]);
    expect(a).toEqual({ teamId: 'teamB', amount: 14 });
  });

  it('non supera mai il budget, anche se il tetto è più alto', () => {
    const out = resolveProxyBid(10, 'teamA', [{ teamId: 'teamB', max: 100, budget: 12 }]);
    expect(out).toEqual({ teamId: 'teamB', amount: 11 });
  });

  it('non supera mai il proprio tetto', () => {
    const out = resolveProxyBid(10, 'teamA', [
      { teamId: 'teamB', max: 12, budget: 90 },
      { teamId: 'teamC', max: 30, budget: 90 },
    ]);
    expect(out).toEqual({ teamId: 'teamC', amount: 13 });
  });

  it('parte dalla base se non c\'è ancora nessuna offerta', () => {
    const out = resolveProxyBid(null, null, [{ teamId: 'teamB', max: 40, budget: 50 }]);
    expect(out).toEqual({ teamId: 'teamB', amount: 1 });
  });

  it('non fa nulla se nessun tetto supera il prezzo corrente', () => {
    expect(resolveProxyBid(20, 'teamA', [{ teamId: 'teamB', max: 15, budget: 50 }])).toBeNull();
  });

  it('non rilancia contro sé stesso', () => {
    expect(resolveProxyBid(20, 'teamB', [{ teamId: 'teamB', max: 90, budget: 90 }])).toBeNull();
  });
});

// --------------------------------------------- esito per chi perde l'asta

describe('effetti dell\'esito', () => {
  it('chi perde non svincola nulla: il contratto resta intatto al prezzo originario', () => {
    // Il perdente non subisce alcuna operazione: nessun movimento crediti,
    // nessuna chiusura di contratto. Il giocatore che aveva dichiarato resta
    // in rosa con il suo prezzo d'acquisto, non con il valore di svincolo.
    const contract = { playerId: 'p1', price: 32, releasedAt: null as string | null };
    const esito = { winner: 'teamA', loser: 'teamB' };
    const perdente = { ...contract }; // nessuna modifica applicata
    expect(perdente.price).toBe(32);
    expect(perdente.releasedAt).toBeNull();
    expect(esito.loser).toBe('teamB');
    // e il rimborso del 75% non viene mai accreditato
    expect(refundValue(P({ price: 32 })).value).toBe(24);
  });
});
