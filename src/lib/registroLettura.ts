import 'server-only';
import { supabaseAdmin } from './supabase';
import { nomeAttore, type Azione, type VoceDelRegistro } from './registro';

/**
 * Leggere il registro: una query con i filtri, e i nomi risolti adesso.
 *
 * I nomi si risolvono in lettura e non si prendono dalla riga: chi cambia
 * username lo vede cambiato in tutto il registro, anche nelle azioni di mesi
 * prima. `attore_nome` resta la ricaduta per chi non è più collegato alla
 * lega, e per le righe travasate dallo storico, dove il database sa quale
 * squadra ha agito ma non quale dei due allenatori.
 */

export interface FiltriRegistro {
  azione?: Azione | 'tutte';
  /** ISO, inclusivo */
  da?: string;
  /** ISO, inclusivo: si legge come «fino a tutto quel giorno» */
  a?: string;
  playerId?: string;
  /** `userId:teamId`, come lo manda il menù degli allenatori */
  allenatore?: string;
  pagina?: number;
}

export const PER_PAGINA = 60;

export interface PaginaDelRegistro {
  voci: VoceDelRegistro[];
  pagina: number;
  altre: boolean;
}

/**
 * Le voci che passano i filtri, dalla più recente.
 *
 * La lettura passa dal service role e filtra per lega a mano: la policy di
 * sola lettura esiste comunque sulla tabella, ma qui serve anche risolvere i
 * nomi degli allenatori, e `team_members` non è leggibile riga per riga da
 * chiunque con la stessa comodità.
 */
export async function pagineDelRegistro(
  leagueId: string, f: FiltriRegistro = {},
): Promise<PaginaDelRegistro> {
  const db = supabaseAdmin();
  const pagina = Math.max(1, f.pagina ?? 1);
  const da = (pagina - 1) * PER_PAGINA;

  let q = db.from('registro')
    .select(`id, avvenuto_il, azione, attore_user, attore_team, attore_nome, da_admin,
             dati, players(name), teams:attore_team(name)`)
    .eq('league_id', leagueId)
    .order('avvenuto_il', { ascending: false })
    .order('id', { ascending: false })
    // una riga in più del necessario: è così che si sa se ce ne sono altre,
    // senza una seconda query che conta tutto
    .range(da, da + PER_PAGINA);

  if (f.azione && f.azione !== 'tutte') q = q.eq('azione', f.azione);
  if (f.da) q = q.gte('avvenuto_il', f.da);
  if (f.a) q = q.lte('avvenuto_il', fineDelGiorno(f.a));
  if (f.playerId) q = q.eq('player_id', f.playerId);
  if (f.allenatore) {
    const [userId, teamId] = f.allenatore.split(':');
    /*
     * Un allenatore è la persona, ma le righe travasate dallo storico hanno
     * solo la squadra: filtrando sulla sola persona, la prima asta sparirebbe
     * dal filtro di chi l'ha giocata. Quindi: le sue azioni, più quelle della
     * sua squadra senza persona.
     */
    q = q.or(`attore_user.eq.${userId},and(attore_user.is.null,attore_team.eq.${teamId})`);
  }

  const { data, error } = await q;
  if (error) return { voci: [], pagina, altre: false };

  type Riga = {
    id: number; avvenuto_il: string; azione: Azione;
    attore_user: string | null; attore_team: string | null; attore_nome: string | null;
    da_admin: boolean; dati: Record<string, unknown> | null;
    players: { name: string } | null;
    teams: { name: string } | null;
  };
  const righe = (data ?? []) as unknown as Riga[];
  const altre = righe.length > PER_PAGINA;
  const visibili = altre ? righe.slice(0, PER_PAGINA) : righe;

  const nomi = await nomiDegliAllenatori(leagueId);

  const voci: VoceDelRegistro[] = visibili.map((r) => {
    const persona = r.attore_user ? nomi.get(r.attore_user) : undefined;
    return {
      id: r.id,
      avvenutoIl: r.avvenuto_il,
      azione: r.azione,
      attore: {
        nome: nomeAttore({
          username: persona?.username ?? null,
          email: persona?.email ?? null,
          nomeSalvato: r.attore_nome ?? r.teams?.name ?? null,
        }),
        squadra: r.teams?.name ?? persona?.squadra ?? null,
      },
      daAdmin: r.da_admin,
      // il nome del giocatore viene dal collegamento quando c'è; per le righe
      // travasate dall'audit log, dove c'era solo il nome scritto, vale quello
      giocatore: r.players?.name ?? (typeof r.dati?.giocatore === 'string' ? r.dati.giocatore : null),
      dati: r.dati ?? {},
    };
  });

  return { voci, pagina, altre };
}

/** Fine del giorno indicato, nell'ora di Roma: «fino a tutto il 3 ottobre». */
function fineDelGiorno(giorno: string): string {
  // il filtro arriva come 2026-10-03 da un campo data: la fine di quel giorno
  // a Roma è l'inizio del giorno dopo meno un istante, e per un `lte` basta
  // prendere le 23:59:59 locali — l'ora legale la risolve il database, che
  // confronta istanti
  return `${giorno}T23:59:59.999+02:00`;
}

export interface Allenatore {
  userId: string;
  teamId: string | null;
  username: string | null;
  email: string | null;
  squadra: string | null;
  /** come compare nel menù: «Mattia — FC Joga Benito» */
  etichetta: string;
}

/** Gli allenatori della lega, per il menù dei filtri e per risolvere i nomi. */
export async function allenatoriDellaLega(leagueId: string): Promise<Allenatore[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('team_members')
    .select('user_id, username, email, teams(id, name)')
    .eq('league_id', leagueId);

  type Riga = {
    user_id: string; username: string | null; email: string | null;
    teams: { id: string; name: string } | null;
  };
  return ((data ?? []) as unknown as Riga[])
    .map((m) => {
      const nome = nomeAttore({ username: m.username, email: m.email });
      return {
        userId: m.user_id,
        teamId: m.teams?.id ?? null,
        username: m.username,
        email: m.email,
        squadra: m.teams?.name ?? null,
        etichetta: m.teams?.name && m.teams.name !== nome ? `${nome} — ${m.teams.name}` : nome,
      };
    })
    .sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));
}

async function nomiDegliAllenatori(leagueId: string) {
  const elenco = await allenatoriDellaLega(leagueId);
  return new Map(elenco.map((a) => [a.userId, a]));
}

/**
 * I giocatori che compaiono nel registro, per il menù del filtro.
 *
 * Solo quelli: l'elenco completo del listone sono settecento nomi, e in un
 * menù di filtro servirebbe a far scorrere il dito per niente.
 */
export async function giocatoriNelRegistro(
  leagueId: string,
): Promise<{ id: string; nome: string }[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('registro')
    .select('player_id, players(name)')
    .eq('league_id', leagueId).not('player_id', 'is', null);

  type Riga = { player_id: string; players: { name: string } | null };
  const visti = new Map<string, string>();
  for (const r of (data ?? []) as unknown as Riga[]) {
    if (r.players?.name) visti.set(r.player_id, r.players.name);
  }
  return [...visti.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}
