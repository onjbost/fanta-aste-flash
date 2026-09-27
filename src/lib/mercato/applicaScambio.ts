import 'server-only';

/**
 * Fantacalciomercato — l'effetto sul registro.
 *
 * Il lavoro vero lo fanno due funzioni Postgres, perché supabase-js non ha
 * transazioni multi-statement: una sequenza di chiamate da qui, interrotta a
 * metà, lascerebbe una rosa con un buco. Qui resta solo il passaggio dei
 * parametri e la traduzione dell'errore in qualcosa che l'admin possa
 * leggere senza aprire i log.
 *
 * ATTENZIONE, e vale per tutto il file: `fn_applica_scambio` e
 * `fn_annulla_scambio` sono `security definer` e **non controllano chi le
 * chiama**. Non possono: le invochiamo con la service role key, dove
 * `auth.uid()` è null e `is_admin()` sarebbe sempre falso, quindi le RLS di
 * 0018 non entrano mai in gioco. La loro unica protezione è la revoca
 * dell'EXECUTE ad `anon` e `authenticated` (0019), che tiene fuori i client
 * ma non dice niente su *quale* scambio questo server può toccare.
 *
 * Vuol dire che l'autorizzazione sta tutta nel chiamante: chi passa qui un
 * `tradeId` deve aver già verificato che chi ha premuto il bottone sia admin
 * **e** che quello scambio appartenga alla sua lega. Senza il secondo
 * controllo, un admin potrebbe annullare lo scambio di un'altra lega
 * passandone l'id. Lo fa `scambioDellaLega` in
 * `src/app/admin/messaggi/actions.ts`, che è l'unico posto da cui queste tre
 * funzioni vengono chiamate: se ne nasce un altro, il controllo va rifatto lì.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { RichiestaScambio } from './scambio';
import type { SceltaScambio } from './scambioServer';

export async function salvaScambio(
  leagueId: string, scelta: SceltaScambio, r: RichiestaScambio,
  testo: string, provider: 'gemini' | 'template',
): Promise<string> {
  const db = supabaseAdmin();

  const { data: trade, error } = await db.from('trades').insert({
    league_id: leagueId,
    from_team_id: scelta.fromTeamId,
    to_team_id: scelta.toTeamId,
    settlement: scelta.conguaglio,
    settlement_payer: scelta.conguaglio > 0 ? scelta.chiPaga : null,
    note: scelta.note || null,
    // gli spunti si congelano: rigenerare la prosa non ricalcola i fatti
    spunti: { casa: r.casa, ospite: r.ospite, conguaglio: r.conguaglio, provider },
    body: testo,
    tono: r.tono,
  }).select('id').single();
  if (error) throw new Error(error.message);

  const righe = [
    ...r.casa.cede.map((g) => ({
      trade_id: trade.id, player_id: g.playerId, from_team_id: scelta.fromTeamId,
    })),
    ...r.ospite.cede.map((g) => ({
      trade_id: trade.id, player_id: g.playerId, from_team_id: scelta.toTeamId,
    })),
  ];
  const { error: e2 } = await db.from('trade_items').insert(righe);
  if (e2) {
    // Senza le sue righe, lo scambio è un guscio: `fn_applica_scambio` non
    // troverebbe niente da muovere e lo segnerebbe applicato senza spostare
    // un giocatore — un «fatto» che non è avvenuto. Le due insert non stanno
    // nella stessa transazione (è il limite di supabase-js che ha fatto
    // nascere le funzioni Postgres), quindi il guscio si toglie a mano.
    await db.from('trades').delete().eq('id', trade.id);
    throw new Error(e2.message);
  }

  return trade.id as string;
}

async function chiama(fn: string, tradeId: string) {
  const db = supabaseAdmin();
  const { error } = await db.rpc(fn, { p_trade_id: tradeId });
  if (!error) return { ok: true as const };

  // i messaggi delle funzioni sono già scritti per essere letti da un umano
  return { ok: false as const, errore: error.message };
}

export const applicaScambio = (tradeId: string) => chiama('fn_applica_scambio', tradeId);
export const annullaScambio = (tradeId: string) => chiama('fn_annulla_scambio', tradeId);
