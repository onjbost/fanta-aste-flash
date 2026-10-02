import 'server-only';

/**
 * Il nostro calendario di Serie A, tenuto allineato col live di fantacalcio.it.
 *
 * `serie_a_fixtures` e le date delle giornate vengono dall'import dei
 * calendari d'estate: date stimate, e nessuna notizia di anticipi, posticipi
 * e rinvii. Il live invece ha il calendario di adesso. Ogni volta che lo si
 * legge (la diretta, il cron, l'import della giornata) il nostro si aggiorna:
 * orari, partite giocate, rinvii, e il calcio d'inizio della giornata, da cui
 * il database ricava la chiusura delle schedine.
 *
 * Il live comanda sui fatti (quando si gioca, se è rinviata); la scelta su
 * una partita rinviata — 6 politico o si aspetta il recupero — resta
 * all'admin, e quando un rinvio compare o sparisce glielo si dice.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { stessoClub } from '@/lib/fonti/pagine';
import { notifyAdminPlain } from '@/lib/telegram';
import { dataRoma } from '@/lib/leghe/quando';
import type { PartitaLive } from './protobuf';

/** Una giornata si riallinea al massimo una volta ogni quindici minuti. */
const OGNI_MS = 15 * 60_000;
const ultimaVolta = new Map<number, number>();

type Stato = 'scheduled' | 'postponed' | 'played';

function statoDaLive(p: PartitaLive): Stato {
  if (p.status === 6) return 'postponed';
  if (p.status === 4) return 'played';
  return 'scheduled';
}

export interface Allineamento {
  aggiornate: number;
  aggiunte: number;
  /** «Inter – Milan rinviata», «… di nuovo in programma il …» */
  rinvii: string[];
}

export async function allineaCalendario(serieA: number, partite: PartitaLive[], forza = false): Promise<Allineamento | null> {
  if (!partite.length) return null;
  if (!forza && Date.now() - (ultimaVolta.get(serieA) ?? 0) < OGNI_MS) return null;
  ultimaVolta.set(serieA, Date.now());

  const db = supabaseAdmin();
  const { data: md } = await db.from('matchdays')
    .select('id, status, first_kickoff_at, match_date').eq('serie_a', serieA).limit(1).maybeSingle();
  if (!md) return null;

  const [{ data: nostre }, { data: club }] = await Promise.all([
    db.from('serie_a_fixtures').select('id, home_club, away_club, kickoff_at, status, policy').eq('matchday_id', md.id),
    db.from('players').select('club').limit(2000),
  ]);
  const vocabolario = [...new Set((club ?? []).map((c) => String(c.club)))];
  const nostroNome = (fonte: string) => vocabolario.find((c) => stessoClub(c, fonte)) ?? fonte;

  const esito: Allineamento = { aggiornate: 0, aggiunte: 0, rinvii: [] };
  const adesso = new Date().toISOString();

  for (const p of partite) {
    const kickoff = p.matchDate ? new Date(p.matchDate).toISOString() : null;
    const stato = statoDaLive(p);
    const riga = (nostre ?? []).find((r) => stessoClub(String(r.home_club), p.teamHome) && stessoClub(String(r.away_club), p.teamAway));
    const nome = `${p.teamHome} – ${p.teamAway}`;

    if (!riga) {
      const { error } = await db.from('serie_a_fixtures').insert({
        matchday_id: md.id, home_club: nostroNome(p.teamHome), away_club: nostroNome(p.teamAway),
        kickoff_at: kickoff, status: stato, policy: null, updated_at: adesso,
      });
      if (!error) esito.aggiunte++;
      continue;
    }

    const cambiaOra = kickoff && (!riga.kickoff_at || Date.parse(riga.kickoff_at as string) !== Date.parse(kickoff));
    if (!cambiaOra && riga.status === stato) continue;

    if (stato === 'postponed' && riga.status !== 'postponed') esito.rinvii.push(`${nome} rinviata`);
    if (stato !== 'postponed' && riga.status === 'postponed') {
      esito.rinvii.push(`${nome} di nuovo in programma${kickoff ? ` il ${new Date(kickoff).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}`);
    }
    const { error } = await db.from('serie_a_fixtures').update({
      kickoff_at: kickoff ?? riga.kickoff_at,
      status: stato,
      // la scelta sul rinvio è dell'admin: si tiene finché resta rinviata
      policy: stato === 'postponed' ? riga.policy : null,
      updated_at: adesso,
    }).eq('id', riga.id);
    if (!error) esito.aggiornate++;
  }

  /*
   * Il calcio d'inizio della giornata: la prima partita non rinviata. Da qui
   * il database ricalcola la chiusura delle schedine, quindi lo si tocca solo
   * finché le schedine non sono chiuse — dopo, cambiarlo non serve e
   * confonderebbe lo storico.
   */
  const inizi = partite.filter((p) => p.status !== 6 && p.matchDate).map((p) => p.matchDate);
  if (inizi.length && (md.status === 'scheduled' || md.status === 'open')) {
    const prima = Math.min(...inizi);
    if (Date.parse(md.first_kickoff_at as string) !== prima) {
      await db.from('matchdays').update({
        first_kickoff_at: new Date(prima).toISOString(),
        match_date: dataRoma(prima),
      }).eq('id', md.id);
      esito.aggiornate++;
    }
  }

  if (esito.rinvii.length) {
    await notifyAdminPlain(
      `📅 Serie A, ${serieA}ª giornata:\n${esito.rinvii.join('\n')}\n`
      + 'Decidi in /admin/schedine se vale il 6 politico o si aspetta il recupero, poi rigenera le quote.',
    );
  }
  return esito;
}
