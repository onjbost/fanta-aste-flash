import 'server-only';

/**
 * La Redazione — l'import di una giornata.
 *
 * Ordine delle operazioni, e non è casuale:
 *   1. il payload si salva grezzo **prima** di guardarlo. Se poi qualcosa va
 *      storto, la giornata è comunque recuperabile e si rifà l'import quando
 *      l'estrattore è migliorato — senza chiedere all'admin di ricopiarla.
 *   2. i conti si rifanno qui, da zero, sui giocatori. Quello che il browser
 *      dice di aver calcolato non conta: è un dato che arriva da fuori.
 *   3. si scrive solo se i conti tornano su tutte le squadre della sfida.
 *      Un tabellino sbagliato non è un fastidio: ci finiscono sopra le
 *      classifiche e le notizie.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { chiudiGiornata, type EsitoChiusura } from '@/lib/tipsterServer';
import {
  MAX_SOSTITUZIONI, oraInvio, righeTabellino, validaPayload, verificaSfida,
  type PayloadImport, type SquadraGrezza,
} from './tabellino';

export interface EsitoImport {
  importId: string;
  giornata: number | null;
  sfideLette: number;
  sfideScritte: number;
  giocatori: number;
  agganciati: number;
  problemi: string[];
  schedine: EsitoChiusura | null;
}

export class ImportRifiutato extends Error {
  constructor(message: string, readonly importId: string | null = null) {
    super(message);
    this.name = 'ImportRifiutato';
  }
}

export async function importaGiornata(grezzo: unknown): Promise<EsitoImport> {
  const db = supabaseAdmin();
  const p = grezzo as Partial<PayloadImport> | null;

  // ---- 1 · si salva prima di giudicare -------------------------------
  const { data: riga, error: errIns } = await db.from('redazione_imports').insert({
    lega_alias: typeof p?.lega === 'string' ? p.lega : null,
    competizione: typeof p?.competizione === 'string' ? p.competizione : null,
    giornata: typeof p?.giornata === 'number' ? p.giornata : null,
    versione_estrattore: typeof p?.versioneEstrattore === 'number' ? p.versioneEstrattore : null,
    payload: (grezzo ?? {}) as object,
  }).select('id').single();
  if (errIns) throw new ImportRifiutato(`non sono riuscito a salvare l'import: ${errIns.message}`);
  const importId = riga.id as string;

  const scarta = async (motivo: string): Promise<never> => {
    await db.from('redazione_imports').update({ stato: 'scartato', errore: motivo }).eq('id', importId);
    throw new ImportRifiutato(motivo, importId);
  };

  // ---- 2 · forma del payload -----------------------------------------
  const v = validaPayload(grezzo);
  if (!v.ok) return scarta(v.errore);
  const payload = v.valore;

  // ---- 3 · lega, giornata, squadre ------------------------------------
  const { data: lega } = await db.from('leagues').select('id').limit(1).single();
  if (!lega) return scarta('nessuna lega configurata');
  const leagueId = lega.id as string;

  if (payload.giornata == null) return scarta('la pagina non diceva che giornata fosse');
  const { data: giornata } = await db.from('matchdays')
    .select('id, fanta, serie_a').eq('league_id', leagueId).eq('fanta', payload.giornata).maybeSingle();
  if (!giornata) return scarta(`la giornata ${payload.giornata} non esiste nel calendario`);
  const matchdayId = giornata.id as string;

  const { data: squadre } = await db.from('teams').select('id, name').eq('league_id', leagueId);
  const perNome = new Map((squadre ?? []).map((t) => [normalizza(t.name as string), t.id as string]));

  const { data: sfide } = await db.from('fixtures')
    .select('id, competition, home_team_id, away_team_id').eq('matchday_id', matchdayId);

  await db.from('redazione_imports').update({ league_id: leagueId, matchday_id: matchdayId })
    .eq('id', importId);

  // ---- 4 · i giocatori del listone, per id esterno ---------------------
  const { data: listone } = await db.from('players')
    .select('id, ext_id').eq('league_id', leagueId);
  const perExtId = new Map((listone ?? []).map((g) => [String(g.ext_id), g.id as string]));

  // ---- 5 · sfida per sfida ---------------------------------------------
  const problemi: string[] = [];
  let sfideScritte = 0; let giocatori = 0; let agganciati = 0;

  for (const grezza of payload.sfide) {
    const esito = verificaSfida(grezza, MAX_SOSTITUZIONI);
    if (!esito.ok) { problemi.push(`sfida ${grezza.indice + 1}: ${esito.errore}`); continue; }
    const s = esito.valore;

    if (!s.quadra) { problemi.push(...s.problemi); continue; }
    if (s.problemi.length) problemi.push(...s.problemi);

    const casaId = perNome.get(normalizza(s.casa.nome));
    const ospiteId = perNome.get(normalizza(s.ospite.nome));
    if (!casaId || !ospiteId) {
      problemi.push(`sfida ${grezza.indice + 1}: squadra non riconosciuta (${s.casa.nome} · ${s.ospite.nome})`);
      continue;
    }

    const candidate = (sfide ?? []).filter(
      (f) => f.home_team_id === casaId && f.away_team_id === ospiteId,
    );
    if (!candidate.length) {
      problemi.push(`${s.casa.nome} – ${s.ospite.nome}: non è in calendario alla giornata ${payload.giornata}`);
      continue;
    }
    // campionato e coppa possono ospitare lo stesso accoppiamento: si sceglie
    // il campionato e lo si dice, invece di indovinare in silenzio
    const fixture = candidate.find((f) => f.competition === 'campionato') ?? candidate[0];
    if (candidate.length > 1) {
      problemi.push(`${s.casa.nome} – ${s.ospite.nome}: due competizioni con lo stesso accoppiamento, ho scritto sul ${fixture.competition}`);
    }
    const fixtureId = fixture.id as string;

    // ---- il risultato e il riepilogo di squadra
    const { error: errFix } = await db.from('fixtures').update({
      home_goals: s.casa.gol, away_goals: s.ospite.gol,
      home_fp: s.casa.fantapunti, away_fp: s.ospite.fantapunti,
      home_modulo: s.casa.modulo, away_modulo: s.ospite.modulo,
      home_solo_voti: s.casa.soloVoti, away_solo_voti: s.ospite.soloVoti,
      home_modificatore: s.casa.modificatore, away_modificatore: s.ospite.modificatore,
      home_bonus_capitano: s.casa.bonusCapitano, away_bonus_capitano: s.ospite.bonusCapitano,
      home_inviata_at: oraInvio(s.casa.inviataIl), away_inviata_at: oraInvio(s.ospite.inviataIl),
      tabellino_at: new Date().toISOString(),
      settled_at: new Date().toISOString(),
    }).eq('id', fixtureId);
    if (errFix) { problemi.push(`${s.casa.nome} – ${s.ospite.nome}: ${errFix.message}`); continue; }

    // ---- il tabellino, riga per riga
    for (const [squadra, formazione, teamId] of [
      [s.casa, s.formazioneCasa, casaId],
      [s.ospite, s.formazioneOspite, ospiteId],
    ] as const) {
      const righe = righeTabellino(squadra as SquadraGrezza, formazione).map((r) => {
        const playerId = r.extId ? perExtId.get(r.extId) ?? null : null;
        if (playerId) agganciati++;
        giocatori++;
        return {
          league_id: leagueId, fixture_id: fixtureId, team_id: teamId,
          slot: r.slot, player_name: r.playerName, player_id: playerId,
          role: r.role, starter: r.starter, entered: r.entered,
          is_captain: r.isCaptain, voto: r.voto, fantavoto: r.fantavoto,
          bonus: r.bonus, counted: r.counted,
        };
      });

      const { error } = await db.from('lineup_entries')
        .upsert(righe, { onConflict: 'fixture_id,team_id,slot' });
      if (error) problemi.push(`${(squadra as SquadraGrezza).nome}: ${error.message}`);
    }

    sfideScritte++;
  }

  // ---- 6 · le schedine si chiudono da sole ------------------------------
  let schedine: EsitoChiusura | null = null;
  if (sfideScritte) {
    try { schedine = await chiudiGiornata(matchdayId); }
    catch (e) { problemi.push(`chiusura della giornata: ${(e as Error).message}`); }
  }

  await db.from('redazione_imports').update({
    stato: sfideScritte ? 'importato' : 'scartato',
    errore: sfideScritte ? null : (problemi[0] ?? 'nessuna sfida scritta'),
    conti_ok: sfideScritte, conti_totali: payload.sfide.length,
  }).eq('id', importId);

  return {
    importId, giornata: payload.giornata,
    sfideLette: payload.sfide.length, sfideScritte,
    giocatori, agganciati, problemi, schedine,
  };
}

/**
 * I nomi delle squadre sulla pagina della lega e nel nostro database sono gli
 * stessi, ma non si può contare su maiuscole e spazi: «DEPORTIVO APERITIVO» e
 * «Deportivo Aperitivo» sono la stessa squadra.
 */
function normalizza(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Rifà l'import di una riga già salvata, con l'estrattore di adesso. */
export async function rifaiImport(importId: string): Promise<EsitoImport> {
  const db = supabaseAdmin();
  const { data } = await db.from('redazione_imports').select('payload').eq('id', importId).single();
  if (!data) throw new ImportRifiutato('import inesistente');
  return importaGiornata(data.payload);
}
