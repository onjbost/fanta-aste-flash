import { describe, it, expect } from 'vitest';
import {
  msgNewCall, msgCallsClosed, msgJoinsClosed, msgRoomOpen, msgResults,
  longDate, shortDeadline, type MsgSession, type MsgLot,
} from './messages';

const S: MsgSession = {
  number: 3,
  auctionAt: '2026-10-29T21:30:00+01:00',
  callsCloseAt: '2026-10-24T21:30:00+02:00',
  joinsCloseAt: '2026-10-28T21:30:00+01:00',
  excludesNewSignings: false,
};

const KOLASINAC = { name: 'KOLASINAC', role: 'D' as const, club: 'Atalanta' };
const NDOYE = { name: 'NDOYE', role: 'C' as const, club: 'Bologna' };

const lots: MsgLot[] = [
  {
    index: 1, player: KOLASINAC, callerTeam: 'Montester United',
    participants: [
      { teamName: 'Montester United', isCaller: true, releaseName: 'SCALVINI', releasePrice: 32, refund: 24, budget: 61 },
      { teamName: 'Real Sballo', isCaller: false, releaseName: 'BIRAGHI', releasePrice: 24, refund: 18, budget: 43 },
    ],
  },
  {
    index: 2, player: NDOYE, callerTeam: 'Atletico Divano',
    participants: [
      { teamName: 'Atletico Divano', isCaller: true, releaseName: 'ORSOLINI', releasePrice: 24, refund: 18, budget: 40 },
    ],
  },
];

describe('date in italiano, fuso di Roma', () => {
  it('scrive la data lunga per il gruppo', () => {
    expect(longDate('2026-10-29T21:30:00+01:00')).toBe('giovedì 29 ottobre');
  });

  it('scrive le scadenze con giorno e ora', () => {
    expect(shortDeadline('2026-10-24T21:30:00+02:00')).toBe('sabato 24/10, ore 21:30');
  });

  it('non sbaglia l\'ora tra ora legale e solare', () => {
    // 24 ottobre è ancora ora legale, il 29 no: entrambi devono dire 21:30
    expect(shortDeadline('2026-10-28T21:30:00+01:00')).toContain('21:30');
    expect(shortDeadline('2026-10-24T21:30:00+02:00')).toContain('21:30');
  });
});

describe('1 · nuova chiamata', () => {
  const m = msgNewCall(S, 'Montester United', KOLASINAC);

  it('dice chi ha chiamato chi', () => {
    expect(m).toContain('Montester United ha chiamato lo svincolato');
    expect(m).toContain('KOLASINAC · D · Atalanta');
  });

  it('riporta entrambe le scadenze', () => {
    expect(m).toContain('Chiamate aperte fino a sabato 24/10');
    expect(m).toContain('Adesioni aperte fino a mercoledì 28/10');
  });

  it('non svela mai lo svincolando del chiamante', () => {
    expect(m).not.toContain('SCALVINI');
  });
});

describe('2 · chiusura chiamate', () => {
  const m = msgCallsClosed(S, lots);

  it('elenca i lotti con chiamante e partecipanti', () => {
    expect(m).toContain('CHIAMATE CHIUSE · 2 giocatori all\'asta');
    expect(m).toContain('Chiamato da: Montester United');
    expect(m).toContain('Partecipanti: Real Sballo');
    expect(m).toContain('Partecipanti: nessuno');
  });

  it('non svela svincolandi né budget', () => {
    expect(m).not.toContain('SCALVINI');
    expect(m).not.toContain('61');
  });

  it('segnala la finestra di gennaio quando serve', () => {
    expect(msgCallsClosed({ ...S, excludesNewSignings: true }, lots)).toContain('nuovi acquisti esclusi');
    expect(m).not.toContain('nuovi acquisti esclusi');
  });

  it('gestisce l\'asta senza nessuna chiamata', () => {
    expect(msgCallsClosed(S, [])).toContain('nessun giocatore chiamato');
  });
});

describe('3 · chiusura adesioni', () => {
  const m = msgJoinsClosed(S, lots);

  it('mostra i partecipanti di ogni lotto', () => {
    expect(m).toContain('Partecipanti (2): Montester United, Real Sballo');
  });

  it('annuncia i lotti senza contendenti', () => {
    expect(m).toContain('Nessun contendente → va a Atletico Divano');
  });

  it('ribadisce che svincolandi e budget restano segreti', () => {
    expect(m).toContain('restano segreti');
    expect(m).not.toContain('BIRAGHI');
    expect(m).not.toContain('budget d\'asta');
  });
});

describe('4 · apertura sala', () => {
  const m = msgRoomOpen(S, lots, 'https://aste.example.it/sala');

  it('svela svincolandi, rimborsi e budget', () => {
    expect(m).toContain('Montester United — svincola SCALVINI (32 cr → +24)');
    expect(m).toContain('budget d\'asta: 61 crediti');
    expect(m).toContain('Real Sballo — svincola BIRAGHI (24 cr → +18)');
  });

  it('mette il link alla sala', () => {
    expect(m).toContain('https://aste.example.it/sala');
  });
});

describe('5 · risultati', () => {
  const closed: MsgLot[] = [
    {
      ...lots[0],
      winnerTeam: 'Montester United', finalPrice: 44, runnerUpPrice: 43,
      releasedName: 'SCALVINI', refund: 24, creditsBefore: 37, creditsAfter: 17,
      changesLeftLabel: 'Cambi DIF: 2/3',
    },
    {
      ...lots[1],
      winnerTeam: 'Atletico Divano', finalPrice: 18, uncontested: true,
      releasedName: 'ORSOLINI', refund: 18, creditsBefore: 22, creditsAfter: 22,
      changesLeftLabel: 'Cambi CEN: 2/3',
    },
  ];
  const m = msgResults(S, closed, '2026-11-17T21:30:00+01:00');

  it('dice vincitore, prezzo e chi si è fermato prima', () => {
    expect(m).toContain('KOLASINAC → Montester United per 44 crediti');
    expect(m).toContain('Real Sballo si ferma a 43');
  });

  it('spiega il lotto senza contendenti', () => {
    expect(m).toContain('nessun contendente, 75% di ORSOLINI');
  });

  it('riporta i crediti prima e dopo e i cambi rimasti', () => {
    expect(m).toContain('Crediti: 37 → 17 · Cambi DIF: 2/3');
    expect(m).toContain('Crediti: 22 → 22');   // aggiudicazione a saldo neutro
  });

  it('annuncia la prossima asta', () => {
    expect(m).toContain('Prossima asta flash: martedì 17 novembre');
  });

  it('sa anche che era l\'ultima', () => {
    expect(msgResults(S, closed)).toContain('ultima asta flash della stagione');
  });
});
