import 'server-only';

/**
 * Le schede dei giocatori lette dal database: l'ultima raccolta degli
 * indisponibili, le statistiche di stagione e gli autogol dei tabellini.
 *
 * Si legge col client di chi guarda la pagina: indisponibili e statistiche
 * li legge chiunque sia dentro, perché l'etichetta «Infortunato» deve
 * vederla ogni allenatore. Se una lettura fallisce la pagina si mostra lo
 * stesso, senza quel dato.
 */

import type { supabaseServer } from '@/lib/supabase';
import {
  contaAutogol, piuGrave, type CategoriaIndisponibile, type Indisponibile, type Scheda, type Statistiche,
} from './schede';

type Db = Awaited<ReturnType<typeof supabaseServer>>;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Le schede dei giocatori, per id. Con `ids` si leggono solo quelli (una
 * rosa, i lotti di un'asta); senza, tutti (il listone).
 */
export async function schedeGiocatori(
  db: Db, opt: { leagueId?: string | null; ids?: string[] } = {},
): Promise<Map<string, Scheda>> {
  const ids = opt.ids ? [...new Set(opt.ids.filter(Boolean))] : null;
  const esito = new Map<string, Scheda>();
  if (ids && !ids.length) return esito;

  let fermi = db.from('v_indisponibili_ultimi')
    .select('player_id, categoria, descrizione, rientro_stimato').not('player_id', 'is', null);
  let numeri = db.from('player_stats')
    .select('player_id, presenze, media_voto, fantamedia, gol, assist, rigori_segnati, rigori_calciati, gol_subiti, rigori_parati, ammonizioni, espulsioni')
    .not('player_id', 'is', null).limit(2000);
  let autogol = opt.leagueId
    ? db.from('lineup_entries')
      .select('player_id, bonus, fixtures(matchdays(serie_a))')
      .eq('league_id', opt.leagueId).not('player_id', 'is', null).gt('bonus->>autogol', '0')
    : null;
  if (ids) {
    fermi = fermi.in('player_id', ids);
    numeri = numeri.in('player_id', ids);
    autogol = autogol?.in('player_id', ids) ?? null;
  }

  const [{ data: f }, { data: s }, ag] = await Promise.all([
    fermi, numeri, autogol ?? Promise.resolve({ data: [] as unknown[] }),
  ]);

  const scheda = (id: string): Scheda => {
    let x = esito.get(id);
    if (!x) { x = { indisponibile: null, statistiche: null }; esito.set(id, x); }
    return x;
  };

  for (const r of f ?? []) {
    const ind: Indisponibile = {
      categoria: r.categoria as CategoriaIndisponibile,
      descrizione: String(r.descrizione ?? ''),
      rientroStimato: (r.rientro_stimato as string | null) ?? null,
    };
    const x = scheda(String(r.player_id));
    x.indisponibile = piuGrave(x.indisponibile, ind);
  }

  type RigaAutogol = { player_id: string; bonus: Record<string, unknown> | null; fixtures: { matchdays: { serie_a: number } | null } | null };
  const autoreti = contaAutogol(((ag.data ?? []) as unknown as RigaAutogol[]).map((r) => ({
    playerId: r.player_id,
    serieA: r.fixtures?.matchdays?.serie_a ?? null,
    autogol: Number(r.bonus?.autogol ?? 0) || 0,
  })));

  for (const r of s ?? []) {
    const id = String(r.player_id);
    const st: Statistiche = {
      presenze: num(r.presenze),
      mediaVoto: num(r.media_voto),
      fantamedia: num(r.fantamedia),
      gol: num(r.gol),
      assist: num(r.assist),
      rigoriSegnati: num(r.rigori_segnati),
      rigoriCalciati: num(r.rigori_calciati),
      golSubiti: num(r.gol_subiti),
      rigoriParati: num(r.rigori_parati),
      ammonizioni: num(r.ammonizioni),
      espulsioni: num(r.espulsioni),
      // un autogol che i tabellini non riportano non è uno zero: è un dato che
      // manca. Dall'API della lega il contatore degli autogol non è ancora
      // stato riconosciuto, quindi si mostra solo quando c'è
      autogol: autoreti.get(id) ?? null,
    };
    scheda(id).statistiche = st;
  }
  return esito;
}
