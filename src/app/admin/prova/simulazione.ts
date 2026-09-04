import {
  DEFAULT_CONFIG, refundValue, validateBid, resolveProxyBid,
  type LeagueConfig, type Role, type RosterPlayer,
} from '@/lib/rules';

/**
 * La serata d'asta finta: stesse regole, nessuna conseguenza.
 *
 * Serve per far vedere come funziona la sala senza aprirne una vera — niente
 * crediti, niente contratti, niente messaggi su Telegram. Le regole però non
 * sono riscritte qui: il minimo rilancio, il tetto del budget e il divieto di
 * rilanciare su sé stessi arrivano da `validateBid`, e gli avversari
 * automatici da `resolveProxyBid`, gli stessi che usa la sala vera. Se una
 * regola cambia, cambia anche qui — che è il motivo per cui questa prova vale
 * qualcosa invece di essere solo un'animazione.
 *
 * L'unica cosa che resta una copia è il tempo: il timer qui è un numero in
 * memoria, non `now()` di Postgres. Va bene — quello che si vuole vedere è il
 * comportamento della serata, non la tenuta del server sotto due click
 * simultanei.
 *
 * Tutte le funzioni sono pure e restituiscono uno stato nuovo: lo stato non
 * si modifica mai sul posto, così React vede sempre un oggetto diverso e la
 * pagina si ridisegna senza trucchi.
 */

export type StatoLotto = 'called' | 'live' | 'assigned' | 'cancelled';

export interface GiocatoreProva {
  nome: string;
  ruolo: Role;
  club: string;
  /** prezzo pagato a suo tempo: è la base del rimborso al 75% */
  prezzo: number;
}

export interface PartecipanteProva {
  squadraId: string;
  /** chi mette sul piatto per liberare il posto e fare budget */
  svincola: GiocatoreProva;
  chiamante: boolean;
  /** fin dove si spinge un avversario automatico; null = decidi tu */
  tetto: number | null;
}

export interface LottoProva {
  id: string;
  indice: number;
  giocatore: GiocatoreProva;
  stato: StatoLotto;
  prezzo: number | null;
  leader: string | null;
  /** millisecondi epoch, non una stringa: qui il tempo è aritmetica */
  scadenza: number | null;
  vincitore: string | null;
  prezzoFinale: number | null;
  partecipanti: PartecipanteProva[];
}

export interface SquadraProva {
  id: string;
  nome: string;
  crediti: number;
}

export interface StatoProva {
  cfg: LeagueConfig;
  timerSecondi: number;
  salaAperta: boolean;
  squadre: SquadraProva[];
  lotti: LottoProva[];
  /** cosa è successo, in ordine: è il racconto della serata */
  diario: string[];
}

/** L'identificativo della squadra guidata da chi sta provando. */
export const IO = 'tu';

const rp = (g: GiocatoreProva): RosterPlayer => ({
  playerId: g.nome, name: g.nome, role: g.ruolo, club: g.club,
  status: 'active', price: g.prezzo,
});

/** Il rimborso di uno svincolando, con le regole della lega. */
export function rimborso(g: GiocatoreProva, cfg: LeagueConfig): number {
  return refundValue(rp(g), cfg).value;
}

export function squadra(s: StatoProva, id: string): SquadraProva {
  return s.squadre.find((x) => x.id === id) ?? { id, nome: '?', crediti: 0 };
}

/** Budget di una squadra su un lotto: crediti di adesso + rimborso di chi esce. */
export function budget(s: StatoProva, lotto: LottoProva, squadraId: string): number {
  const p = lotto.partecipanti.find((x) => x.squadraId === squadraId);
  if (!p) return 0;
  return squadra(s, squadraId).crediti + rimborso(p.svincola, s.cfg);
}

// ------------------------------------------------------------- la serata

const g = (nome: string, ruolo: Role, club: string, prezzo: number): GiocatoreProva =>
  ({ nome, ruolo, club, prezzo });

/**
 * Squadre e giocatori dichiaratamente finti.
 *
 * Nomi inventati apposta: se in questa sala comparisse un nome vero, prima o
 * poi qualcuno racconterebbe in giro un acquisto che non è mai successo.
 */
export function statoIniziale(cfg: LeagueConfig = DEFAULT_CONFIG, timerSecondi = 10): StatoProva {
  const squadre: SquadraProva[] = [
    { id: IO, nome: 'La tua squadra', crediti: 34 },
    { id: 'bot1', nome: 'Sparring Club', crediti: 51 },
    { id: 'bot2', nome: 'Prova Calcio', crediti: 19 },
    { id: 'bot3', nome: 'Manichini FC', crediti: 27 },
  ];

  const lotti: LottoProva[] = [
    {
      id: 'l1', indice: 1,
      giocatore: g('Corsini', 'C', 'Fantacittà', 0),
      stato: 'called', prezzo: null, leader: null, scadenza: null,
      vincitore: null, prezzoFinale: null,
      partecipanti: [
        { squadraId: IO, svincola: g('Bardelli', 'C', 'Realvalle', 28), chiamante: true, tetto: null },
        { squadraId: 'bot1', svincola: g('Ferrero', 'C', 'Pratoalto', 40), chiamante: false, tetto: 63 },
        { squadraId: 'bot2', svincola: g('Nardi', 'C', 'Fantacittà', 12), chiamante: false, tetto: 26 },
      ],
    },
    {
      id: 'l2', indice: 2,
      giocatore: g('Villa', 'A', 'Pratoalto', 0),
      stato: 'called', prezzo: null, leader: null, scadenza: null,
      vincitore: null, prezzoFinale: null,
      partecipanti: [
        { squadraId: 'bot1', svincola: g('Iaccarino', 'A', 'Realvalle', 36), chiamante: true, tetto: 70 },
        { squadraId: 'bot3', svincola: g('Ruggeri', 'A', 'Marecalmo', 44), chiamante: false, tetto: 58 },
      ],
    },
    {
      id: 'l3', indice: 3,
      giocatore: g('Zambelli', 'D', 'Marecalmo', 0),
      stato: 'called', prezzo: null, leader: null, scadenza: null,
      vincitore: null, prezzoFinale: null,
      partecipanti: [
        { squadraId: IO, svincola: g('Peretti', 'D', 'Pratoalto', 16), chiamante: true, tetto: null },
      ],
    },
  ];

  return { cfg, timerSecondi, salaAperta: false, squadre, lotti, diario: [] };
}

// ------------------------------------------------------------ operazioni

function conLotto(s: StatoProva, lotId: string, f: (l: LottoProva) => LottoProva): StatoProva {
  return { ...s, lotti: s.lotti.map((l) => (l.id === lotId ? f(l) : l)) };
}

function annota(s: StatoProva, riga: string): StatoProva {
  return { ...s, diario: [...s.diario, riga] };
}

/**
 * Registra l'aggiudicazione: chi vince svincola, incassa il rimborso e paga.
 * Chi perde non paga niente — sul suo svincolando non è successo nulla.
 */
function assegna(s: StatoProva, lotto: LottoProva, vincitore: string, prezzo: number): StatoProva {
  const p = lotto.partecipanti.find((x) => x.squadraId === vincitore)!;
  const reso = rimborso(p.svincola, s.cfg);
  const nome = squadra(s, vincitore).nome;

  const dopo: StatoProva = {
    ...s,
    squadre: s.squadre.map((sq) =>
      sq.id === vincitore ? { ...sq, crediti: sq.crediti + reso - prezzo } : sq),
    lotti: s.lotti.map((l) => (l.id === lotto.id ? {
      ...l, stato: 'assigned' as StatoLotto, vincitore, prezzoFinale: prezzo,
      prezzo, leader: vincitore, scadenza: null,
    } : l)),
  };

  return annota(
    dopo,
    `${nome} si prende ${lotto.giocatore.nome} per ${prezzo} cr: svincola `
    + `${p.svincola.nome} (+${reso}), crediti ${squadra(s, vincitore).crediti} → `
    + `${squadra(dopo, vincitore).crediti}.`,
  );
}

/**
 * Apre la sala. I lotti con un solo partecipante si chiudono qui, come nella
 * sala vera: senza contendenti il chiamante se lo prende al 75% del proprio
 * svincolando, e la serata comincia con quelli già fatti.
 */
export function apriSala(s: StatoProva): StatoProva {
  let dopo: StatoProva = { ...s, salaAperta: true };

  for (const l of s.lotti) {
    if (l.stato !== 'called') continue;
    if (l.partecipanti.length === 0) {
      dopo = conLotto(dopo, l.id, (x) => ({ ...x, stato: 'cancelled' }));
      continue;
    }
    if (l.partecipanti.length === 1) {
      const solo = l.partecipanti[0];
      dopo = assegna(dopo, l, solo.squadraId, rimborso(solo.svincola, s.cfg));
    }
  }

  return annota(dopo, 'Sala aperta.');
}

/** Manda un lotto all'asta: parte il timer. Uno alla volta, come nella realtà. */
export function apriLotto(s: StatoProva, lotId: string, ora: number): { stato: StatoProva; errore: string | null } {
  const l = s.lotti.find((x) => x.id === lotId);
  if (!l) return { stato: s, errore: 'Lotto inesistente.' };
  if (!s.salaAperta) return { stato: s, errore: 'La sala non è aperta.' };
  if (l.stato !== 'called') return { stato: s, errore: 'Questo lotto non è in attesa.' };
  if (s.lotti.some((x) => x.stato === 'live')) {
    return { stato: s, errore: 'C\'è già un lotto all\'asta: chiudi quello prima.' };
  }

  const dopo = conLotto(s, lotId, (x) => ({
    ...x, stato: 'live', scadenza: ora + s.timerSecondi * 1000,
  }));
  return { stato: annota(dopo, `Lotto ${l.indice} · ${l.giocatore.nome} all'asta.`), errore: null };
}

/**
 * Un rilancio. Le regole sono quelle vere: minimo, budget, e non si rilancia
 * su sé stessi. Ogni offerta buona riporta il timer a zero.
 */
export function rilancia(
  s: StatoProva, lotId: string, squadraId: string, importo: number, ora: number,
): { stato: StatoProva; errore: string | null } {
  const l = s.lotti.find((x) => x.id === lotId);
  if (!l) return { stato: s, errore: 'Lotto inesistente.' };
  if (!l.partecipanti.some((p) => p.squadraId === squadraId)) {
    return { stato: s, errore: 'Non partecipi a questo lotto.' };
  }
  if (l.stato === 'live' && l.scadenza != null && ora > l.scadenza) {
    return { stato: s, errore: 'Tempo scaduto.' };
  }

  const v = validateBid({
    amount: importo,
    currentPrice: l.prezzo,
    budget: budget(s, l, squadraId),
    cfg: s.cfg,
    lotStatus: l.stato,
    isHighestBidder: l.leader === squadraId,
  });
  if (!v.ok) return { stato: s, errore: v.errors.join(' ') };

  const dopo = conLotto(s, lotId, (x) => ({
    ...x, prezzo: importo, leader: squadraId, scadenza: ora + s.timerSecondi * 1000,
  }));
  return {
    stato: annota(dopo, `${squadra(s, squadraId).nome} offre ${importo} cr su ${l.giocatore.nome}.`),
    errore: null,
  };
}

/**
 * La mossa degli avversari automatici.
 *
 * Hanno un tetto dichiarato e si comportano come le offerte massime vere:
 * rilancia chi ha il tetto più alto, e paga quanto basta per battere il
 * secondo — non il proprio massimo. Restituisce null quando nessuno ha più
 * margine, che è il momento in cui il timer va davvero a zero.
 */
export function mossaAvversari(
  s: StatoProva, lotId: string, ora: number,
): { stato: StatoProva; mossa: { squadraId: string; importo: number } | null } {
  const l = s.lotti.find((x) => x.id === lotId);
  if (!l || l.stato !== 'live') return { stato: s, mossa: null };

  const proxies = l.partecipanti
    .filter((p) => p.tetto != null)
    .map((p) => ({ squadraId: p.squadraId, max: p.tetto!, budget: budget(s, l, p.squadraId) }));

  const scelta = resolveProxyBid(
    l.prezzo, l.leader,
    proxies.map((p) => ({ teamId: p.squadraId, max: p.max, budget: p.budget })),
    s.cfg,
  );
  if (!scelta) return { stato: s, mossa: null };

  const r = rilancia(s, lotId, scelta.teamId, scelta.amount, ora);
  if (r.errore) return { stato: s, mossa: null };
  return { stato: r.stato, mossa: { squadraId: scelta.teamId, importo: scelta.amount } };
}

/**
 * Chiude il lotto. Senza offerte va al chiamante alle condizioni che avrebbe
 * avuto senza contendenti: il 75% del suo svincolando, esattamente come in
 * `closeLot`.
 */
export function chiudiLotto(s: StatoProva, lotId: string): { stato: StatoProva; errore: string | null } {
  const l = s.lotti.find((x) => x.id === lotId);
  if (!l) return { stato: s, errore: 'Lotto inesistente.' };
  if (l.stato === 'assigned') return { stato: s, errore: null };
  if (l.stato !== 'live') return { stato: s, errore: 'Il lotto non è aperto.' };

  if (l.leader != null && l.prezzo != null) {
    return { stato: assegna(s, l, l.leader, l.prezzo), errore: null };
  }

  const chiamante = l.partecipanti.find((p) => p.chiamante);
  if (!chiamante) {
    return {
      stato: annota(conLotto(s, lotId, (x) => ({ ...x, stato: 'cancelled', scadenza: null })),
        `Lotto ${l.indice} annullato: nessuna offerta e nessun chiamante.`),
      errore: null,
    };
  }
  return {
    stato: assegna(s, l, chiamante.squadraId, rimborso(chiamante.svincola, s.cfg)),
    errore: null,
  };
}

/** Fine serata: quello che resta appeso si chiude, poi si tira la riga. */
export function chiudiSerata(s: StatoProva): StatoProva {
  let dopo = s;
  for (const l of s.lotti) {
    if (l.stato === 'live') dopo = chiudiLotto(dopo, l.id).stato;
    else if (l.stato === 'called') {
      const r = apriLotto(dopo, l.id, Date.now());
      dopo = r.errore ? dopo : chiudiLotto(r.stato, l.id).stato;
    }
  }
  return annota(dopo, 'Serata chiusa.');
}

/** Il prossimo lotto da aprire, se c'è. */
export function prossimoLotto(s: StatoProva): LottoProva | null {
  return s.lotti.find((l) => l.stato === 'called') ?? null;
}

export function lottoLive(s: StatoProva): LottoProva | null {
  return s.lotti.find((l) => l.stato === 'live') ?? null;
}
