import 'server-only';

/**
 * La Gazzetta — dal database alla prima pagina.
 *
 * Il materiale è lo stesso della Redazione: `costruisciMateriale` legge
 * tabellini, spunti, classifiche e soprannomi, e qui si riusa invece di
 * rileggerlo. Se un giorno la Redazione imparasse a riconoscere uno spunto
 * nuovo, la Gazzetta lo saprebbe lo stesso giorno — che è tutto il punto di
 * non avere due raccolte parallele degli stessi fatti.
 *
 * Quello che si aggiunge qui è solo ciò che una prima pagina ha e un
 * messaggio no: il migliore in campo (che è il gancio del titolo e il
 * numerone), la foto, e il calendario della prossima giornata.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { costruisciMateriale } from '@/lib/redazione/redazioneServer';
import { numeriLeciti } from '@/lib/redazione/spunti';
import { scegliModello } from '@/lib/redazione/modello';
import { misuraImmagine } from './immagine';
import { cognomeDaListone, scegliFoto } from './news';
import { indiceFoto } from './newsServer';
import {
  COLORI, disposizioneFoto,
  type DatiPrima, type FotoPrima, type Incontro, type RigaClassifica,
} from './prima';
import {
  costruisciPromptPrima, daJsonPrima, montaPrima, primaDiRipiego, sceltaApertura, verificaPrima,
  type EsitoPrima, type MiglioreInCampo, type PezziDellaPagina, type RichiestaPrima,
  type SfidaPrima, type TestiPrima,
} from './testi';

const MASSIMI_TENTATIVI = 2;

const SOTTOTESTATA = 'STRUMENTI ★ SCARAMANZIE ★ BOTTE DI CULO';
const PIEDE_SINISTRA = 'FANTA MANSARDA';
const PIEDE_DESTRA = 'UNICA ED INIMITABILE';

// =====================================================================
// I pezzi che la Redazione non ha
// =====================================================================

/**
 * Il voto più alto della giornata, con la squadra di Serie A per cui gioca.
 *
 * Serve due volte: è il gancio del titolo («con un Mastantuono da 18») ed è
 * il numerone in fondo a sinistra. Il club non è quello fantacalcistico ma
 * quello vero, perché è con quello che si cerca la foto.
 *
 * Solo i giocatori che hanno davvero contribuito al totale (`counted`): un
 * titolare poi sostituito può avere il fantavoto più alto della giornata
 * senza che quel voto sia finito da nessuna parte, e metterlo in prima
 * pagina sarebbe falso.
 */
async function miglioreInCampo(
  fixtureIds: string[], nomeDi: Map<string, string>,
): Promise<(MiglioreInCampo & { club: string | null }) | null> {
  if (!fixtureIds.length) return null;
  const db = supabaseAdmin();

  const { data } = await db.from('lineup_entries')
    .select('player_name, fantavoto, team_id, players(club)')
    .in('fixture_id', fixtureIds)
    .eq('counted', true)
    .not('fantavoto', 'is', null)
    .order('fantavoto', { ascending: false })
    .limit(1);

  const r = data?.[0];
  if (!r) return null;
  const players = r.players as { club?: string } | { club?: string }[] | null;
  const club = Array.isArray(players) ? players[0]?.club ?? null : players?.club ?? null;

  return {
    nome: r.player_name as string,
    squadra: nomeDi.get(r.team_id as string) ?? '?',
    fantapunti: Number(r.fantavoto),
    club,
  };
}

/** Le partite della prossima giornata di campionato, per la colonna «Si gioca». */
async function prossimiIncontri(
  leagueId: string, fanta: number, nomeDi: Map<string, string>,
): Promise<Incontro[]> {
  const db = supabaseAdmin();

  const { data: md } = await db.from('matchdays')
    .select('id, fanta').eq('league_id', leagueId)
    .gt('fanta', fanta).order('fanta').limit(1);
  const prossima = md?.[0];
  if (!prossima) return [];

  const { data } = await db.from('fixtures')
    .select('home_team_id, away_team_id, competition')
    .eq('matchday_id', prossima.id as string);

  return (data ?? [])
    .filter((f) => f.home_team_id && f.away_team_id)
    .map((f) => ({
      casa: nomeDi.get(f.home_team_id as string) ?? '?',
      ospite: nomeDi.get(f.away_team_id as string) ?? '?',
    }));
}

/**
 * La foto dell'apertura, misurata.
 *
 * Le misure servono davvero: la disposizione in pagina la decidono le
 * proporzioni, e senza misurare una foto verticale finirebbe stirata a
 * tutta larghezza. Se l'immagine non si scarica o non si riesce a
 * misurare, si torna `null` e la pagina esce di sola tipografia — che su
 * una prima pagina sportiva regge benissimo, mentre una foto deformata no.
 */
async function fotoDiApertura(
  chi: { cognome: string; club: string } | null,
): Promise<FotoPrima | null> {
  if (!chi || !chi.cognome || !chi.club) return null;

  const esito = scegliFoto(await indiceFoto(), chi);
  if (!esito.trovata) return null;

  try {
    const res = await fetch(esito.immagine, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const misure = misuraImmagine(new Uint8Array(await res.arrayBuffer()));
    if (!misure) return null;
    return {
      src: esito.immagine,
      larghezza: misure.larghezza,
      altezza: misure.altezza,
      // all'admin si dice sempre da dove viene: col ripiego sulla squadra
      // la faccia nella foto può essere di un compagno
      provenienza: esito.perche === 'giocatore'
        ? esito.articolo.titolo
        : `(foto della squadra) ${esito.articolo.titolo}`,
      fuoco: 35,
    };
  } catch {
    return null;
  }
}

// =====================================================================
// Il materiale
// =====================================================================

export interface MaterialePrima extends PezziDellaPagina {
  leagueId: string;
  matchdayId: string;
  leciti: Set<number>;
}

export async function materialePrima(matchdayId: string): Promise<MaterialePrima> {
  const { leagueId, contesto, richiesta: pezzo } = await costruisciMateriale(matchdayId);
  if (!pezzo.sfide.length) throw new Error('la giornata non ha sfide con il tabellino');

  // i nomi dalle squadre e non dalla classifica: una classifica parziale
  // (o una lega che non l'ha ancora pubblicata) lascerebbe dei «?» nel
  // calendario della prossima giornata
  const { data: squadre } = await supabaseAdmin()
    .from('teams').select('id, name').eq('league_id', leagueId);
  const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));

  const sfide: SfidaPrima[] = pezzo.sfide.map((s) => ({
    fixtureId: s.fixtureId, casa: s.casa, ospite: s.ospite,
    golCasa: s.golCasa, golOspite: s.golOspite,
    fpCasa: s.fpCasa, fpOspite: s.fpOspite,
    competizione: s.competizione,
  }));

  const migliore = await miglioreInCampo(sfide.map((s) => s.fixtureId), nomeDi);
  const foto = await fotoDiApertura(
    migliore?.club ? { cognome: cognomeDaListone(migliore.nome), club: migliore.club } : null,
  );

  const richiesta: RichiestaPrima = {
    tipo: 'settimanale',
    giornata: pezzo.giornata,
    tono: pezzo.tono,
    disposizione: disposizioneFoto(foto),
    squadre: pezzo.squadre.map((s) => ({
      nome: s.nome, soprannomi: s.soprannomi, intoccabile: s.intoccabile,
    })),
    sfide,
    apertura: sceltaApertura(sfide, pezzo.spunti) ?? sfide[0].fixtureId,
    spunti: pezzo.spunti,
    migliore: migliore
      ? { nome: migliore.nome, squadra: migliore.squadra, fantapunti: migliore.fantapunti }
      : null,
    paroleVietate: pezzo.paroleVietate,
  };

  return {
    leagueId, matchdayId, richiesta,
    leciti: numeriLeciti(contesto, pezzo.spunti),
    classifica: contesto.classificaDopo.map((c) => ({ nome: c.nome, punti: c.punti })),
    prossimi: await prossimiIncontri(leagueId, pezzo.giornata, nomeDi),
    foto,
    numero: pezzo.giornata,
  };
}

// =====================================================================
// Dal testo alla pagina
// =====================================================================

// =====================================================================
// La generazione
// =====================================================================

export interface EsitoGazzetta {
  gazzettaId: string;
  versione: number;
  provider: 'gemini' | 'template';
  modello: string | null;
  tentativi: number;
  verifica: EsitoPrima;
  dati: DatiPrima;
}

export async function generaGazzetta(
  matchdayId: string, opzioni: { tono?: number } = {},
): Promise<EsitoGazzetta> {
  const db = supabaseAdmin();
  const materiale = await materialePrima(matchdayId);
  const r = materiale.richiesta;
  if (opzioni.tono != null) r.tono = Math.min(5, Math.max(1, opzioni.tono));

  const modello = scegliModello();
  let testi: TestiPrima | null = null;
  let esito: EsitoPrima | null = null;
  let usato: 'gemini' | 'template' = modello ? 'gemini' : 'template';
  let nomeModello = modello?.modello ?? null;
  let tentativi = 0;

  if (modello) {
    for (let i = 0; i < MASSIMI_TENTATIVI; i++) {
      tentativi++;
      try {
        const candidato = daJsonPrima(await modello.chiedi(costruisciPromptPrima(r)));
        const v = verificaPrima(candidato, r, materiale.leciti);
        testi = candidato; esito = v;
        if (v.ok) break;
        r.correzioni = v.problemi;          // seconda passata: gli si dice cosa non andava
      } catch (e) {
        esito = { ok: false, problemi: [`il modello non ha risposto: ${(e as Error).message}`], inventati: [] };
        testi = null;
      }
    }
  }

  // la rete di sicurezza: asciutta ma corretta, e parte sempre
  if (!testi || !esito?.ok) {
    const ripiego = primaDiRipiego(r);
    const v = verificaPrima(ripiego, r, materiale.leciti);
    const prima = esito?.problemi ?? [];
    testi = ripiego;
    usato = 'template'; nomeModello = null;
    esito = { ...v, problemi: [...prima, ...v.problemi] };
  }

  const dati = montaPrima(testi, materiale);

  const { data, error } = await db.from('gazzette').insert({
    league_id: materiale.leagueId, matchday_id: matchdayId,
    tipo: r.tipo, dati, verifica: { ...esito, tentativi },
    provider: usato, model: nomeModello,
  }).select('id, versione').single();
  if (error) throw new Error(`non sono riuscito a salvare la gazzetta: ${error.message}`);

  return {
    gazzettaId: data.id as string, versione: data.versione as number,
    provider: usato, modello: nomeModello, tentativi, verifica: esito, dati,
  };
}

// =====================================================================
// Quello che fa l'admin dopo
// =====================================================================

export interface GazzettaSalvata {
  id: string;
  versione: number;
  tipo: 'settimanale' | 'fantamercato';
  dati: DatiPrima;
  verifica: (EsitoPrima & { tentativi?: number }) | null;
  provider: string;
  modello: string | null;
  generataIl: string;
  modificataIl: string | null;
  inviataIl: string | null;
}

function daRiga(r: Record<string, unknown>): GazzettaSalvata {
  return {
    id: r.id as string,
    versione: r.versione as number,
    tipo: r.tipo as 'settimanale' | 'fantamercato',
    dati: r.dati as DatiPrima,
    verifica: (r.verifica as GazzettaSalvata['verifica']) ?? null,
    provider: r.provider as string,
    modello: (r.model as string | null) ?? null,
    generataIl: r.generated_at as string,
    modificataIl: (r.edited_at as string | null) ?? null,
    inviataIl: (r.sent_at as string | null) ?? null,
  };
}

export async function ultimaGazzetta(matchdayId: string): Promise<GazzettaSalvata | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('gazzette')
    .select('*').eq('matchday_id', matchdayId)
    .order('versione', { ascending: false }).limit(1);
  return data?.[0] ? daRiga(data[0] as Record<string, unknown>) : null;
}

export async function leggiGazzetta(id: string): Promise<GazzettaSalvata | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('gazzette').select('*').eq('id', id).maybeSingle();
  return data ? daRiga(data as Record<string, unknown>) : null;
}

/**
 * Le correzioni dell'admin.
 *
 * Si sovrascrive `dati` sulla stessa riga invece di fare una versione nuova:
 * una versione è una **rigenerazione**, cioè un altro testo del modello, e
 * confondere le due cose riempirebbe l'elenco di venti versioni che
 * differiscono per una virgola. `edited_at` serve all'interfaccia per dire
 * che la verifica lì accanto parla del testo di prima.
 */
export async function salvaModifiche(id: string, dati: DatiPrima): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from('gazzette')
    .update({ dati, edited_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`non sono riuscito a salvare le modifiche: ${error.message}`);
}

export async function segnaInviata(id: string): Promise<void> {
  const db = supabaseAdmin();
  const ora = new Date().toISOString();
  await db.from('gazzette').update({ approved_at: ora, sent_at: ora }).eq('id', id);
}

export { COLORI };
