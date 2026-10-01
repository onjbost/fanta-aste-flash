import 'server-only';
import { supabaseAdmin } from './supabase';
import type { VoceCoda } from './codaAdmin';

/**
 * Leggere la coda operativa.
 *
 * Passa dal service role e filtra per lega a mano: sulla tabella la policy
 * di sola lettura per l'admin esiste comunque, ma qui serve anche il nome
 * della squadra agganciata, e la lettura è la stessa sia per `/admin` che
 * per il pannello in sala — che chiede solo le righe della serata.
 */

export interface CodaLetta {
  voci: VoceCoda[];
  /** cosa dire all'admin quando la lettura non è andata, invece di un pannello vuoto */
  avviso: string | null;
}

export const VUOTA: CodaLetta = { voci: [], avviso: null };

export async function leggiLaCoda(leagueId: string, sessionId?: string): Promise<CodaLetta> {
  const db = supabaseAdmin();

  let q = db.from('admin_tasks')
    .select('id, body, done, done_at, created_at, team_id, teams:team_id(name)')
    .eq('league_id', leagueId);
  if (sessionId) q = q.eq('session_id', sessionId);

  const { data, error } = await q;

  if (error) {
    /*
     * Il caso che capita per davvero: il codice è in produzione e la
     * migrazione no. Senza questo ramo la pagina `/admin` andrebbe in errore
     * intera — le richieste di svincolo da decidere comprese — per una
     * colonna che manca. Dirlo e lasciare il resto in piedi è meglio che
     * nascondere il motivo con un elenco vuoto.
     *
     * Con la colonna assente non si arriva al 42703 di Postgres: PostgREST
     * si ferma prima, perché non riesce a risolvere il collegamento
     * `teams:team_id(name)`, e risponde PGRST200. Si guardano tutti e tre i
     * segni. Il messaggio vero resta in coda alla frase: se un domani
     * l'errore fosse un altro — una cache dello schema rimasta indietro,
     * per esempio — si vede, invece di leggere un consiglio sbagliato.
     */
    const colonnaMancante = error.code === '42703' || error.code === 'PGRST200'
      || error.message.includes('team_id');
    return {
      voci: [],
      avviso: colonnaMancante
        ? 'La coda non si legge: sembra mancare la migrazione 0028, quella della colonna'
          + ` della squadra. Lanciala dall'editor SQL di Supabase e ricarica. (${error.message})`
        : `La coda non si legge: ${error.message}`,
    };
  }

  type Riga = {
    id: string; body: string; done: boolean; done_at: string | null; created_at: string;
    team_id: string | null; teams: { name: string } | null;
  };

  const voci = ((data ?? []) as unknown as Riga[]).map((r) => ({
    id: r.id,
    corpo: r.body,
    fatto: r.done,
    fattoIl: r.done_at,
    creataIl: r.created_at,
    squadra: r.teams?.name ?? null,
    squadraId: r.team_id,
  }));

  return { voci, avviso: null };
}
