import { describe, expect, it } from 'vitest';
import { dataRoma, giornataPronta, giornoDelCalcolo, giornoDopo } from './quando';

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
