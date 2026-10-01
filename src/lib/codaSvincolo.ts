import 'server-only';
import { supabaseAdmin } from './supabase';
import { corpoDeciso, rigaDaDecidere, type EsitoSvincolo } from './codaAdmin';

/**
 * Chiudere la riga della coda quando una richiesta di svincolo è finita.
 *
 * «Svincolo gratuito da decidere» è un lavoro da fare, e deciderlo *è*
 * farlo: dal momento della decisione quella riga non chiede più niente a
 * nessuno. Finché nessuno la chiudeva, restava in cima alla coda per
 * sempre — il 1º ottobre c'erano ancora le quattro richieste del 1º
 * settembre, decise da un mese.
 *
 * La riga non viene cancellata: cambia il verbo e si sposta fra le fatte.
 * Quello che è successo resta leggibile, che è il punto della coda.
 */
export async function chiudiRigaDelloSvincolo(
  leagueId: string, squadra: string, giocatore: string, esito: EsitoSvincolo,
): Promise<{ chiuse: number; errore: boolean }> {
  const db = supabaseAdmin();

  /*
   * Le righe aperte della lega si leggono tutte e si filtrano qui.
   *
   * Si potrebbe chiedere al database una `like` sul testo, ma il nome di una
   * squadra o di un giocatore può contenere i caratteri che la `like` tratta
   * come jolly, e un apostrofo di troppo è il genere di cosa che sbaglia una
   * riga ogni cento. Le righe aperte di una lega sono una decina: leggerle e
   * confrontarle in chiaro costa niente e non ha trabocchetti.
   */
  const { data, error } = await db.from('admin_tasks')
    .select('id, body').eq('league_id', leagueId).eq('done', false);
  if (error || !data) return { chiuse: 0, errore: true };

  const sue = data.filter((r) => rigaDaDecidere(r.body, squadra, giocatore));
  if (!sue.length) return { chiuse: 0, errore: false };

  /*
   * Se ne chiude più di una quando la stessa squadra aveva chiesto due volte
   * lo stesso giocatore — è successo a settembre, due righe identiche per
   * NERES. Una decisione sola risponde a tutte e due: lasciarne in piedi una
   * vorrebbe dire lasciare in coda una domanda a cui si è già risposto.
   */
  const adesso = new Date().toISOString();
  let chiuse = 0;
  let errore = false;
  for (const r of sue) {
    const { error: e } = await db.from('admin_tasks')
      .update({ body: corpoDeciso(r.body, esito), done: true, done_at: adesso })
      .eq('id', r.id);
    if (e) errore = true;
    else chiuse += 1;
  }
  return { chiuse, errore };
}
