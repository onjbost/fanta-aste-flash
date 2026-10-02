import 'server-only';

/**
 * Listone e rose da Leghe Fantacalcio, senza file.
 *
 * Prima si scaricava l'export «Lista calciatori» e lo si caricava in
 * Gestione rose. Adesso l'app legge le stesse cose dall'API della lega e le
 * passa alla stessa scrittura dell'import da file (`applySync`): anteprima,
 * rimborsi al 75% o al 100%, movimenti di credito, registro.
 *
 * Il listone è solo anagrafica e si scrive sempre. Le rose no: se la lega
 * non è ancora stata aggiornata dopo un'asta flash o uno svincolo fatti
 * nell'app, copiarla disferebbe il mercato. Per questo il giro automatico le
 * scrive solo quando nessuna differenza tocca un giocatore mosso dall'app
 * nelle ultime tre settimane; altrimenti si ferma e lo dice, e l'admin
 * decide dal Pannello guardando l'anteprima.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { applySync, previewSync, type SyncPreview } from '@/lib/adminEdits';
import { checkRosters } from '@/lib/listone';
import type { Role } from '@/lib/rules';
import { chiedi, lega } from './legheServer';
import {
  MINIMO_LISTONE, traduciListoneERose,
  type GiocatoreApi, type SquadraApi, type Traduzione,
} from './rose';

/** Una riga nel registro delle raccolte: il Pannello mostra l'ultima. */
async function registra(fonte: 'listone' | 'rose', righe: number, agganciate: number, nota: string) {
  await supabaseAdmin().from('source_runs').insert({ fonte, righe, agganciate, nota: nota.slice(0, 900) })
    .then(() => null, () => null);
}

/** Quanto indietro guardare per i movimenti fatti nell'app. */
const GIORNI_MERCATO_APP = 21;

async function leggi(): Promise<{ leagueId: string; t: Traduzione }> {
  const leagueId = await lega();
  const db = supabaseAdmin();
  const [pool, teams, { data: nostri }, { data: squadre }, { data: prezzi }] = await Promise.all([
    chiedi<{ players?: GiocatoreApi[] }>('/onboarding/v1/league/players'),
    chiedi<{ data?: SquadraApi[] }>('/onboarding/v1/league/teams?page=1&pageSize=50'),
    db.from('players').select('ext_id, name, role, club, quotation, out_of_list').eq('league_id', leagueId).limit(2000),
    db.from('teams').select('name').eq('league_id', leagueId),
    db.from('player_prices').select('ext_id, ruolo').limit(2000),
  ]);
  const t = traduciListoneERose(
    pool,
    teams?.data ?? [],
    (nostri ?? []).map((p) => ({
      extId: String(p.ext_id), name: p.name as string, role: p.role as Role, club: p.club as string,
      quotation: Number(p.quotation), outOfList: !!p.out_of_list,
    })),
    (squadre ?? []).map((s) => s.name as string),
    new Map((prezzi ?? []).map((p) => [String(p.ext_id), { ruolo: (p.ruolo as Role | null) ?? null }])),
  );
  return { leagueId, t };
}

export interface EsitoListone {
  ok: boolean;
  messaggio: string;
  dettagli: string[];
}

/** Il listone della lega (svincolati compresi) nel nostro database. */
export async function aggiornaListoneDallaLega(actor: string | null): Promise<EsitoListone> {
  const { leagueId, t } = await leggi();
  if (t.giocatori.length < MINIMO_LISTONE) {
    const messaggio = `Listone non aggiornato: ${t.problemi.join(' · ')}`;
    await registra('listone', t.giocatori.length, 0, messaggio);
    return { ok: false, messaggio, dettagli: [] };
  }
  const r = await applySync(leagueId, t.giocatori, { rosters: false, actor, fonte: 'listone da Leghe Fantacalcio' });
  await registra('listone', t.giocatori.length, r.ok ? t.giocatori.length : 0, [r.ok ? '' : r.message, ...t.problemi].filter(Boolean).join(' · '));
  return {
    ok: r.ok,
    messaggio: r.ok ? `Listone aggiornato da Leghe Fantacalcio: ${t.giocatori.length} giocatori.` : r.message,
    dettagli: [...r.details, ...t.problemi],
  };
}

export interface Conflitto {
  extId: string;
  nome: string;
  /** cosa ha fatto l'app: «preso all'asta flash il 30/9», «svincolato il 1/10» */
  motivo: string;
}

export interface AnteprimaRose {
  ok: boolean;
  messaggio: string;
  preview?: SyncPreview;
  checks?: ReturnType<typeof checkRosters>;
  conflitti: Conflitto[];
  problemi: string[];
  cambi: number;
}

const giorno = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Rome' });

/**
 * I giocatori delle differenze che l'app ha mosso di recente con il suo
 * mercato (asta flash, svincolo, scambio): se la lega dice altro, è più
 * probabile che sia la lega a essere indietro.
 */
async function conflitti(leagueId: string, extIds: string[]): Promise<Conflitto[]> {
  if (!extIds.length) return [];
  const db = supabaseAdmin();
  const da = new Date(Date.now() - GIORNI_MERCATO_APP * 86_400_000).toISOString();
  const { data } = await db.from('contracts')
    .select('acquisition_type, acquired_at, release_type, released_at, players!inner(ext_id, name)')
    .eq('league_id', leagueId).in('players.ext_id', extIds)
    .or(`acquired_at.gte."${da}",released_at.gte."${da}"`);
  type Riga = {
    acquisition_type: string; acquired_at: string | null; release_type: string | null; released_at: string | null;
    players: { ext_id: string; name: string };
  };
  const esito = new Map<string, Conflitto>();
  for (const r of (data ?? []) as unknown as Riga[]) {
    const motivi: string[] = [];
    if (r.acquired_at && r.acquired_at >= da && r.acquisition_type !== 'correction') {
      motivi.push(`${r.acquisition_type === 'flash_auction' ? 'preso all\'asta flash' : 'entrato in rosa'} il ${giorno(r.acquired_at)}`);
    }
    if (r.released_at && r.released_at >= da && r.release_type && r.release_type !== 'correction') {
      motivi.push(`svincolato il ${giorno(r.released_at)}`);
    }
    if (!motivi.length) continue;
    const prima = esito.get(r.players.ext_id);
    esito.set(r.players.ext_id, {
      extId: r.players.ext_id, nome: r.players.name,
      motivo: [prima?.motivo, ...motivi].filter(Boolean).join(', '),
    });
  }
  return [...esito.values()];
}

/** Cosa cambierebbe nelle rose copiando la lega. Non scrive niente. */
export async function anteprimaRoseDallaLega(): Promise<AnteprimaRose & { leagueId: string; t: Traduzione }> {
  const { leagueId, t } = await leggi();
  const base = { leagueId, t, conflitti: [] as Conflitto[], problemi: t.problemi, cambi: 0 };
  if (t.giocatori.length < MINIMO_LISTONE) {
    return { ...base, ok: false, messaggio: `Non leggo le rose: ${t.problemi.join(' · ')}` };
  }
  if (t.conRosa === 0) {
    // non è un guasto: prima dell'asta è così, e il cron non deve dirlo ogni mattina
    return { ...base, ok: true, messaggio: 'Nella lega le rose sono ancora vuote: prima dell\'asta non c\'è niente da copiare.' };
  }
  if (t.squadreSconosciute.length) {
    return {
      ...base, ok: false,
      messaggio: `Squadre della lega che non trovo fra le nostre: ${t.squadreSconosciute.join(', ')}. Correggi i nomi prima di aggiornare.`,
    };
  }
  if (t.problemi.some((p) => p.includes('rosa non leggibile'))) {
    return { ...base, ok: false, messaggio: `Rose non leggibili: ${t.problemi.join(' · ')}` };
  }
  const preview = await previewSync(leagueId, t.giocatori);
  const r = preview.rosters;
  const toccati = [...r.added, ...r.removed, ...r.moved, ...r.repriced].map((x) => x.extId);
  const cambi = toccati.length;
  return {
    ...base, ok: true, preview, checks: checkRosters(t.giocatori), cambi,
    conflitti: await conflitti(leagueId, toccati),
    messaggio: cambi ? `${cambi} differenze fra le rose della lega e le nostre.` : 'Le rose sono già allineate con la lega.',
  };
}

export interface EsitoRose extends AnteprimaRose {
  applicate: boolean;
  dettagli: string[];
}

/**
 * Copia le rose della lega (e il listone) nel nostro database.
 *
 * `automatico`: il giro del cron. Se una differenza tocca un giocatore che
 * l'app ha mosso da poco, non scrive niente e lo dice — la decisione resta
 * all'admin, dal Pannello. Senza `automatico` (l'admin ha visto l'anteprima
 * e confermato) scrive comunque.
 */
export async function aggiornaRoseDallaLega(opt: { actor: string | null; automatico: boolean }): Promise<EsitoRose> {
  const e = await copiaRose(opt);
  await registra('rose', e.cambi, e.applicate ? e.cambi : 0, e.messaggio);
  return e;
}

async function copiaRose(opt: { actor: string | null; automatico: boolean }): Promise<EsitoRose> {
  const a = await anteprimaRoseDallaLega();
  const { leagueId, t, ...anteprima } = a;
  if (!a.ok || !a.cambi) return { ...anteprima, applicate: false, dettagli: [] };
  if (opt.automatico && a.conflitti.length) {
    return {
      ...anteprima, applicate: false, dettagli: [],
      messaggio: `Rose non aggiornate: ${a.conflitti.length} differenze riguardano giocatori mossi nell'app di recente `
        + `(${a.conflitti.map((c) => `${c.nome}: ${c.motivo}`).join('; ')}). `
        + 'Probabilmente la lega non è ancora aggiornata: controlla e, se serve, conferma dal Pannello amministratore.',
    };
  }
  const r = await applySync(leagueId, t.giocatori, {
    rosters: true, actor: opt.actor,
    fonte: opt.automatico ? 'rose da Leghe Fantacalcio, giro del mattino' : 'rose da Leghe Fantacalcio',
  });
  return { ...anteprima, ok: r.ok, applicate: r.ok, messaggio: r.ok ? `Rose aggiornate da Leghe Fantacalcio: ${r.details.join(' · ')}.` : r.message, dettagli: r.details };
}
