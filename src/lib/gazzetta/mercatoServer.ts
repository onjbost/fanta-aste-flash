import 'server-only';

/**
 * La Gazzetta — dal tabellone d'asta alle indiscrezioni di mercato.
 *
 * Legge una sessione d'asta a chiamate chiuse e ne ricava il materiale per la
 * prima pagina: chi ha chiamato chi, chi si è inserito, quali club non si
 * sono mossi. Poi chiede il pezzo al modello, lo verifica e lo salva come
 * qualunque altra edizione.
 *
 * **Due colonne del database non escono mai da questa funzione**:
 * `lot_participants.budget` e `lot_participants.release_player_id`. Sono i
 * due dati che deciderebbero l'asta se finissero nel gruppo — fin dove può
 * spingersi un avversario, e chi è disposto a sacrificare. Del secondo esce
 * solo il **ruolo**, che basta a far parlare senza scoprire le carte; i nomi
 * finiscono invece nella lista dei vietati, così se il modello ne tira fuori
 * uno il pezzo viene respinto.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { scegliModello } from '@/lib/redazione/modello';
import { cognomeDaListone, scegliFoto } from './news';
import { indiceFoto } from './newsServer';
import { disposizioneFoto, type DatiPrima, type FotoPrima } from './prima';
import {
  costruisciPromptMercato, daJsonMercato, mercatoDiRipiego, montaMercato,
  quandoApreLaSala, trattativaDiApertura, verificaMercato,
  type ClubInCorsa, type EsitoMercato, type RichiestaMercato,
  type TestiMercato, type Trattativa,
} from './mercato';

const MASSIMI_TENTATIVI = 2;

type Ruolo = 'P' | 'D' | 'C' | 'A';

// =====================================================================
// Il materiale
// =====================================================================

export interface MaterialeMercato {
  leagueId: string;
  sessionId: string;
  richiesta: RichiestaMercato;
  foto: FotoPrima | null;
}

/**
 * La foto d'apertura: quella del giocatore conteso.
 *
 * Stessa strada dell'edizione settimanale — prima una sua, poi una della sua
 * squadra di Serie A — e stesse misure già lette al momento della raccolta,
 * così comporre la pagina non tocca la rete.
 */
async function fotoDelConteso(t: Trattativa | null): Promise<FotoPrima | null> {
  if (!t) return null;
  const indice = await indiceFoto();
  const esito = scegliFoto(indice, { cognome: cognomeDaListone(t.giocatore), club: t.club });
  if (!esito.trovata) return null;

  const riga = indice.find((f) => f.immagine === esito.immagine);
  if (!riga) return null;

  return {
    src: esito.immagine,
    larghezza: riga.larghezza,
    altezza: riga.altezza,
    provenienza: esito.perche === 'giocatore'
      ? esito.articolo.titolo
      : `(foto della squadra) ${esito.articolo.titolo}`,
    fuoco: 35,
  };
}

export async function materialeMercato(sessionId: string): Promise<MaterialeMercato> {
  const db = supabaseAdmin();

  const { data: sessione } = await db.from('auction_sessions')
    .select('id, league_id, number, auction_at, status').eq('id', sessionId).maybeSingle();
  if (!sessione) throw new Error('questa sessione non esiste');
  const leagueId = sessione.league_id as string;

  const [{ data: lotti }, { data: squadre }, { data: lega }] = await Promise.all([
    db.from('lots')
      .select('id, player_id, caller_team_id, order_index, status')
      .eq('session_id', sessionId).neq('status', 'cancelled').order('order_index'),
    db.from('teams').select('id, name').eq('league_id', leagueId),
    db.from('leagues').select('redazione_tono, redazione_parole_vietate').eq('id', leagueId).single(),
  ]);

  const nomeDi = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));
  const lottoIds = (lotti ?? []).map((l) => l.id as string);
  if (!lottoIds.length) throw new Error('questa sessione non ha ancora nessuna chiamata');

  const [{ data: iscritti }, { data: giocatori }] = await Promise.all([
    db.from('lot_participants')
      .select('lot_id, team_id, release_player_id, created_at, withdrawn, status')
      .in('lot_id', lottoIds).order('created_at'),
    db.from('players')
      .select('id, name, role, club').eq('league_id', leagueId),
  ]);

  const giocatoreDi = new Map((giocatori ?? []).map((p) => [p.id as string, {
    nome: p.name as string, ruolo: p.role as Ruolo, club: p.club as string,
  }]));

  const vivi = (iscritti ?? []).filter((x) => !x.withdrawn && x.status !== 'cancelled');

  const trattative: Trattativa[] = [];
  const svincolandi = new Set<string>();

  for (const l of lotti ?? []) {
    const chiamato = giocatoreDi.get(l.player_id as string);
    if (!chiamato) continue;

    const suoi = vivi.filter((x) => x.lot_id === l.id);
    const inCorsa: ClubInCorsa[] = suoi.map((x) => {
      const rilasciato = x.release_player_id
        ? giocatoreDi.get(x.release_player_id as string)
        : undefined;
      // il nome del rilasciato NON entra qui: entra nei vietati, più sotto
      if (rilasciato) svincolandi.add(rilasciato.nome);
      return {
        squadra: nomeDi.get(x.team_id as string) ?? '?',
        chiamante: x.team_id === l.caller_team_id,
        ruoloInUscita: rilasciato?.ruolo ?? null,
      };
    });

    trattative.push({
      lottoId: l.id as string,
      giocatore: chiamato.nome, ruolo: chiamato.ruolo, club: chiamato.club,
      inCorsa,
    });
  }

  if (!trattative.length) throw new Error('questa sessione non ha ancora nessuna chiamata');

  // chi non si è mosso: il silenzio è una notizia quanto una chiamata
  const mossi = new Set(trattative.flatMap((t) => t.inCorsa.map((c) => c.squadra)));
  const fermi = [...nomeDi.values()].filter((n) => !mossi.has(n));

  /*
   * I nomi che in pagina non devono comparire: gli svincolandi, e tutti i
   * giocatori di Serie A che non sono in trattativa. I secondi servono
   * perché un pezzo di mercato inventato nomina volentieri un giocatore a
   * caso, e senza questa lista nessuno se ne accorgerebbe.
   */
  const inTrattativa = new Set(trattative.map((t) => t.giocatore));
  const nomiVietati = [
    ...svincolandi,
    ...[...giocatoreDi.values()].map((g) => g.nome).filter((n) => !inTrattativa.has(n)),
  ].filter((n) => !inTrattativa.has(n));

  const apertura = trattativaDiApertura(trattative) ?? trattative[0].lottoId;
  const foto = await fotoDelConteso(trattative.find((t) => t.lottoId === apertura) ?? null);

  return {
    leagueId, sessionId, foto,
    richiesta: {
      tono: Number(lega?.redazione_tono ?? 4),
      sessione: Number(sessione.number),
      quandoSiGioca: quandoApreLaSala(sessione.auction_at as string),
      disposizione: disposizioneFoto(foto),
      trattative, apertura, fermi,
      paroleVietate: (lega?.redazione_parole_vietate as string[] | undefined) ?? [],
      nomiVietati: [...new Set(nomiVietati)],
    },
  };
}

// =====================================================================
// La generazione
// =====================================================================

export interface EsitoMercatoGazzetta {
  gazzettaId: string;
  versione: number;
  provider: 'gemini' | 'template';
  modello: string | null;
  tentativi: number;
  verifica: EsitoMercato;
  dati: DatiPrima;
}

export async function generaGazzettaMercato(
  sessionId: string, opzioni: { tono?: number } = {},
): Promise<EsitoMercatoGazzetta> {
  const db = supabaseAdmin();
  const materiale = await materialeMercato(sessionId);
  const r = materiale.richiesta;
  if (opzioni.tono != null) r.tono = Math.min(5, Math.max(1, opzioni.tono));

  const modello = scegliModello();
  let testi: TestiMercato | null = null;
  let esito: EsitoMercato | null = null;
  let usato: 'gemini' | 'template' = modello ? 'gemini' : 'template';
  let nomeModello = modello?.modello ?? null;
  let tentativi = 0;

  if (modello) {
    for (let i = 0; i < MASSIMI_TENTATIVI; i++) {
      tentativi++;
      try {
        const candidato = daJsonMercato(await modello.chiedi(costruisciPromptMercato(r)));
        const v = verificaMercato(candidato, r);
        testi = candidato; esito = v;
        if (v.ok) break;
        r.correzioni = v.problemi;
      } catch (e) {
        const perche = `il modello non ha risposto: ${(e as Error).message}`;
        // nessun testo da correggere: qui il ripiego è l'unica strada
        esito = { ok: false, problemi: [perche], gravi: [perche], inventati: [] };
        testi = null;
      }
    }
  }

  // il ripiego scatta solo sui problemi gravi: un errore di forma si
  // corregge nell'editor, e non vale la prosa del modello
  if (!testi || !esito || esito.gravi.length > 0) {
    const ripiego = mercatoDiRipiego(r);
    const v = verificaMercato(ripiego, r);
    const prima = esito?.problemi ?? [];
    testi = ripiego;
    usato = 'template'; nomeModello = null;
    esito = { ...v, problemi: [...prima, ...v.problemi] };
  }

  const dati = montaMercato(testi, { richiesta: r, foto: materiale.foto });

  /*
   * `matchday_id` resta null: l'edizione di mercato non è legata a una
   * giornata. Il trigger delle versioni confronta la giornata con
   * `is not distinct from`, quindi tutte le edizioni fantamercato di questa
   * lega si numerano in una serie sola — che è quello che si vuole, perché
   * nel gruppo si parla della «terza di mercato», non della sessione 3.
   */
  const { data, error } = await db.from('gazzette').insert({
    league_id: materiale.leagueId, matchday_id: null,
    tipo: 'fantamercato', dati, verifica: { ...esito, tentativi },
    provider: usato, model: nomeModello,
  }).select('id, versione').single();
  if (error) throw new Error(`non sono riuscito a salvare la gazzetta: ${error.message}`);

  return {
    gazzettaId: data.id as string, versione: data.versione as number,
    provider: usato, modello: nomeModello, tentativi, verifica: esito, dati,
  };
}
