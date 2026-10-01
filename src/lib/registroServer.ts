import 'server-only';
import { supabaseAdmin } from './supabase';
import { AZIONI_ADMIN, type Azione } from './registro';

/**
 * Scrivere nel registro.
 *
 * Una funzione sola, chiamata dai punti dove le cose avvengono davvero. Le
 * frasi non si scrivono qui: nel database va il fatto, e la frase la compone
 * `rigaDelRegistro` in lettura.
 *
 * `da_admin` non si passa: si deduce dall'azione. Un posto in meno dove
 * sbagliarsi, e due righe della stessa azione non possono finire una da un
 * lato e una dall'altro.
 */
export interface DaAnnotare {
  leagueId: string;
  azione: Azione;
  /** chi ha agito: la persona, la squadra per cui agiva, e come si chiamava */
  attore?: { userId?: string | null; teamId?: string | null; nome?: string | null };
  playerId?: string | null;
  sessionId?: string | null;
  lotId?: string | null;
  dati?: Record<string, unknown>;
  /** quando è avvenuta, se non è adesso: lo usa il travaso dello storico */
  avvenutoIl?: string;
  /** impronta dell'evento, per non travasare due volte la stessa cosa */
  impronta?: string;
  /**
   * Con l'impronta: se la riga c'è già, la aggiorna invece di lasciarla come
   * sta. Serve per i fatti che si possono rifare — la schedina si cambia
   * finché la giornata è aperta, e nel registro deve restare una riga sola,
   * quella vera.
   */
  aggiorna?: boolean;
}

/**
 * Annota un'azione. **Non solleva mai.**
 *
 * Il registro racconta quello che è successo: se la riga non si scrive, il
 * fatto è successo comunque e l'operazione dell'allenatore non deve fallire
 * per colpa del racconto. Un errore qui finisce nei log del server, non in
 * faccia a chi stava chiamando un giocatore.
 */
export async function annota(v: DaAnnotare): Promise<void> {
  try {
    const db = supabaseAdmin();
    const riga = {
      league_id: v.leagueId,
      azione: v.azione,
      attore_user: v.attore?.userId ?? null,
      attore_team: v.attore?.teamId ?? null,
      attore_nome: v.attore?.nome ?? null,
      da_admin: AZIONI_ADMIN.includes(v.azione),
      player_id: v.playerId ?? null,
      session_id: v.sessionId ?? null,
      lot_id: v.lotId ?? null,
      dati: v.dati ?? {},
      ...(v.avvenutoIl ? { avvenuto_il: v.avvenutoIl } : {}),
      ...(v.impronta ? { impronta: v.impronta } : {}),
    };

    // un fatto che si può rifare: una riga sola, aggiornata
    if (v.impronta && v.aggiorna) {
      const { data: esiste } = await db.from('registro')
        .update({ ...riga, avvenuto_il: v.avvenutoIl ?? new Date().toISOString() })
        .eq('impronta', v.impronta).select('id');
      if (esiste && esiste.length > 0) return;
    }

    const { error } = await db.from('registro').insert(riga);
    // 23505 = chiave duplicata: è il travaso che ripassa su una riga già
    // scritta, ed è esattamente quello che l'impronta deve ottenere
    if (error && error.code !== '23505') {
      console.error('registro: riga non scritta', v.azione, error.message);
    }
  } catch (e) {
    console.error('registro: riga non scritta', v.azione, (e as Error).message);
  }
}

/**
 * Toglie una riga dal registro.
 *
 * L'unico caso in cui il registro torna indietro: il fatto stesso è stato
 * ritirato. Una schedina svuotata non è una schedina giocata, e lasciare la
 * riga vorrebbe dire raccontare una cosa che non c'è più.
 */
export async function dimentica(impronta: string): Promise<void> {
  try {
    const db = supabaseAdmin();
    await db.from('registro').delete().eq('impronta', impronta);
  } catch (e) {
    console.error('registro: riga non rimossa', impronta, (e as Error).message);
  }
}

/**
 * Chi sta agendo, a partire dal suo utente: la squadra e il nome da
 * fotografare nella riga.
 *
 * Serve nei punti dove il codice ha l'utente ma non la squadra — le azioni
 * dell'admin sulle rose, sui crediti, sugli scambi. Il nome che si vedrà nel
 * registro resta comunque l'username risolto in lettura: questo è solo lo
 * scatto per quando quella persona non ci sarà più.
 */
export async function chiAgisce(userId: string): Promise<{
  userId: string; teamId: string | null; nome: string | null; leagueId: string | null;
}> {
  try {
    const db = supabaseAdmin();
    const { data } = await db.from('team_members')
      .select('league_id, username, email, teams(id, name)')
      .eq('user_id', userId).maybeSingle();
    const j = data as unknown as {
      league_id: string; username: string | null; email: string | null;
      teams: { id: string; name: string } | null;
    } | null;
    return {
      userId,
      teamId: j?.teams?.id ?? null,
      nome: j?.username ?? j?.teams?.name ?? j?.email ?? null,
      leagueId: j?.league_id ?? null,
    };
  } catch {
    return { userId, teamId: null, nome: null, leagueId: null };
  }
}

/** Più righe in un colpo, per il travaso dello storico. */
export async function annotaTutte(voci: DaAnnotare[]): Promise<number> {
  let scritte = 0;
  for (const v of voci) {
    await annota(v);
    scritte += 1;
  }
  return scritte;
}
