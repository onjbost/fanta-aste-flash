import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Prove di `chiudiRigaDelloSvincolo`.
 *
 * Qui non si prova una funzione pura: si prova *quali* righe vengono scelte
 * e cosa viene scritto. È la parte con il rischio vero — chiudere la riga
 * sbagliata vuol dire raccontare nella coda una decisione che non è stata
 * presa — e dalle funzioni pure non si vede, perché il filtro per lega e la
 * scelta delle righe vivono nella query.
 *
 * Il database è finto: tiene le righe in memoria e le aggiorna davvero,
 * così alla fine si può guardare com'è rimasta la coda.
 */

type Riga = { id: string; league_id: string; body: string; done: boolean; done_at: string | null };

let righe: Riga[];
let fallisciLettura: boolean;
let fallisciScritturaDi: string | null;

function finto() {
  return {
    from: (tabella: string) => {
      if (tabella !== 'admin_tasks') throw new Error(`tabella inattesa: ${tabella}`);
      return {
        select() {
          const q = {
            _lega: null as string | null,
            _done: null as boolean | null,
            eq(col: string, v: unknown) {
              if (col === 'league_id') q._lega = v as string;
              if (col === 'done') q._done = v as boolean;
              return q;
            },
            then(risolvi: (r: unknown) => void) {
              if (fallisciLettura) return risolvi({ data: null, error: { message: 'giù' } });
              const dati = righe
                .filter((r) => (q._lega === null || r.league_id === q._lega)
                  && (q._done === null || r.done === q._done))
                .map((r) => ({ id: r.id, body: r.body }));
              return risolvi({ data: dati, error: null });
            },
          };
          return q;
        },
        update(valori: Partial<Riga>) {
          return {
            eq(_col: string, id: string) {
              if (fallisciScritturaDi === id) {
                return Promise.resolve({ error: { message: 'non scritta' } });
              }
              const r = righe.find((x) => x.id === id);
              if (r) Object.assign(r, valori);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => finto() }));
vi.mock('./supabase', () => ({ supabaseAdmin: () => finto() }));

const { chiudiRigaDelloSvincolo } = await import('./codaSvincolo');

const riga = (p: Partial<Riga> & { id: string }): Riga => ({
  league_id: 'lega-mia',
  body: 'Svincolo gratuito da decidere · FC CANEPARDO: NERES (A)',
  done: false,
  done_at: null,
  ...p,
});

beforeEach(() => {
  fallisciLettura = false;
  fallisciScritturaDi = null;
  righe = [
    // le due righe gemelle del 1º settembre: stessa squadra, stesso giocatore
    riga({ id: 'a' }),
    riga({ id: 'b' }),
    riga({ id: 'c', body: 'Svincolo gratuito da decidere · FC CANEPARDO: KEMPF (D)' }),
    // un omonimo chiesto da un'altra squadra della stessa lega
    riga({ id: 'd', body: 'Svincolo gratuito da decidere · Qarabaggio: NERES (A)' }),
    // la stessa identica richiesta, ma in un'altra lega
    riga({ id: 'e', league_id: 'lega-altra' }),
    // una riga della coda che non è una richiesta di svincolo
    riga({ id: 'f', body: 'Nella rosa FC CANEPARDO: svincolare NERES (+1 cr), acquistare X per 3 cr.' }),
    // una già chiusa
    riga({ id: 'g', done: true, done_at: '2026-09-02T10:00:00.000Z' }),
  ];
});

const chiuse = () => righe.filter((r) => r.done).map((r) => r.id).sort();

describe('quali righe chiude', () => {
  it('chiude le sue, e solo le sue', async () => {
    const esito = await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    expect(esito).toEqual({ chiuse: 2, errore: false });
    // 'g' era già chiusa in partenza
    expect(chiuse()).toEqual(['a', 'b', 'g']);
  });

  it('le due richieste gemelle si chiudono insieme: una risposta vale per entrambe', async () => {
    await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    expect(righe.find((r) => r.id === 'a')!.body)
      .toBe('Svincolo gratuito approvato · FC CANEPARDO: NERES (A)');
    expect(righe.find((r) => r.id === 'b')!.body)
      .toBe('Svincolo gratuito approvato · FC CANEPARDO: NERES (A)');
  });

  it('non tocca la riga di un\'altra squadra sullo stesso nome', async () => {
    await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    const altra = righe.find((r) => r.id === 'd')!;
    expect(altra.done).toBe(false);
    expect(altra.body).toBe('Svincolo gratuito da decidere · Qarabaggio: NERES (A)');
  });

  it('non tocca la riga di un\'altra lega', async () => {
    await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    expect(righe.find((r) => r.id === 'e')!.done).toBe(false);
  });

  it('non tocca le righe che non sono richieste di svincolo', async () => {
    await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    expect(righe.find((r) => r.id === 'f')!.done).toBe(false);
  });

  it('su un giocatore senza richieste aperte non fa niente, e non è un errore', async () => {
    const esito = await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NOSLIN', 'respinto');
    expect(esito).toEqual({ chiuse: 0, errore: false });
    expect(chiuse()).toEqual(['g']);
  });
});

describe('cosa scrive', () => {
  it('mette il verbo dell\'esito e la data', async () => {
    await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'KEMPF', 'ritirato');
    const r = righe.find((x) => x.id === 'c')!;
    expect(r.body).toBe('Svincolo gratuito ritirato · FC CANEPARDO: KEMPF (D)');
    expect(r.done).toBe(true);
    expect(typeof r.done_at).toBe('string');
  });
});

describe('quando il database fa i capricci', () => {
  it('se la lettura non va lo dice, invece di far finta di niente', async () => {
    fallisciLettura = true;
    const esito = await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    expect(esito).toEqual({ chiuse: 0, errore: true });
  });

  /*
   * Una scrittura che fallisce a metà è il caso che conta: l'altra riga va
   * chiusa lo stesso — meglio una su due che nessuna — ma chi ha chiamato
   * deve sapere che qualcosa è rimasto indietro.
   */
  it('se una scrittura fallisce, chiude le altre e lo segnala', async () => {
    fallisciScritturaDi = 'a';
    const esito = await chiudiRigaDelloSvincolo('lega-mia', 'FC CANEPARDO', 'NERES', 'approvato');
    expect(esito).toEqual({ chiuse: 1, errore: true });
    expect(righe.find((r) => r.id === 'a')!.done).toBe(false);
    expect(righe.find((r) => r.id === 'b')!.done).toBe(true);
  });
});
