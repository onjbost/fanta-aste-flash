import 'server-only';

/**
 * Gli indisponibili di Serie A — dalla pagina al database, e ritorno.
 *
 * La raccolta è settimanale (il cron del mercoledì) e ogni volta scrive una
 * fotografia nuova invece di aggiornare quella vecchia: «cosa sapevamo
 * mercoledì scorso» resta leggibile, ed è l'unico modo di capire, fra un
 * mese, perché una quota era quella che era.
 *
 * Il parser sta in `pagina.ts`, puro e con i suoi test sul testo vero. Qui
 * ci sono solo la rete, l'aggancio ai nostri giocatori e la scrittura.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { notifyAdminPlain } from '@/lib/telegram';
import {
  durataLeggibile, giorniDiStop, leggiIndisponibili, nuoviInfortunati,
  testoDiHtml, type Indisponibile,
} from './pagina';

const FONTE = 'https://www.fantacalcio.it/indisponibili-serie-a';

/** Oltre questi giorni l'infortunio dà diritto allo svincolo gratuito (art. 8.4). */
export const GIORNI_SVINCOLO_GRATUITO = 60;

export interface EsitoRaccolta {
  reportId: string | null;
  righe: number;
  agganciate: number;
  problemi: string[];
}

/**
 * Il nome come lo scrive la fonte contro il nome del listone.
 *
 * Le due convenzioni coincidono quasi sempre — «Sulemana K.», «Idrissi R.» —
 * perché entrambe vengono da Fantacalcio.it. Quasi: si normalizza comunque
 * via accenti, punti e doppi spazi, perché una sola lettera di differenza
 * vale un giocatore non agganciato, e un giocatore non agganciato è un
 * infortunio che le quote non vedono.
 */
function chiave(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Va a prendere la pagina, la legge e ne scrive una fotografia.
 *
 * Non solleva mai: torna i problemi. È chiamata dal cron, e un cron che
 * esplode perché una pagina esterna ha cambiato impaginazione si porta
 * dietro anche tutto il resto del giro notturno.
 */
export async function raccogliIndisponibili(): Promise<EsitoRaccolta> {
  const problemi: string[] = [];
  const db = supabaseAdmin();

  let html: string;
  try {
    const res = await fetch(FONTE, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FantaMansarda/1.0)' },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!res.ok) return { reportId: null, righe: 0, agganciate: 0, problemi: [`la pagina ha risposto ${res.status}`] };
    html = await res.text();
  } catch (e) {
    return { reportId: null, righe: 0, agganciate: 0, problemi: [`non sono riuscito a leggere la pagina: ${(e as Error).message}`] };
  }

  // il vocabolario delle squadre viene dai nostri giocatori: riconoscere i
  // club da un elenco noto è ciò che rende il parser insensibile
  // all'impaginazione della pagina
  const { data: giocatori } = await db.from('players').select('id, name, club');
  const club = [...new Set((giocatori ?? []).map((p) => p.club as string).filter(Boolean))];
  if (club.length < 15) problemi.push(`solo ${club.length} squadre nel listone: l'aggancio sarà parziale`);

  const righe = leggiIndisponibili(testoDiHtml(html), club);
  if (!righe.length) {
    return { reportId: null, righe: 0, agganciate: 0, problemi: ['la pagina non ha prodotto nessuna riga: probabilmente è cambiata'] };
  }

  const perNome = new Map((giocatori ?? []).map((p) => [chiave(p.name as string), p.id as string]));
  const conId = righe.map((r) => ({ r, playerId: perNome.get(chiave(r.nome)) ?? null }));
  const agganciate = conId.filter((x) => x.playerId).length;

  // la fotografia di prima va letta adesso, perché fra un attimo quella
  // «ultima» sarà questa e il confronto non avrebbe più niente con cui farsi
  const precedenti = await indisponibiliAttuali();

  const { data: report, error } = await db.from('injury_reports')
    .insert({ fonte: FONTE, righe: righe.length, agganciate })
    .select('id').single();
  if (error) return { reportId: null, righe: righe.length, agganciate, problemi: [error.message] };

  const { error: e2 } = await db.from('injuries').insert(conId.map(({ r, playerId }) => ({
    report_id: report.id,
    club: r.club,
    nome_fonte: r.nome,
    player_id: playerId,
    categoria: r.categoria,
    descrizione: r.descrizione,
    rientro_stimato: r.rientroStimato,
    rientro_testo: r.rientroTesto,
  })));
  if (e2) problemi.push(e2.message);

  // un crollo improvviso delle righe agganciate è il sintomo che la pagina o
  // la convenzione dei nomi è cambiata: meglio dirlo subito che scoprirlo
  // fra tre settimane da una quota sbagliata
  if (righe.length && agganciate / righe.length < 0.5) {
    problemi.push(`agganciati solo ${agganciate} su ${righe.length}: controlla i nomi`);
  }

  await avvisaDeiNuovi(precedenti, conId.map(({ r, playerId }) => ({ ...r, playerId })));

  return { reportId: report.id as string, righe: righe.length, agganciate, problemi };
}

export interface IndisponibileNostro extends Indisponibile {
  playerId: string | null;
  giorniDiStop: number | null;
  raccoltoIl: string;
}

/** L'ultima fotografia, com'è. */
export async function indisponibiliAttuali(): Promise<IndisponibileNostro[]> {
  const db = supabaseAdmin();
  const oggi = new Date();
  const { data } = await db.from('v_indisponibili_ultimi')
    .select('player_id, club, nome_fonte, categoria, descrizione, rientro_stimato, rientro_testo, fetched_at');

  return (data ?? []).map((r) => ({
    playerId: (r.player_id as string | null) ?? null,
    club: r.club as string,
    nome: r.nome_fonte as string,
    categoria: r.categoria as Indisponibile['categoria'],
    descrizione: r.descrizione as string,
    rientroStimato: (r.rientro_stimato as string | null) ?? null,
    rientroTesto: (r.rientro_testo as string | null) ?? null,
    giorniDiStop: giorniDiStop((r.rientro_stimato as string | null) ?? null, oggi),
    raccoltoIl: r.fetched_at as string,
  }));
}

/**
 * Chi, nella lega, non è schierabile adesso.
 *
 * Solo infortunati e squalificati: «in dubbio» vuol dire che probabilmente
 * gioca, e i diffidati giocano eccome. Serve al generatore di quote, che
 * fino a oggi leggeva le rose intere e non sapeva quali undici fossero
 * davvero disponibili.
 */
export async function nonSchierabili(): Promise<Set<string>> {
  const righe = await indisponibiliAttuali();
  return new Set(
    righe
      .filter((r) => r.categoria === 'infortunato' || r.categoria === 'squalificato')
      .map((r) => r.playerId)
      .filter((id): id is string => Boolean(id)),
  );
}

export interface SvincoloProponibile {
  playerId: string;
  nome: string;
  teamId: string;
  squadra: string;
  giorni: number;
  rientroStimato: string;
  /** la frase originale della fonte: l'admin decide guardando questa, non la stima */
  motivazione: string;
}

/**
 * Gli svincoli gratuiti che l'app **propone** all'admin.
 *
 * Propone, non decide, e non apre niente da sé: la stima di rientro è dedotta
 * da una frase in italiano («rientro da marzo»), quindi può sbagliare, e
 * l'esito vale crediti veri. Per questo accanto ai giorni calcolati viaggia
 * sempre la frase da cui vengono, e l'ultima parola resta all'admin — come
 * chiesto.
 */
export async function svincoliProponibili(leagueId: string): Promise<SvincoloProponibile[]> {
  const db = supabaseAdmin();
  const righe = (await indisponibiliAttuali())
    .filter((r) => r.categoria === 'infortunato')
    .filter((r) => r.playerId && r.rientroStimato)
    .filter((r) => (r.giorniDiStop ?? 0) > GIORNI_SVINCOLO_GRATUITO);
  if (!righe.length) return [];

  const ids = righe.map((r) => r.playerId as string);
  const [{ data: contratti }, { data: pendenti }] = await Promise.all([
    db.from('contracts')
      .select('player_id, team_id, players(name), teams(name)')
      .eq('league_id', leagueId).is('released_at', null).in('player_id', ids),
    db.from('free_release_requests')
      .select('player_id').eq('league_id', leagueId).eq('status', 'pending'),
  ]);

  const giaChiesti = new Set((pendenti ?? []).map((p) => p.player_id as string));

  return (contratti ?? [])
    .filter((c) => !giaChiesti.has(c.player_id as string))
    .map((c) => {
      const r = righe.find((x) => x.playerId === c.player_id)!;
      const p = c.players as unknown as { name: string } | null;
      const t = c.teams as unknown as { name: string } | null;
      return {
        playerId: c.player_id as string,
        nome: p?.name ?? r.nome,
        teamId: c.team_id as string,
        squadra: t?.name ?? '—',
        giorni: r.giorniDiStop as number,
        rientroStimato: r.rientroStimato as string,
        motivazione: r.rientroTesto ?? r.descrizione,
      };
    })
    .sort((a, b) => b.giorni - a.giorni);
}

/**
 * Un messaggio su Telegram all'admin per ogni infortunato nuovo.
 *
 * Solo i nuovi, non tutti i fermi: altrimenti ogni mercoledì arriverebbe lo
 * stesso crociato di ottobre, e dopo tre settimane l'admin smette di leggere.
 *
 * Solo chi è in una rosa della lega, e per il resto della Serie A una riga
 * di riepilogo: un infortunio che non è di nessuno non cambia una decisione,
 * ma sapere quanti ce n'erano dice se la raccolta ha funzionato.
 *
 * Non blocca mai: un Telegram che non risponde non deve far fallire la
 * raccolta, che è la cosa che serviva davvero.
 */
async function avvisaDeiNuovi(
  prima: IndisponibileNostro[],
  adesso: (Indisponibile & { playerId: string | null })[],
): Promise<void> {
  const nuovi = nuoviInfortunati(prima, adesso);
  if (!nuovi.length) return;

  const db = supabaseAdmin();
  const oggi = new Date();
  const ids = nuovi.map((n) => n.playerId).filter((x): x is string => Boolean(x));
  const { data: inRosa } = ids.length
    ? await db.from('v_roster').select('player_id, teams:team_id(name)').in('player_id', ids)
    : { data: [] as { player_id: string; teams: unknown }[] };

  const squadraDi = new Map((inRosa ?? []).map((r) => [
    r.player_id as string,
    (r.teams as unknown as { name: string } | null)?.name ?? null,
  ]));

  const nostri = nuovi.filter((n) => n.playerId && squadraDi.has(n.playerId));

  for (const n of nostri) {
    const durata = durataLeggibile(giorniDiStop(n.rientroStimato, oggi));
    await notifyAdminPlain(
      `🚑 ${n.nome} (${n.club}) si è fermato.\n`
      + `In rosa a ${squadraDi.get(n.playerId as string)}.\n`
      + `Durata: ${durata}.\n`
      + (n.rientroTesto ? `La fonte dice: «${n.rientroTesto}».` : `La fonte non dà una stima.`),
    );
  }

  const altri = nuovi.length - nostri.length;
  if (altri > 0) {
    await notifyAdminPlain(`Altri ${altri} nuovi infortunati in Serie A, nessuno in rosa nella lega.`);
  }
}
