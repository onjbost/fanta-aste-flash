import 'server-only';
import { supabaseAdmin } from './supabase';
import type { Role } from './rules';

/**
 * L'archivio delle aste chiuse: il tabellone finale di una serata.
 *
 * Non è il registro, ed è una cosa diversa di proposito. Il registro è il
 * flusso di quello che è accaduto, in ordine di tempo; qui si guarda una
 * serata tutta insieme — chi ha chiamato cosa, chi se l'è contesa, come è
 * finita. I dati non sono copiati da nessuna parte: si leggono dai lotti,
 * dalle partecipazioni e dai contratti, cioè dalla verità.
 *
 * Tutto quello che c'è dentro è pubblico: una sessione chiusa ha avuto la sua
 * sala aperta, e lì svincolandi e budget sono stati svelati a tutti.
 */

export interface AstaInElenco {
  id: string;
  numero: number;
  quando: string;
  assegnati: number;
  annullati: number;
  /** crediti spesi in tutto nella serata */
  speso: number;
}

export interface LottoDellArchivio {
  id: string;
  indice: number;
  giocatore: { nome: string; ruolo: Role; club: string };
  chiamante: string;
  contendenti: { squadra: string; svincolando: string | null }[];
  vincitore: string | null;
  prezzo: number | null;
  uscito: { nome: string; rimborso: number | null } | null;
  annullato: boolean;
  senzaContendenti: boolean;
}

export interface AstaDellArchivio extends AstaInElenco {
  lotti: LottoDellArchivio[];
}

/** Le aste chiuse, dalla più recente. */
export async function asteChiuse(leagueId: string): Promise<AstaInElenco[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('auction_sessions')
    .select('id, number, auction_at, room_opened_at, lots(status, final_price)')
    .eq('league_id', leagueId).eq('status', 'closed')
    .order('number', { ascending: false });

  type Riga = {
    id: string; number: number; auction_at: string; room_opened_at: string | null;
    lots: { status: string; final_price: number | null }[] | null;
  };
  return ((data ?? []) as unknown as Riga[]).map((s) => {
    const lotti = s.lots ?? [];
    return {
      id: s.id,
      numero: s.number,
      // quando si è giocata davvero, non quando era in calendario: la prima
      // asta è stata battuta la mattina, non alle 21:30 dell'invito
      quando: s.room_opened_at ?? s.auction_at,
      assegnati: lotti.filter((l) => l.status === 'assigned').length,
      annullati: lotti.filter((l) => l.status === 'cancelled').length,
      speso: lotti.reduce((t, l) => t + (l.status === 'assigned' ? l.final_price ?? 0 : 0), 0),
    };
  });
}

/** Il tabellone di una serata. */
export async function astaDellArchivio(sessionId: string): Promise<AstaDellArchivio | null> {
  const db = supabaseAdmin();
  const { data: s } = await db.from('auction_sessions')
    .select('id, number, auction_at, room_opened_at, status, league_id')
    .eq('id', sessionId).maybeSingle();
  if (!s) return null;

  const { data: lotRows } = await db.from('lots')
    .select(`id, order_index, status, final_price, player_id, winner_team_id,
             players(name, role, club),
             chiamante:caller_team_id(name), vincitore:winner_team_id(name)`)
    .eq('session_id', sessionId).order('order_index');

  type LotRow = {
    id: string; order_index: number; status: string; final_price: number | null;
    player_id: string; winner_team_id: string | null;
    players: { name: string; role: Role; club: string } | null;
    chiamante: { name: string } | null;
    vincitore: { name: string } | null;
  };
  const lots = (lotRows ?? []) as unknown as LotRow[];

  const { data: partRows } = await db.from('lot_participants')
    .select('lot_id, team_id, release_player_id, status, withdrawn, teams(name), players(name)')
    .eq('session_id', sessionId).neq('status', 'cancelled');

  type PartRow = {
    lot_id: string; team_id: string; release_player_id: string;
    status: string; withdrawn: boolean;
    teams: { name: string } | null; players: { name: string } | null;
  };
  const parts = (partRows ?? []) as unknown as PartRow[];

  // i rimborsi veri, dai contratti chiusi in questa sessione
  const { data: contratti } = await db.from('contracts')
    .select('team_id, player_id, release_value')
    .eq('session_id', sessionId).not('released_at', 'is', null);
  const rimborso = new Map(
    (contratti ?? []).map((c) => [`${c.team_id}:${c.player_id}`, c.release_value as number | null]),
  );

  const lotti: LottoDellArchivio[] = lots.map((l) => {
    const suoi = parts.filter((p) => p.lot_id === l.id && !p.withdrawn);
    const vinc = suoi.find((p) => p.team_id === l.winner_team_id);
    const usc = vinc?.players?.name ?? null;
    return {
      id: l.id,
      indice: l.order_index,
      giocatore: {
        nome: l.players?.name ?? '?',
        ruolo: (l.players?.role ?? 'D') as Role,
        club: l.players?.club ?? '',
      },
      chiamante: l.chiamante?.name ?? '—',
      contendenti: suoi.map((p) => ({
        squadra: p.teams?.name ?? '?',
        svincolando: p.players?.name ?? null,
      })),
      vincitore: l.vincitore?.name ?? null,
      prezzo: l.final_price,
      uscito: usc && vinc
        ? { nome: usc, rimborso: rimborso.get(`${vinc.team_id}:${vinc.release_player_id}`) ?? null }
        : null,
      annullato: l.status === 'cancelled',
      senzaContendenti: suoi.length === 1,
    };
  });

  return {
    id: s.id,
    numero: s.number as number,
    quando: (s.room_opened_at as string) ?? (s.auction_at as string),
    assegnati: lotti.filter((l) => l.vincitore).length,
    annullati: lotti.filter((l) => l.annullato).length,
    speso: lotti.reduce((t, l) => t + (l.vincitore ? l.prezzo ?? 0 : 0), 0),
    lotti,
  };
}
