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
import { dataRoma, giornoDopo, type PartitaDalLive } from '@/lib/leghe/quando';
import { scarica } from '@/lib/fonti/fontiServer';
import { leggiCalendario, riassumi } from '@/lib/fonti/calendario';

/** Una giornata si riallinea al massimo una volta ogni quindici minuti. */
const OGNI_MS = 15 * 60_000;
const ultimaVolta = new Map<number, number>();

type Stato = 'scheduled' | 'postponed' | 'played';

function statoDaLive(p: PartitaDalLive): Stato {
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

/**
 * Allinea una giornata. Le partite vengono dal live o dalla pagina del
 * calendario (`aggiornaCalendarioDallaPagina`): stessa forma, stessi stati.
 */
export async function allineaCalendario(serieA: number, partite: PartitaDalLive[], forza = false): Promise<Allineamento | null> {
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
    let stato = statoDaLive(p);
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

    // una partita giocata non torna «da giocare» perché una fonte è indietro
    if (riga.status === 'played' && stato === 'scheduled') stato = 'played';
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

// =====================================================================
// dalla pagina del calendario
// =====================================================================

const PAGINA_CALENDARIO = 'https://www.fantacalcio.it/serie-a/calendario';

export interface GiornataDallaPagina {
  serieA: number;
  /** «Frosinone–Sassuolo», ISO */
  prima: { nome: string; kickoff: string } | null;
  /** l'ultima partita, quando dovrebbe finire e il giorno in cui si calcola */
  ultima: { nome: string; kickoff: string; fine: string; calcolo: string } | null;
  /** chiusura delle schedine dopo l'aggiornamento, ISO */
  chiusura: string | null;
  rinviate: string[];
  senzaOrario: string[];
  esito: Allineamento | null;
  errore?: string;
}

/**
 * Le giornate da tenere allineate: le prime due non ancora chiuse. Di
 * mercoledì, con la giornata appena giocata già importata, sono la prossima
 * e quella dopo: così anche un turno infrasettimanale ha già i suoi orari.
 */
async function giornateAperte(): Promise<number[]> {
  const { data } = await supabaseAdmin().from('matchdays')
    .select('serie_a').neq('status', 'settled').order('serie_a').limit(2);
  return (data ?? []).map((m) => Number(m.serie_a));
}

/**
 * Legge da fantacalcio.it il calendario delle giornate che vengono (o di
 * quelle indicate) e lo scrive: orari di ogni partita, rinvii, e la prima
 * partita della giornata, da cui il database ricava la chiusura di schedine
 * e formazioni. L'ultima partita decide il giorno del calcolo, che il cron
 * legge dallo stesso calendario.
 */
export async function aggiornaCalendarioDallaPagina(giornate?: number[]): Promise<GiornataDallaPagina[]> {
  const elenco = giornate?.length ? giornate : await giornateAperte();
  const db = supabaseAdmin();
  const esiti: GiornataDallaPagina[] = [];

  for (const serieA of elenco) {
    const vuota: GiornataDallaPagina = {
      serieA, prima: null, ultima: null, chiusura: null, rinviate: [], senzaOrario: [], esito: null,
    };
    const pagina = await scarica(`${PAGINA_CALENDARIO}/${serieA}`);
    if ('errore' in pagina) { esiti.push({ ...vuota, errore: pagina.errore }); continue; }
    const partite = leggiCalendario(pagina.html, serieA);
    if (!partite.length) {
      esiti.push({ ...vuota, errore: `nella pagina della ${serieA}ª giornata non ho trovato partite: è cambiata?` });
      continue;
    }

    const esito = await allineaCalendario(serieA, partite, true);
    const r = riassumi(partite);
    const { data: md } = await db.from('matchdays').select('lock_at').eq('serie_a', serieA).limit(1).maybeSingle();
    esiti.push({
      serieA,
      prima: r.prima && { nome: r.prima.nome, kickoff: new Date(r.prima.kickoff).toISOString() },
      ultima: r.ultima && {
        nome: r.ultima.nome,
        kickoff: new Date(r.ultima.kickoff).toISOString(),
        fine: new Date(r.ultima.fine).toISOString(),
        calcolo: giornoDopo(dataRoma(r.ultima.kickoff)),
      },
      chiusura: (md?.lock_at as string | undefined) ?? null,
      rinviate: r.rinviate,
      senzaOrario: r.senzaOrario,
      esito,
    });
  }
  return esiti;
}

/** Una riga per giornata, per Telegram e per il Pannello. */
export function descriviGiornata(g: GiornataDallaPagina): string {
  if (g.errore) return `${g.serieA}ª giornata: ${g.errore}`;
  const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const giorno = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long',
  });
  const pezzi = [
    g.prima ? `apre ${quando(g.prima.kickoff)} con ${g.prima.nome}` : 'prima partita senza orario',
    g.chiusura ? `schedine chiuse ${quando(g.chiusura)}` : null,
    g.ultima ? `ultima ${g.ultima.nome} ${quando(g.ultima.kickoff)}, calcolo ${giorno(g.ultima.calcolo)}` : null,
    g.rinviate.length ? `rinviate: ${g.rinviate.join(', ')}` : null,
    g.senzaOrario.length ? `senza orario: ${g.senzaOrario.join(', ')}` : null,
  ].filter(Boolean);
  return `${g.serieA}ª giornata: ${pezzi.join(' · ')}`;
}
