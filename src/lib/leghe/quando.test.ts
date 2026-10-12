import { describe, expect, it } from 'vitest';
import {
  dataRoma, giornataPronta, giornoDelCalcolo, giornoDopo, partiteAperte, unisciCalendario, type PartitaNostra,
} from './quando';

const ms = (iso: string) => Date.parse(iso);

describe('il giorno in cui leggere la giornata', () => {
  const giornata = [
    { kickoff: ms('2026-10-02T18:45:00Z'), rinviata: false },   // venerdì sera
    { kickoff: ms('2026-10-04T13:00:00Z'), rinviata: false },
    { kickoff: ms('2026-10-05T18:45:00Z'), rinviata: false },   // posticipo del lunedì
  ];

  it('è il giorno dopo l\'ultima partita', () => {
    expect(giornoDelCalcolo(giornata)).toBe('2026-10-06');
  });

  it('un posticipo spostato sposta il giorno', () => {
    const spostata = [...giornata.slice(0, 2), { kickoff: ms('2026-10-06T18:45:00Z'), rinviata: false }];
    expect(giornoDelCalcolo(spostata)).toBe('2026-10-07');
  });

  it('una partita rinviata non si aspetta', () => {
    const rinvio = [...giornata.slice(0, 2), { kickoff: ms('2026-10-05T18:45:00Z'), rinviata: true }];
    expect(giornoDelCalcolo(rinvio)).toBe('2026-10-05');
  });

  it('conta il giorno di Roma: una partita alle 23:30 di domenica a Roma è ancora domenica', () => {
    // 21:30 UTC d'estate = 23:30 a Roma
    expect(dataRoma(ms('2026-10-04T21:30:00Z'))).toBe('2026-10-04');
    expect(giornoDelCalcolo([{ kickoff: ms('2026-10-04T21:30:00Z'), rinviata: false }])).toBe('2026-10-05');
  });

  it('pronta dal mattino del giorno dopo, non prima', () => {
    expect(giornataPronta(giornata, ms('2026-10-05T21:00:00Z'))).toBe(false);   // lunedì sera, a Roma 23:00
    expect(giornataPronta(giornata, ms('2026-10-06T06:00:00Z'))).toBe(true);    // il cron di martedì
  });

  it('senza date non è mai pronta', () => {
    expect(giornataPronta([{ kickoff: null, rinviata: false }], Date.now())).toBe(false);
  });

  it('il giorno dopo attraversa i mesi', () => {
    expect(giornoDopo('2026-10-31')).toBe('2026-11-01');
  });
});

describe('il calendario intero, non solo quello che dice il live', () => {
  // la 6ª di Serie A 2026-27 com'era la mattina di domenica 11 ottobre: tre
  // partite il sabato, cinque la domenica, due posticipi il lunedì senza orario
  const nostre: PartitaNostra[] = [
    { casa: 'Genoa', ospite: 'Fiorentina', kickoff: ms('2026-10-10T13:00:00Z'), stato: 'played' },
    { casa: 'Inter', ospite: 'Parma', kickoff: null, stato: 'scheduled' },
    { casa: 'Napoli', ospite: 'Frosinone', kickoff: null, stato: 'scheduled' },
    { casa: 'Como', ospite: 'Roma', kickoff: null, stato: 'scheduled' },
    { casa: 'Lazio', ospite: 'Monza', kickoff: null, stato: 'scheduled' },
    { casa: 'Lecce', ospite: 'Bologna', kickoff: null, stato: 'scheduled' },
    { casa: 'Sassuolo', ospite: 'Milan', kickoff: null, stato: 'scheduled' },
    { casa: 'Cagliari', ospite: 'Juventus', kickoff: null, stato: 'scheduled' },
    { casa: 'Torino', ospite: 'Udinese', kickoff: null, stato: 'scheduled' },
    { casa: 'Atalanta', ospite: 'Venezia', kickoff: null, stato: 'scheduled' },
  ];
  const finita = (teamHome: string, teamAway: string, iso: string) => ({ teamHome, teamAway, status: 4, matchDate: ms(iso) });
  const stesso = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  // il live elenca solo le partite già cominciate
  const liveDomenica = [
    finita('GENOA', 'FIORENTINA', '2026-10-10T13:00:00Z'),
    finita('INTER', 'PARMA', '2026-10-10T16:00:00Z'),
    finita('NAPOLI', 'FROSINONE', '2026-10-10T18:45:00Z'),
  ];
  const domenica9 = ms('2026-10-11T07:28:00Z');

  it('domenica mattina la giornata non è pronta, anche se il live ha solo partite finite', () => {
    const cal = unisciCalendario(nostre, liveDomenica, stesso);
    expect(cal).toHaveLength(10);
    expect(partiteAperte(cal)).toHaveLength(7);
    expect(giornoDelCalcolo(cal)).toBeNull();   // ci sono partite senza orario
    expect(giornataPronta(cal, domenica9)).toBe(false);
  });

  const liveLunedi = [
    ...liveDomenica,
    finita('COMO', 'ROMA', '2026-10-11T10:30:00Z'),
    finita('LAZIO', 'MONZA', '2026-10-11T13:00:00Z'),
    finita('LECCE', 'BOLOGNA', '2026-10-11T13:00:00Z'),
    finita('SASSUOLO', 'MILAN', '2026-10-11T16:00:00Z'),
    finita('CAGLIARI', 'JUVENTUS', '2026-10-11T18:45:00Z'),
  ];

  it('lunedì mattina nemmeno: mancano i posticipi', () => {
    const cal = unisciCalendario(nostre, liveLunedi, stesso);
    expect(partiteAperte(cal).map((p) => p.nome)).toEqual(['Torino-Udinese', 'Atalanta-Venezia']);
    expect(giornataPronta(cal, ms('2026-10-12T07:28:00Z'))).toBe(false);
  });

  const liveMartedi = [
    ...liveLunedi,
    finita('TORINO', 'UDINESE', '2026-10-12T16:30:00Z'),
    finita('ATALANTA', 'VENEZIA', '2026-10-12T18:45:00Z'),
  ];

  it('martedì alle 9 sì, e non un minuto prima di mezzanotte', () => {
    const cal = unisciCalendario(nostre, liveMartedi, stesso);
    expect(partiteAperte(cal)).toHaveLength(0);
    expect(giornoDelCalcolo(cal)).toBe('2026-10-13');
    expect(giornataPronta(cal, ms('2026-10-12T21:30:00Z'))).toBe(false);   // lunedì 23:30 a Roma
    expect(giornataPronta(cal, ms('2026-10-13T07:28:00Z'))).toBe(true);
  });

  it('un turno infrasettimanale: pronta il giovedì se l\'ultima è il mercoledì', () => {
    const tutte = nostre.map((n, i) => ({ teamHome: n.casa, teamAway: n.ospite, status: 4, matchDate: ms(i < 5 ? '2026-10-27T18:45:00Z' : '2026-10-28T18:45:00Z') }));
    const cal = unisciCalendario(nostre, tutte, stesso);
    expect(giornataPronta(cal, ms('2026-10-28T07:28:00Z'))).toBe(false);
    expect(giornataPronta(cal, ms('2026-10-29T07:28:00Z'))).toBe(true);
  });

  it('una rinviata non si aspetta, nemmeno senza orario', () => {
    const live = [...liveLunedi, finita('TORINO', 'UDINESE', '2026-10-12T16:30:00Z'),
      { teamHome: 'ATALANTA', teamAway: 'VENEZIA', status: 6, matchDate: 0 }];
    const cal = unisciCalendario(nostre, live, stesso);
    expect(giornoDelCalcolo(cal)).toBe('2026-10-13');
    expect(giornataPronta(cal, ms('2026-10-13T07:28:00Z'))).toBe(true);
  });

  it('una partita cominciata e non finita il giorno dopo ferma tutto', () => {
    const live = [...liveMartedi.slice(0, -1), { teamHome: 'ATALANTA', teamAway: 'VENEZIA', status: 5, matchDate: ms('2026-10-12T18:45:00Z') }];
    const cal = unisciCalendario(nostre, live, stesso);
    expect(giornataPronta(cal, ms('2026-10-13T07:28:00Z'))).toBe(false);
  });

  it('senza live vale il nostro calendario', () => {
    const giocate = nostre.map((n) => ({ ...n, kickoff: ms('2026-10-11T18:45:00Z'), stato: 'played' }));
    const cal = unisciCalendario(giocate, [], stesso);
    expect(giornataPronta(cal, ms('2026-10-12T07:28:00Z'))).toBe(true);
  });
});
