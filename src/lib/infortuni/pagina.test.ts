import { describe, expect, it } from 'vitest';
import {
  durataLeggibile, giorniDiStop, leggiIndisponibili, nuoviInfortunati, stimaRientro, testoDiHtml,
} from './pagina';

// Testo copiato dalla pagina vera di fantacalcio.it il 27 settembre 2026.
// Non inventato: è la forma su cui il parser deve reggere.
const PAGINA = `
Atalanta
Infortunati
Kossounou
Il difensore frenato da una lesione muscolare di medio-alto grado del bicipite femorale della coscia sinistra alla vigilia della sfida di campionato contro la Juventus (del 20 settembre). Lungo stop, ipotizziamo un rientro dalla fine di novembre.
Hien
il difensore operato a fine giugno per una lesione del tendine prossimale del muscolo semimembranoso della coscia sinistra, in recupero e pronto a tornare in campo dalla fine di ottobre.
Sulemana K.
L'attaccante KO in amichevole l'8 agosto vittima di una lesione del collaterale mediale di secondo grado del ginocchio sinistro. Recuperabile da inizio ottobre, ma da valutare nei prossimi allenamenti le possibilità di convocazione.
Squalificati
Nessuno
Diffidati
Nessuno
Bologna
Infortunati
Odgaard
Il calciatore frenato dopo il match col Toro da una lesione ai flessori della coscia destra, recuperabile dalla seconda metà di ottobre.
Squalificati
Nessuno
Diffidati
Nessuno
Cagliari
Infortunati
Idrissi R.
il calciatore in ripresa dalla rottura del legamento crociato, può tornare arruolabile dalla fine di ottobre.
Felici
il centrocampista KO il 7 settembre contro il Lecce in casa vittima della rottura del legamento crociato anteriore. Verrà operato e costretto a un lungo stop (ipotizziamo un rientro da marzo).
Squalificati
Nessuno
Diffidati
Nessuno
`;

const CLUB = ['Atalanta', 'Bologna', 'Cagliari', 'Juventus', 'Lecce'];
const OGGI = new Date('2026-09-27T00:00:00Z');

describe('leggiIndisponibili', () => {
  const righe = leggiIndisponibili(PAGINA, CLUB, OGGI);

  it('trova tutti e sei gli infortunati, nell\'ordine, e nessun fantasma', () => {
    expect(righe.map((r) => r.nome)).toEqual([
      'Kossounou', 'Hien', 'Sulemana K.', 'Odgaard', 'Idrissi R.', 'Felici',
    ]);
  });

  it('attacca ogni giocatore alla sua squadra', () => {
    expect(righe.find((r) => r.nome === 'Odgaard')?.club).toBe('Bologna');
    expect(righe.find((r) => r.nome === 'Felici')?.club).toBe('Cagliari');
  });

  it('non scambia «Juventus» citata in una descrizione per un cambio di squadra', () => {
    // la descrizione di Kossounou nomina la Juventus: se il parser la
    // trattasse come intestazione, Hien e Sulemana finirebbero lì
    expect(righe.find((r) => r.nome === 'Hien')?.club).toBe('Atalanta');
  });

  it('tiene il nome abbreviato com\'è, che è la forma del listone', () => {
    expect(righe.map((r) => r.nome)).toContain('Sulemana K.');
  });

  it('non inventa righe per le sezioni vuote', () => {
    expect(righe.every((r) => r.categoria === 'infortunato')).toBe(true);
  });

  it('conserva sempre la descrizione intera', () => {
    expect(righe.find((r) => r.nome === 'Felici')?.descrizione).toContain('legamento crociato anteriore');
  });
});

describe('stimaRientro', () => {
  it('legge «dalla fine di novembre»', () => {
    expect(stimaRientro('ipotizziamo un rientro dalla fine di novembre.', OGGI)?.data)
      .toBe('2026-11-25');
  });

  it('legge «dalla seconda metà di ottobre»', () => {
    expect(stimaRientro('recuperabile dalla seconda metà di ottobre.', OGGI)?.data)
      .toBe('2026-10-20');
  });

  it('legge «da inizio ottobre»', () => {
    expect(stimaRientro('Recuperabile da inizio ottobre.', OGGI)?.data).toBe('2026-10-05');
  });

  it('porta al futuro un mese già passato', () => {
    // «da marzo» a settembre 2026 vuol dire marzo 2027, non marzo scorso
    expect(stimaRientro('costretto a un lungo stop (ipotizziamo un rientro da marzo).', OGGI)?.data)
      .toBe('2027-03-15');
  });

  it('NON prende la data dell\'infortunio per quella del rientro', () => {
    // è l'errore più grave che questo parser possa fare: «KO il 7 settembre»
    // non è un rientro, e senza l'aggancio a una parola di ritorno lo
    // diventerebbe
    expect(stimaRientro('KO il 7 settembre contro il Lecce, lesione grave.', OGGI)).toBeNull();
  });

  it('torna a mani vuote quando la prosa non dice un mese', () => {
    expect(stimaRientro('Lungo stop, da valutare nei prossimi giorni.', OGGI)).toBeNull();
  });

  it('conserva la frase da cui ha dedotto la data', () => {
    expect(stimaRientro('pronto a tornare in campo dalla fine di ottobre.', OGGI)?.testo)
      .toContain('ottobre');
  });
});

describe('giorniDiStop', () => {
  it('conta i giorni che mancano', () => {
    expect(giorniDiStop('2026-11-26', OGGI)).toBe(60);
  });
  it('senza stima non conta niente, invece di dire zero', () => {
    expect(giorniDiStop(null, OGGI)).toBeNull();
  });
});

describe('testoDiHtml', () => {
  it('butta script e stili, che altrimenti finirebbero fra i nomi', () => {
    const t = testoDiHtml('<div>Atalanta<script>var x = "Kossounou";</script><p>Hien</p></div>');
    expect(t).not.toContain('var x');
    expect(t.split('\n')).toEqual(['Atalanta', 'Hien']);
  });
  it('rimette le lettere accentate scritte come entità', () => {
    expect(testoDiHtml('<p>met&agrave; di ottobre</p>')).toBe('metà di ottobre');
  });
});

describe('nuoviInfortunati', () => {
  const r = (nome: string, categoria: 'infortunato' | 'in_dubbio' = 'infortunato', playerId?: string) =>
    ({ nome, categoria, playerId: playerId ?? null });

  it('segnala solo chi prima non era fermo', () => {
    const prima = [r('Kossounou'), r('Hien')];
    const adesso = [r('Kossounou'), r('Hien'), r('Lukaku')];
    expect(nuoviInfortunati(prima, adesso).map((x) => x.nome)).toEqual(['Lukaku']);
  });

  it('non ripete ogni settimana lo stesso infortunio lungo', () => {
    const uguale = [r('Felici')];
    expect(nuoviInfortunati(uguale, uguale)).toEqual([]);
  });

  it('segnala chi da «in dubbio» diventa infortunato', () => {
    expect(nuoviInfortunati([r('Dybala', 'in_dubbio')], [r('Dybala')]).map((x) => x.nome))
      .toEqual(['Dybala']);
  });

  it('non segnala chi è guarito: è una buona notizia, non un allarme', () => {
    expect(nuoviInfortunati([r('Hien')], [])).toEqual([]);
  });

  it('riconosce lo stesso giocatore dall\'id anche se la fonte cambia il nome', () => {
    const prima = [r('Sulemana K.', 'infortunato', 'p1')];
    const adesso = [r('Sulemana Ka.', 'infortunato', 'p1')];
    expect(nuoviInfortunati(prima, adesso)).toEqual([]);
  });
});

describe('durataLeggibile', () => {
  it('parla in mesi quando sono mesi', () => {
    expect(durataLeggibile(61)).toBe('circa 2 mesi (61 giorni)');
  });
  it('non finge una precisione che non ha', () => {
    expect(durataLeggibile(null)).toBe('durata non dichiarata dalla fonte');
  });
  it('dice «imminente» invece di un numero negativo', () => {
    expect(durataLeggibile(-3)).toBe('rientro imminente');
  });
});

describe('stimaRientro — casi trovati sui dati veri del 28 settembre', () => {
  const OGGI2 = new Date('2026-09-28T00:00:00Z');

  it('legge «lo terrà ai box fino alla metà di ottobre»', () => {
    // Rovella: l'unico dei 48 indisponibili veri in cui la data c'era e non
    // veniva presa. «fino a» non era fra le parole che accendono la ricerca.
    expect(stimaRientro(
      'KO il 30 agosto contro il Genoa vittima di una lesione muscolare al polpaccio che lo terrà ai box fino alla metà di ottobre.',
      OGGI2)?.data).toBe('2026-10-15');
  });

  it('continua a NON leggere le frasi che una data non ce l\'hanno', () => {
    // le altre dieci senza data: sono corrette così, non vanno «aggiustate»
    for (const f of [
      'da valutare nei prossimi allenamenti le possibilità di convocazione',
      'Proverà a recuperare a pieno durante la sosta',
      'Tempi di recupero da valutare',
      'rimane da valutare quotidianamente',
      'Punta a recuperare nella sosta',
    ]) expect(stimaRientro(f, OGGI2), f).toBeNull();
  });

  it('non prende la data della partita in cui si è fatto male', () => {
    expect(stimaRientro('KO il 7 settembre contro il Lecce, rottura del crociato.', OGGI2)).toBeNull();
    expect(stimaRientro('non convocato per Genova (12 settembre) a causa di una sindrome.', OGGI2)).toBeNull();
  });
});
