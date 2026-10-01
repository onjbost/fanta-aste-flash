import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Prove di `segnaCoda`, la server action che spunta le righe della coda.
 *
 * Qui non si prova una funzione pura: si prova che la query che parte sia
 * quella giusta, e in particolare che il filtro per lega ci sia. Gli id
 * arrivano dal browser, e un id di un'altra lega non deve poter essere
 * segnato nemmeno mandandolo a mano — la lega di chi chiama decide cosa si
 * può toccare, non l'elenco che manda. È una proprietà di sicurezza, e si
 * vede solo guardando la chiamata.
 *
 * Il database è finto e registra cosa gli è stato chiesto; la selezione
 * finale (`select('id')`) restituisce solo le righe che davvero sono della
 * lega, come farebbe Postgres.
 */

const DB = {
  righe: [
    { id: 'r1', league_id: 'lega-mia' },
    { id: 'r2', league_id: 'lega-mia' },
    { id: 'r3', league_id: 'lega-altra' },
  ],
};

let utente: { id: string } | null;
let membro: { is_admin: boolean; league_id: string } | null;
let chiamate: { ids: string[]; leagueId: string | null; valori: Record<string, unknown> };
/** com'è stato chiesto chi sono: tabella, colonna e valore */
let chiesto: { tabella: string; colonna: string; valore: string } | null;

function finestraAdmin() {
  return {
    from: (tabella: string) => {
      if (tabella !== 'admin_tasks') throw new Error(`tabella inattesa: ${tabella}`);
      return {
        update(valori: Record<string, unknown>) {
          chiamate.valori = valori;
          const q = {
            in(_col: string, ids: string[]) { chiamate.ids = ids; return q; },
            eq(col: string, v: string) { if (col === 'league_id') chiamate.leagueId = v; return q; },
            select() {
              // come Postgres: tocca solo le righe che passano i filtri
              const dati = DB.righe.filter((r) => chiamate.ids.includes(r.id)
                && (chiamate.leagueId === null || r.league_id === chiamate.leagueId));
              return Promise.resolve({ data: dati.map((r) => ({ id: r.id })), error: null });
            },
          };
          return q;
        },
      };
    },
  };
}

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => finestraAdmin(),
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: utente } }) },
    /*
     * Registra come viene chiesto «chi sei»: senza questo il finto database
     * rispondeva a qualunque domanda, e la prova che la lega è quella
     * dell'utente autenticato non provava niente — una lettura dalla tabella
     * sbagliata, o filtrata su un altro utente, sarebbe passata.
     */
    from: (tabella: string) => ({
      select: () => ({
        eq: (colonna: string, valore: string) => {
          chiesto = { tabella, colonna, valore };
          return { maybeSingle: async () => ({ data: membro }) };
        },
      }),
    }),
  }),
}));

const { segnaCoda } = await import('./actions');

const modulo = (ids: string, fatto: 'si' | 'no') => {
  const f = new FormData();
  f.set('ids', ids);
  f.set('fatto', fatto);
  return f;
};

beforeEach(() => {
  utente = { id: 'u1' };
  membro = { is_admin: true, league_id: 'lega-mia' };
  chiamate = { ids: [], leagueId: null, valori: {} };
  chiesto = null;
});

describe('chi può', () => {
  it('senza sessione non fa niente', async () => {
    utente = null;
    const r = await segnaCoda(null, modulo('r1', 'si'));
    expect(r?.ok).toBe(false);
    expect(chiamate.ids).toEqual([]);
  });

  it('un allenatore non admin non fa niente', async () => {
    membro = { is_admin: false, league_id: 'lega-mia' };
    const r = await segnaCoda(null, modulo('r1', 'si'));
    expect(r?.ok).toBe(false);
    expect(chiamate.ids).toEqual([]);
  });
});

describe('il filtro per lega', () => {
  it('la update filtra sempre per la lega di chi chiama', async () => {
    await segnaCoda(null, modulo('r1,r2', 'si'));
    expect(chiamate.leagueId).toBe('lega-mia');
  });

  it('e la lega è quella dell\'utente autenticato, chiesta a team_members', async () => {
    await segnaCoda(null, modulo('r1', 'si'));
    expect(chiesto).toEqual({ tabella: 'team_members', colonna: 'user_id', valore: 'u1' });
  });

  it('un id di un\'altra lega non viene segnato', async () => {
    const r = await segnaCoda(null, modulo('r3', 'si'));
    expect(r?.ok).toBe(false);
    expect(r?.message).toContain('Non ho trovato');
  });

  it('mescolando il proprio e l\'altrui passa solo il proprio', async () => {
    const r = await segnaCoda(null, modulo('r1,r3', 'si'));
    expect(r?.ok).toBe(true);
    expect(r?.message).toContain('1 riga');
  });
});

describe('cosa scrive', () => {
  it('fatto: mette done e la data', async () => {
    await segnaCoda(null, modulo('r1', 'si'));
    expect(chiamate.valori.done).toBe(true);
    expect(typeof chiamate.valori.done_at).toBe('string');
  });

  it('da fare: toglie done e cancella la data, non la lascia lì', async () => {
    await segnaCoda(null, modulo('r1', 'no'));
    expect(chiamate.valori.done).toBe(false);
    expect(chiamate.valori.done_at).toBe(null);
  });
});

describe('quello che arriva dal browser', () => {
  it('niente di selezionato: lo dice e non chiama il database', async () => {
    const r = await segnaCoda(null, modulo('', 'si'));
    expect(r?.ok).toBe(false);
    expect(chiamate.ids).toEqual([]);
  });

  it('spazi e virgole di troppo non diventano id vuoti', async () => {
    await segnaCoda(null, modulo(' r1 , , r2 ,', 'si'));
    expect(chiamate.ids).toEqual(['r1', 'r2']);
  });

  it('un elenco assurdamente lungo si ferma prima del database', async () => {
    const tanti = Array.from({ length: 201 }, (_, i) => `x${i}`).join(',');
    const r = await segnaCoda(null, modulo(tanti, 'si'));
    expect(r?.ok).toBe(false);
    expect(chiamate.ids).toEqual([]);
  });
});

describe('come lo racconta', () => {
  it('una riga sola al singolare', async () => {
    const r = await segnaCoda(null, modulo('r1', 'si'));
    expect(r?.message).toBe('1 riga segnata come fatta.');
  });

  it('due righe al plurale', async () => {
    const r = await segnaCoda(null, modulo('r1,r2', 'si'));
    expect(r?.message).toBe('2 righe segnate come fatte.');
  });

  it('e al contrario', async () => {
    const r = await segnaCoda(null, modulo('r1,r2', 'no'));
    expect(r?.message).toBe('2 righe rimesse fra quelle da fare.');
  });
});
