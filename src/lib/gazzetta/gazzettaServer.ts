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
import { cognomeDaListone, scegliFoto } from './news';
import { indiceFoto } from './newsServer';
import {
  COLORI, disposizioneFoto, faseDiCoppa,
  type DatiPrima, type FotoPrima, type GironePrima, type Incontro,
  type RigaClassifica, type TipoEdizione, type VoceTabellone,
} from './prima';

type Competizione = 'campionato' | 'coppa';
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

/**
 * Le partite della prossima giornata di campionato, per la colonna «Si gioca».
 *
 * Solo il campionato. Una giornata può avere anche le sfide di coppa, e
 * senza filtro la colonna ne elencava otto invece di quattro — con le
 * squadre ripetute, perché sono le stesse otto che giocano due volte — e
 * sfondava il fondo della pagina.
 */
async function prossimiIncontri(
  leagueId: string, fanta: number, nomeDi: Map<string, string>,
  competizione: Competizione = 'campionato',
): Promise<Incontro[]> {
  const db = supabaseAdmin();

  // La prossima giornata **di questa competizione**: di coppa se ne gioca
  // una ogni tre, e proporre quella di campionato sulla pagina di coppa
  // sarebbe il calendario sbagliato.
  const { data: turni } = await db.from('fixtures')
    .select('matchday_id, matchdays!inner(fanta)')
    .eq('league_id', leagueId).eq('competition', competizione)
    .gt('matchdays.fanta', fanta);

  const ordinati = (turni ?? [])
    .map((f) => ({
      id: f.matchday_id as string,
      fanta: (f.matchdays as unknown as { fanta: number | null })?.fanta ?? null,
    }))
    .filter((x): x is { id: string; fanta: number } => x.fanta != null)
    .sort((a, b) => a.fanta - b.fanta);
  const prossima = ordinati[0];
  if (!prossima) return [];

  const { data } = await db.from('fixtures')
    .select('home_team_id, away_team_id')
    .eq('matchday_id', prossima.id)
    .eq('competition', competizione);

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

  const indice = await indiceFoto();
  const esito = scegliFoto(indice, chi);
  if (!esito.trovata) return null;

  // le misure sono già nell'indice, lette al momento della raccolta: qui
  // non si scarica niente, così comporre la pagina non dipende da un sito
  // che non è nostro
  const riga = indice.find((f) => f.immagine === esito.immagine);
  if (!riga) return null;

  return {
    src: esito.immagine,
    larghezza: riga.larghezza,
    altezza: riga.altezza,
    // all'admin si dice sempre da dove viene: col ripiego sulla squadra la
    // faccia nella foto può essere di un compagno
    provenienza: esito.perche === 'giocatore'
      ? esito.articolo.titolo
      : `(foto della squadra) ${esito.articolo.titolo}`,
    fuoco: 35,
  };
}

/**
 * I gironi di coppa alla fine di questa giornata.
 *
 * Vengono dalla fotografia che la lega pubblica (`standings_snapshots`),
 * non da un conto nostro: sono le stesse righe che i partecipanti hanno
 * sotto gli occhi, e ricalcolarle vorrebbe dire rischiare di scrivere in
 * prima pagina una classifica che non è quella ufficiale.
 */
async function gironiDiCoppa(matchdayId: string): Promise<GironePrima[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('standings_snapshots')
    .select('group_name, team_name, posizione, punti')
    .eq('matchday_id', matchdayId).eq('competition', 'coppa')
    .order('group_name').order('posizione');
  if (!data?.length) return [];

  // `team_name` è il nome scritto dalla lega, e si usa quello: è la fonte,
  // e resta giusto anche se una squadra si rinomina o non la riconosciamo
  const per = new Map<string, GironePrima>();
  for (const r of data) {
    const gruppo = ((r.group_name as string | null) ?? '').trim() || '—';
    if (!per.has(gruppo)) per.set(gruppo, { gruppo, righe: [] });
    per.get(gruppo)!.righe.push({
      nome: r.team_name as string,
      punti: Number(r.punti ?? 0),
    });
  }
  return [...per.values()];
}

/**
 * Il tabellone, dalle semifinali in poi.
 *
 * Le semifinali si giocano su due giornate — andata e ritorno — e tutte e
 * due finiscono qui: sapere solo come è andato il ritorno non dice chi
 * passa. Le sfide ancora da giocare compaiono lo stesso, senza punteggio:
 * una finale annunciata è la cosa più interessante della pagina.
 */
async function tabelloneDiCoppa(
  leagueId: string, nomeDi: Map<string, string>,
): Promise<VoceTabellone[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('fixtures')
    .select('home_team_id, away_team_id, home_goals, away_goals, matchdays!inner(fanta)')
    .eq('league_id', leagueId).eq('competition', 'coppa');

  const righe = (data ?? [])
    .map((f) => ({
      casa: f.home_team_id as string | null,
      ospite: f.away_team_id as string | null,
      gc: f.home_goals as number | null,
      go: f.away_goals as number | null,
      fanta: (f.matchdays as unknown as { fanta: number | null })?.fanta ?? null,
    }))
    .filter((x) => x.casa && x.ospite && x.fanta != null);

  // le giornate con meno di tre partite sono quelle a eliminazione: nella
  // fase a gironi se ne giocano quattro
  const perGiornata = new Map<number, typeof righe>();
  for (const r of righe) {
    const l = perGiornata.get(r.fanta!) ?? [];
    l.push(r); perGiornata.set(r.fanta!, l);
  }

  const voci: VoceTabellone[] = [];
  for (const [fanta, l] of [...perGiornata.entries()].sort((a, b) => a[0] - b[0])) {
    if (l.length >= 3) continue;
    const turno = l.length === 1 ? 'Finale' : `Semifinali · giornata ${fanta}`;
    for (const r of l) {
      const casa = nomeDi.get(r.casa!) ?? '?';
      const ospite = nomeDi.get(r.ospite!) ?? '?';
      const punteggio = r.gc == null || r.go == null ? '' : ` ${r.gc}-${r.go}`;
      voci.push({ turno, testo: `${casa} - ${ospite}${punteggio}` });
    }
  }
  return voci;
}

// =====================================================================
// Il materiale
// =====================================================================

export interface MaterialePrima extends PezziDellaPagina {
  leagueId: string;
  matchdayId: string;
  leciti: Set<number>;
}

export async function materialePrima(
  matchdayId: string, tipo: TipoEdizione = 'settimanale',
): Promise<MaterialePrima> {
  const { leagueId, contesto, richiesta: pezzo } = await costruisciMateriale(matchdayId);
  const competizione: Competizione = tipo === 'coppa' ? 'coppa' : 'campionato';
  const inGara = pezzo.sfide.filter((s) => s.competizione === competizione);
  if (!inGara.length) {
    throw new Error(tipo === 'coppa'
      ? 'questa giornata non ha sfide di coppa con il tabellino'
      : 'la giornata non ha sfide di campionato con il tabellino');
  }

  // i nomi dalle squadre e non dalla classifica: una classifica parziale
  // (o una lega che non l'ha ancora pubblicata) lascerebbe dei «?» nel
  // calendario della prossima giornata
  const { data: squadre } = await supabaseAdmin()
    .from('teams').select('id, name').eq('league_id', leagueId);
  const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));

  const sfide: SfidaPrima[] = inGara.map((s) => ({
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
    tipo,
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

  if (tipo !== 'coppa') {
    return {
      leagueId, matchdayId, richiesta,
      leciti: numeriLeciti(contesto, pezzo.spunti),
      classifica: contesto.classificaDopo.map((c) => ({ nome: c.nome, punti: c.punti })),
      prossimi: await prossimiIncontri(leagueId, pezzo.giornata, nomeDi),
      foto,
      numero: pezzo.giornata,
    };
  }

  const fase = faseDiCoppa(inGara.length);
  const [gironi, tabellone, prossimi, turno] = await Promise.all([
    fase === 'gironi' ? gironiDiCoppa(matchdayId) : Promise.resolve([]),
    fase === 'gironi' ? Promise.resolve([]) : tabelloneDiCoppa(leagueId, nomeDi),
    prossimiIncontri(leagueId, pezzo.giornata, nomeDi, 'coppa'),
    turnoDiCoppa(leagueId, pezzo.giornata),
  ]);

  return {
    leagueId, matchdayId, richiesta,
    leciti: numeriLeciti(contesto, pezzo.spunti),
    // la classifica di campionato resta nei dati ma non si vede: in pagina
    // vincono i gironi o il tabellone
    classifica: contesto.classificaDopo.map((c) => ({ nome: c.nome, punti: c.punti })),
    gironi, tabellone, prossimi, foto,
    numero: turno, fase,
  };
}

/**
 * Che turno di coppa è questo, contando solo le giornate a gironi.
 *
 * Il numero dell'edizione dice «COPPA · 3ª GIORNATA», e la terza giornata
 * di coppa è la terza fra quelle di coppa — non l'ottava di
 * fantacampionato, che al gruppo non direbbe niente.
 */
async function turnoDiCoppa(leagueId: string, fanta: number): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db.from('fixtures')
    .select('matchday_id, matchdays!inner(fanta)')
    .eq('league_id', leagueId).eq('competition', 'coppa')
    .lte('matchdays.fanta', fanta);

  const giornate = new Set(
    (data ?? [])
      .map((f) => (f.matchdays as unknown as { fanta: number | null })?.fanta)
      .filter((x): x is number => x != null),
  );
  return giornate.size;
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
  matchdayId: string, opzioni: { tono?: number; tipo?: TipoEdizione } = {},
): Promise<EsitoGazzetta> {
  const db = supabaseAdmin();
  const materiale = await materialePrima(matchdayId, opzioni.tipo ?? 'settimanale');
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
        const perche = `il modello non ha risposto: ${(e as Error).message}`;
        // nessun testo da correggere: qui il ripiego è l'unica strada
        esito = { ok: false, problemi: [perche], gravi: [perche], inventati: [] };
        testi = null;
      }
    }
  }

  // la rete di sicurezza: asciutta ma corretta, e parte sempre
  // il ripiego scatta solo sui problemi gravi: un errore di forma si
  // corregge nell'editor, e non vale la prosa del modello
  if (!testi || !esito || esito.gravi.length > 0) {
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
  leagueId: string;
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
    leagueId: r.league_id as string,
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

export async function ultimaGazzetta(
  matchdayId: string, tipo: TipoEdizione = 'settimanale',
): Promise<GazzettaSalvata | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('gazzette')
    .select('*').eq('matchday_id', matchdayId).eq('tipo', tipo)
    .order('versione', { ascending: false }).limit(1);
  return data?.[0] ? daRiga(data[0] as Record<string, unknown>) : null;
}

/**
 * L'ultima edizione di mercato della lega.
 *
 * Non è legata a una giornata — `matchday_id` è null — quindi si cerca per
 * tipo e si prende la più recente: nel gruppo si parla dell'ultima uscita di
 * mercato, non di quella della sessione 3.
 */
export async function ultimaGazzettaDiMercato(
  leagueId: string, tipo: 'fantamercato' | 'mercato_chiuso' = 'fantamercato',
): Promise<GazzettaSalvata | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('gazzette')
    .select('*').eq('league_id', leagueId).eq('tipo', tipo)
    .order('generated_at', { ascending: false }).limit(1);
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
