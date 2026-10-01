'use server';

/**
 * Fantacalciomercato — le azioni della pagina degli scambi.
 *
 * Stavano nel centro messaggi, insieme ai testi d'asta, finché lo scambio era
 * solo un annuncio da copiare. Adesso muove contratti e crediti veri, quindi
 * ha una pagina sua e le sue azioni stanno qui: l'autorizzazione di admin e
 * di lega, che è l'unica difesa davanti alle due funzioni Postgres, si legge
 * tutta in un file solo invece che in mezzo alla rubrica dei messaggi.
 */

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { archiveMessage } from '@/lib/telegram';
import { firmaScelta, validaScambio } from '@/lib/mercato/scambio';
import {
  costruisciRichiesta, fuoriDallaRosa, generaScambio, giocatoriBloccati,
  ricontrollaScambio, type SceltaScambio,
} from '@/lib/mercato/scambioServer';
import { annullaScambio, applicaScambio, salvaScambio } from '@/lib/mercato/applicaScambio';
import { annota, chiAgisce } from '@/lib/registroServer';

export type MsgState = {
  ok: boolean; message: string; body?: string;
  tradeId?: string; rilievi?: string[]; firma?: string;
} | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { id: m.team_id, league_id: m.league_id, userId: auth.user.id } : null;
}

/**
 * Lo scambio che tocca davvero le rose: l'unico controllo di autorizzazione
 * che esista.
 *
 * `fn_applica_scambio` e `fn_annulla_scambio` sono `security definer` e non
 * guardano chi le chiama — le invochiamo con la service role key, dove
 * `auth.uid()` è null e `is_admin()` sarebbe sempre falso, quindi le RLS di
 * 0018 non entrano mai in gioco. Fuori da qui la loro unica protezione è la
 * revoca dell'EXECUTE ad `anon` e `authenticated`: tiene fuori i client, ma
 * non dice niente su *quale* scambio questo server può muovere.
 *
 * Due controlli, e vanno fatti tutti e due prima dell'RPC:
 *  1. chi ha premuto il bottone è admin (`requireAdmin`);
 *  2. quello scambio è della sua lega. Senza il secondo, l'id arriva da un
 *     campo nascosto del form: basterebbe sostituirlo con l'id di un altro
 *     per annullare lo scambio di un'altra lega.
 *
 * Restituisce l'id riletto dal database, non quello del form, così chiamare
 * l'RPC senza essere passati da qui non è una dimenticanza possibile.
 */
async function scambioDellaLega(tradeId: string, leagueId: string): Promise<string | null> {
  if (!tradeId) return null;
  // un id malformato non è un caso a parte: Postgres protesta, `data` resta
  // null e la risposta è la stessa di uno scambio che non c'è
  const { data } = await supabaseAdmin()
    .from('trades').select('id, league_id').eq('id', tradeId).maybeSingle();
  if (!data || data.league_id !== leagueId) return null;
  return data.id as string;
}

/** Scrive l'annuncio e lo salva come scambio non ancora registrato. */
export async function scriviScambio(_prev: MsgState, form: FormData): Promise<MsgState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const ids = (k: string) => form.getAll(k).map(String).filter(Boolean);
  const scelta: SceltaScambio = {
    fromTeamId: String(form.get('fromTeam') ?? ''),
    toTeamId: String(form.get('toTeam') ?? ''),
    fromPlayerIds: ids('fromPlayers'),
    toPlayerIds: ids('toPlayers'),
    conguaglio: String(form.get('settlement') ?? '') === '' ? 0 : Number(form.get('settlement')),
    chiPaga: form.get('settlementPayer') === 'to' ? 'to' : 'from',
    note: String(form.get('note') ?? '').trim(),
  };
  if (scelta.fromTeamId === scelta.toTeamId) {
    return { ok: false, message: 'Le due squadre devono essere diverse.' };
  }

  // Il controllo di lega, per il primo tempo: `costruisciRichiesta` pesca le
  // due squadre fra quelle della lega dell'admin — se un id viene da fuori,
  // protesta — e tiene solo i giocatori che sono davvero nelle loro rose,
  // quindi anche un player_id altrui cade qui e non finisce nel registro.
  // Il rifiuto va detto, non fatto esplodere: senza il try, la server action
  // restituirebbe l'errore generico di Next e l'admin leggerebbe «qualcosa è
  // andato storto» al posto del motivo.
  let r;
  try {
    r = await costruisciRichiesta(team.league_id, scelta);
  } catch {
    return { ok: false, message: 'Una delle due squadre non è della tua lega.' };
  }
  // L'invariante che la firma da sola non regge: `costruisciRichiesta` scarta
  // in silenzio i playerId che non sono più nella rosa di partenza, e la firma
  // si calcola sulla scelta grezza. Se uno cade, il registro conterrebbe meno
  // giocatori di quelli a schermo, le due firme combacerebbero comunque e
  // l'anteprima prometterebbe un giocatore che non si muoverà. Meglio
  // rifiutare dicendo chi è caduto: rose stantie si ricaricano, un registro
  // sbagliato si scopre tre settimane dopo.
  const mancanti = await fuoriDallaRosa(scelta, r);
  if (mancanti.length) {
    return {
      ok: false,
      message: mancanti.length === 1
        ? `${mancanti[0]} non è più nella rosa di partenza: ricarica la pagina e ricomponi lo scambio.`
        : `Questi giocatori non sono più nella rosa di partenza: ${mancanti.join(', ')}. `
          + 'Ricarica la pagina e ricomponi lo scambio.',
    };
  }

  const bloccati = await giocatoriBloccati(team.league_id);
  const rilievi = validaScambio(r, bloccati);
  const errori = rilievi.filter((x) => x.gravita === 'errore');
  if (errori.length) return { ok: false, message: errori.map((x) => x.testo).join(' ') };

  const esito = await generaScambio(r);
  const tradeId = await salvaScambio(team.league_id, scelta, r, esito.testo, esito.provider);

  // Su Telegram come ogni altro messaggio del centro: l'admin ha l'annuncio
  // sul telefono senza dover aprire l'app. Non è bloccante — `notifyAdminPlain`
  // torna con il motivo invece di alzare un'eccezione, e lo scambio è già
  // scritto: perderlo perché un bot è giù sarebbe assurdo. L'esito lo dice.
  const tg = await archiveMessage('trade', null, esito.testo);
  const coda = tg.sent
    ? ' Copia mandata su Telegram.'
    : tg.reason && tg.reason !== 'Telegram non configurato'
      ? ` Su Telegram non è arrivato: ${tg.reason}`
      : '';

  revalidatePath('/admin/messaggi');
  return {
    ok: true,
    tradeId,
    body: esito.testo,
    // I motivi dello scarto arrivano a schermo insieme agli avvisi: erano
    // calcolati e buttati, e senza di loro l'admin rigenera alla cieca.
    rilievi: [...rilievi.map((x) => x.testo), ...esito.problemi],
    firma: firmaScelta(scelta),
    // Due ripieghi, due frasi. Dire «il modello non ha risposto» quando ha
    // risposto ed è stata la verifica a bocciarlo è una bugia che manda
    // l'admin a cercare il problema dalla parte sbagliata.
    message: (esito.provider === 'template'
      ? esito.muto
        ? 'Pezzo di ripiego: il modello non ha risposto, le note non sono state considerate. Rigenera prima di mandarlo.'
        : 'Pezzo di ripiego: il modello ha risposto ma la verifica ha bocciato il pezzo, quindi il giudizio e le note non ci sono. Qui sotto il motivo; rigenera prima di mandarlo.'
      : 'Annuncio pronto. Non ho ancora toccato rose né crediti.') + coda,
  };
}

/** Il secondo tempo: qui le rose si muovono per davvero. */
/**
 * La riga di registro di uno scambio.
 *
 * Il fatto è delle due squadre, non di chi ha premuto il bottone: nel
 * registro si leggerà «Scambio fra Pirati e Qarabaggio: …», e l'admin resta
 * scritto come attore perché è lui che l'ha registrato.
 *
 * I nomi dei giocatori si leggono dopo, da `trade_items`: sono la verità di
 * cosa si è mosso, mentre la selezione del form può essere di ore prima.
 */
async function annotaScambio(
  tradeId: string, azione: 'scambio' | 'scambio_disfatto', userId: string,
): Promise<void> {
  const db = supabaseAdmin();
  const { data: t } = await db.from('trades')
    .select(`id, league_id, from_team_id, to_team_id, settlement, settlement_payer, note,
             casa:from_team_id(name), ospite:to_team_id(name)`)
    .eq('id', tradeId).maybeSingle();
  if (!t) return;

  const riga = t as unknown as {
    league_id: string; from_team_id: string; to_team_id: string;
    settlement: number; settlement_payer: string | null; note: string | null;
    casa: { name: string } | null; ospite: { name: string } | null;
  };

  const { data: items } = await db.from('trade_items')
    .select('player_id, from_team_id, players(name)').eq('trade_id', tradeId);
  type Item = { player_id: string; from_team_id: string; players: { name: string } | null };
  const pezzi = (items ?? []) as unknown as Item[];
  const nomi = (teamId: string) => pezzi
    .filter((i) => i.from_team_id === teamId)
    .map((i) => i.players?.name)
    .filter((x): x is string => Boolean(x));

  const paga = riga.settlement_payer === 'from' ? riga.casa?.name
    : riga.settlement_payer === 'to' ? riga.ospite?.name : null;

  await annota({
    leagueId: riga.league_id, azione, attore: await chiAgisce(userId),
    dati: {
      squadraA: riga.casa?.name ?? null,
      squadraB: riga.ospite?.name ?? null,
      da: nomi(riga.from_team_id),
      a: nomi(riga.to_team_id),
      ...(riga.settlement ? { conguaglio: riga.settlement, paga } : {}),
      ...(riga.note ? { nota: riga.note } : {}),
    },
  });
}

export async function confermaScambio(_prev: MsgState, form: FormData): Promise<MsgState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const tradeId = await scambioDellaLega(String(form.get('tradeId') ?? ''), team.league_id);
  if (!tradeId) return { ok: false, message: 'Questo scambio non esiste, o non è della tua lega.' };

  // I controlli bloccanti si rifanno qui, e non si danno per fatti nel primo
  // tempo: fra «Scrivi» e «Conferma» passano ore o giorni, e in quella
  // finestra l'impegno d'asta nasce. Si parte dai `trade_items` salvati e non
  // dalla selezione del form, che dopo un ricarico non c'è più.
  //
  // Il «nel frattempo» sta nei motivi, non in una premessa: è lì che si sa di
  // *cosa* è cambiato, e una premessa generica davanti a «questo scambio è già
  // registrato» suonerebbe finta.
  const motivi = await ricontrollaScambio(team.league_id, tradeId);
  if (motivi.length) {
    return { ok: false, message: `Non registrato. ${motivi.join(' ')}` };
  }

  const esito = await applicaScambio(tradeId);
  if (esito.ok) await annotaScambio(tradeId, 'scambio', team.userId);
  revalidatePath('/admin/messaggi');
  revalidatePath('/admin/rose');
  return esito.ok
    ? { ok: true, message: 'Scambio registrato: rose e crediti aggiornati.' }
    : { ok: false, message: `Non registrato: ${esito.errore}` };
}

/** E il ritorno, per quando ci si accorge dopo che era sbagliato. */
export async function disfaScambio(_prev: MsgState, form: FormData): Promise<MsgState> {
  const team = await requireAdmin();
  if (!team) return { ok: false, message: 'Serve essere admin.' };

  const tradeId = await scambioDellaLega(String(form.get('tradeId') ?? ''), team.league_id);
  if (!tradeId) return { ok: false, message: 'Questo scambio non esiste, o non è della tua lega.' };

  const esito = await annullaScambio(tradeId);
  if (esito.ok) await annotaScambio(tradeId, 'scambio_disfatto', team.userId);
  revalidatePath('/admin/messaggi');
  revalidatePath('/admin/rose');
  return esito.ok
    ? { ok: true, message: 'Scambio annullato: tutto com\'era.' }
    : { ok: false, message: `Non annullato: ${esito.errore}` };
}
