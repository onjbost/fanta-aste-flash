import 'server-only';

/**
 * Listone e rose da Leghe Fantacalcio, senza file.
 *
 * Prima si scaricava l'export «Lista calciatori» e lo si caricava in
 * Gestione rose. Adesso l'app legge le stesse cose dall'API della lega e le
 * passa alla stessa scrittura dell'import da file (`applySync`): anteprima,
 * rimborsi al 75% o al 100%, movimenti di credito, registro.
 *
 * Il listone è solo anagrafica e si scrive sempre. Le rose si **copiano**:
 * chi c'è, a che costo, con quanti crediti — lo stato della lega così com'è,
 * senza operazioni di mercato (niente rimborsi, niente cambi consumati).
 *
 * Se però la lega non è ancora stata aggiornata dopo un'asta flash o uno
 * svincolo fatti nell'app, copiarla disferebbe il mercato. Per questo il giro
 * automatico copia solo quando nessuna differenza tocca un giocatore mosso
 * dall'app nelle ultime tre settimane; altrimenti si ferma e lo dice, e
 * l'admin decide dal Pannello guardando l'anteprima.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { applySync } from '@/lib/adminEdits';
import { checkRosters } from '@/lib/listone';
import { annota, chiAgisce } from '@/lib/registroServer';
import type { Role } from '@/lib/rules';
import { chiedi, lega } from './legheServer';
import {
  MINIMO_LISTONE, differenzeRose, traduciListoneERose,
  type ContrattoNostro, type Differenze, type GiocatoreApi, type SquadraApi, type Traduzione,
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
  differenze?: Differenze;
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

/** Le nostre rose e i nostri crediti, nella forma del confronto. */
async function statoNostro(leagueId: string): Promise<{
  contratti: ContrattoNostro[]; crediti: Map<string, number>; squadre: Map<string, string>;
}> {
  const db = supabaseAdmin();
  const [{ data: c }, { data: cr }] = await Promise.all([
    db.from('contracts').select('id, price, teams(name), players(ext_id, name)')
      .eq('league_id', leagueId).is('released_at', null).limit(1000),
    db.from('v_team_credits').select('team_id, name, credits').eq('league_id', leagueId),
  ]);
  type Riga = { id: string; price: number; teams: { name: string } | null; players: { ext_id: string; name: string } | null };
  return {
    contratti: ((c ?? []) as unknown as Riga[]).filter((r) => r.teams && r.players).map((r) => ({
      contractId: r.id, extId: String(r.players!.ext_id), nome: r.players!.name, teamName: r.teams!.name, price: r.price,
    })),
    crediti: new Map((cr ?? []).map((t) => [t.name as string, Number(t.credits)])),
    squadre: new Map((cr ?? []).map((t) => [t.name as string, t.team_id as string])),
  };
}

/** Cosa cambierebbe copiando le rose della lega. Non scrive niente. */
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
  const nostro = await statoNostro(leagueId);
  const differenze = differenzeRose(nostro.contratti, t.giocatori, nostro.crediti, t.crediti);
  const toccati = [...new Set([...differenze.entrano, ...differenze.escono, ...differenze.costi].map((x) => x.extId))];
  return {
    ...base, ok: true, differenze, checks: checkRosters(t.giocatori), cambi: differenze.totale,
    conflitti: await conflitti(leagueId, toccati),
    messaggio: differenze.totale
      ? `${differenze.totale} differenze fra la lega e l'app.`
      : 'Rose, costi e crediti sono già quelli della lega.',
  };
}

export interface EsitoRose extends AnteprimaRose {
  applicate: boolean;
  dettagli: string[];
}

/**
 * Copia rose, costi e crediti della lega nel nostro database.
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
  if (!a.ok || !a.cambi || !a.differenze) return { ...anteprima, applicate: false, dettagli: [] };
  if (opt.automatico && a.conflitti.length) {
    return {
      ...anteprima, applicate: false, dettagli: [],
      messaggio: `Rose non copiate: ${a.conflitti.length} differenze riguardano giocatori mossi nell'app di recente `
        + `(${a.conflitti.map((c) => `${c.nome}: ${c.motivo}`).join('; ')}). `
        + 'Probabilmente la lega non è ancora aggiornata: controlla e, se serve, conferma dal Pannello amministratore.',
    };
  }

  // prima il listone, così chi entra in rosa esiste di sicuro fra i giocatori
  const l = await applySync(leagueId, t.giocatori, { rosters: false, actor: opt.actor, fonte: 'listone da Leghe Fantacalcio' });
  if (!l.ok) return { ...anteprima, ok: false, applicate: false, dettagli: [], messaggio: l.message };

  const d = a.differenze;
  const db = supabaseAdmin();
  const adesso = new Date().toISOString();
  const nostro = await statoNostro(leagueId);
  const { data: giocatori } = await db.from('players').select('id, ext_id').eq('league_id', leagueId).limit(2000);
  const idDi = new Map((giocatori ?? []).map((p) => [String(p.ext_id), p.id as string]));
  const problemi: string[] = [];

  // 1 · chi non c'è più (o ha cambiato squadra): il contratto si chiude e basta
  if (d.escono.length) {
    const { error } = await db.from('contracts').update({
      released_at: adesso, release_type: 'correction', release_value: 0,
    }).in('id', d.escono.map((x) => x.contractId));
    if (error) problemi.push(`uscite: ${error.message}`);
  }
  // 2 · i costi
  for (const x of d.costi) {
    const { error } = await db.from('contracts').update({ price: x.a }).eq('id', x.contractId);
    if (error) problemi.push(`${x.nome}: ${error.message}`);
  }
  // 3 · chi entra
  const nuovi = d.entrano.flatMap((x) => {
    const teamId = nostro.squadre.get(x.teamName);
    const playerId = idDi.get(x.extId);
    if (!teamId || !playerId) { problemi.push(`${x.nome}: squadra o giocatore non trovati`); return []; }
    return [{ league_id: leagueId, team_id: teamId, player_id: playerId, price: x.price, acquisition_type: 'correction', acquired_at: adesso }];
  });
  if (nuovi.length) {
    const { error } = await db.from('contracts').insert(nuovi);
    if (error) problemi.push(`entrate: ${error.message}`);
  }
  // 4 · i crediti: quelli della lega, con una riga di allineamento per squadra
  const allineamenti = d.crediti.flatMap((x) => {
    const teamId = nostro.squadre.get(x.teamName);
    return teamId ? [{
      league_id: leagueId, team_id: teamId, amount: x.a - x.da, reason: 'adjustment',
      note: `Allineamento a Leghe Fantacalcio: ${x.da} → ${x.a} crediti`,
    }] : [];
  });
  if (allineamenti.length) {
    const { error } = await db.from('credit_movements').insert(allineamenti);
    if (error) problemi.push(`crediti: ${error.message}`);
  }

  const dettagli = [
    d.entrano.length ? `${d.entrano.length} entrati` : '',
    d.escono.length ? `${d.escono.length} usciti` : '',
    d.costi.length ? `${d.costi.length} costi corretti` : '',
    d.crediti.length ? `crediti allineati per ${d.crediti.length} squadre` : '',
  ].filter(Boolean);

  await db.from('audit_log').insert({
    league_id: leagueId, actor: opt.actor, action: 'roster_sync',
    payload: { fonte: 'leghe', entrano: d.entrano.length, escono: d.escono.length, costi: d.costi.length, crediti: d.crediti.length },
  }).then(() => null, () => null);
  await annota({
    leagueId, azione: 'rose_importate',
    attore: opt.actor ? await chiAgisce(opt.actor) : { nome: 'Aggiornamento automatico' },
    dati: { nota: ['rose copiate da Leghe Fantacalcio', ...dettagli].join(' · ') },
  });

  const ok = problemi.length === 0;
  return {
    ...anteprima, ok, applicate: true, dettagli: [...dettagli, ...problemi],
    messaggio: ok
      ? `Rose copiate da Leghe Fantacalcio: ${dettagli.join(', ')}.`
      : `Rose copiate solo in parte: ${problemi.join(' · ')}`,
  };
}
