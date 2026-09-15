import 'server-only';

/**
 * L'anteprima di giornata — dal database al messaggio pronto.
 *
 * Stesso ciclo del pezzo di fine giornata: prova · se la verifica boccia,
 * riprova dicendo al modello cosa non andava · se boccia ancora, si manda la
 * versione a template. Meglio un annuncio asciutto che nessun annuncio, e
 * meglio nessun numero inventato che una battuta in più.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { dateTime } from '@/lib/messages';
import { scegliModello } from './modello';
import {
  anteprimaDiRipiego, classificaScontro, costruisciPromptAnteprima, daJsonAnteprima,
  montaAnteprima, verificaAnteprima,
  type Anteprima, type RichiestaAnteprima, type RigaAnteprima, type SfidaDaPresentare,
} from './anteprima';

const MASSIMI_TENTATIVI = 2;

/**
 * La classifica ufficiale più recente che abbiamo archiviato.
 *
 * Quella della lega, non la nostra: penalità e punti extra li applica lei e
 * noi non li vediamo. Se non c'è nessuna fotografia — inizio stagione, o
 * import fatti prima che imparassimo a prenderla — si torna a mani vuote e
 * il messaggio semplicemente non parla di classifica, invece di inventarne
 * una che non coincide con quella che tutti hanno sotto gli occhi.
 */
async function classificaUfficiale(leagueId: string, serieA: number): Promise<RigaAnteprima[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('standings_snapshots')
    .select('team_name, posizione, punti, matchdays!inner(serie_a)')
    .eq('league_id', leagueId)
    .eq('competition', 'campionato')
    .eq('group_name', '')
    .lt('matchdays.serie_a', serieA);
  if (!data?.length) return [];

  const righe = data.map((r) => {
    const x = r as unknown as Record<string, unknown>;
    return {
      serieA: Number((x.matchdays as { serie_a: number }).serie_a),
      nome: String(x.team_name),
      posizione: Number(x.posizione),
      punti: Number(x.punti ?? 0),
    };
  });

  const ultima = Math.max(...righe.map((r) => r.serieA));
  return righe.filter((r) => r.serieA === ultima)
    .sort((a, b) => a.posizione - b.posizione)
    .map(({ nome, posizione, punti }) => ({ nome, posizione, punti }));
}

export interface MaterialeAnteprima {
  leagueId: string;
  richiesta: RichiestaAnteprima;
}

export async function costruisciMaterialeAnteprima(matchdayId: string): Promise<MaterialeAnteprima> {
  const db = supabaseAdmin();

  const { data: md } = await db.from('matchdays')
    .select('id, league_id, fanta, serie_a, lock_at').eq('id', matchdayId).single();
  if (!md) throw new Error('giornata inesistente');
  const leagueId = md.league_id as string;
  const serieA = Number(md.serie_a);

  const [{ data: lega }, { data: fx }, classifica, { data: tip }] = await Promise.all([
    db.from('leagues')
      .select('redazione_tono, redazione_parole_vietate').eq('id', leagueId).single(),
    db.from('fixtures')
      .select('id, competition, group_name, casa:home_team_id(name), ospite:away_team_id(name)')
      .eq('matchday_id', matchdayId),
    classificaUfficiale(leagueId, serieA),
    db.from('v_tipster_classifica')
      .select('team_name, punti').eq('league_id', leagueId).order('punti', { ascending: false }),
  ]);

  const sfideRighe = (fx ?? []).filter((f) => {
    const x = f as unknown as Record<string, unknown>;
    return x.casa && x.ospite;                 // semifinali ancora vuote: fuori
  });

  const { data: quoteRighe } = sfideRighe.length
    ? await db.from('odds')
      .select('fixture_id, selection, price')
      .in('fixture_id', sfideRighe.map((f) => (f as unknown as { id: string }).id))
      .eq('market', '1x2')
    : { data: [] as never[] };

  const posDi = new Map(classifica.map((c) => [c.nome, c.posizione]));

  const sfide: SfidaDaPresentare[] = sfideRighe.map((f) => {
    const x = f as unknown as Record<string, unknown>;
    const id = String(x.id);
    const casa = String((x.casa as { name: string }).name);
    const ospite = String((x.ospite as { name: string }).name);

    const mie = (quoteRighe ?? []).filter((q) => (q as { fixture_id: string }).fixture_id === id);
    const prezzo = (sel: string) => {
      const q = mie.find((r) => (r as { selection: string }).selection === sel);
      return q ? Number((q as { price: number }).price) : null;
    };
    const uno = prezzo('1');
    const due = prezzo('2');
    // favorita è chi paga meno: se una delle due manca, non si indovina
    const favorita = uno != null && due != null
      ? (uno <= due ? casa : ospite)
      : null;

    const posCasa = posDi.get(casa) ?? null;
    const posOspite = posDi.get(ospite) ?? null;

    return {
      fixtureId: id, casa, ospite,
      competizione: x.competition as 'campionato' | 'coppa',
      gruppo: (x.group_name as string | null) || null,
      posCasa, posOspite,
      favorita,
      quotaFavorita: favorita == null ? null : Math.min(uno!, due!),
      quotaPari: prezzo('X'),
      // gli scontri caldi valgono solo in campionato: in coppa la classifica
      // che conta è quella del girone, e quella qui non la guardiamo
      scontro: x.competition === 'coppa'
        ? null
        : classificaScontro(posCasa, posOspite, classifica.length),
    };
  });

  const tipster = (tip ?? []).map((t, i) => ({
    nome: String((t as { team_name: string }).team_name),
    punti: Math.round(Number((t as { punti: number }).punti ?? 0) * 10) / 10,
    posizione: i + 1,
  }));

  return {
    leagueId,
    richiesta: {
      giornata: Number(md.fanta ?? 0),
      serieA,
      tono: Number(lega?.redazione_tono ?? 4),
      paroleVietate: (lega?.redazione_parole_vietate as string[] | undefined) ?? [],
      chiusura: dateTime(String(md.lock_at)),
      classifica, sfide, tipster,
    },
  };
}

export interface EsitoAnteprimaGenerata {
  testo: string;
  provider: 'gemini' | 'template';
  tentativi: number;
  problemi: string[];
}

export async function generaAnteprima(matchdayId: string): Promise<EsitoAnteprimaGenerata> {
  const { richiesta } = await costruisciMaterialeAnteprima(matchdayId);
  if (!richiesta.sfide.length) throw new Error('la giornata non ha sfide da presentare');

  const modello = scegliModello();
  let pezzo: Anteprima | null = null;
  let problemi: string[] = [];
  let tentativi = 0;

  if (modello) {
    for (let i = 0; i < MASSIMI_TENTATIVI; i++) {
      tentativi++;
      try {
        const candidato = daJsonAnteprima(await modello.chiedi(costruisciPromptAnteprima(richiesta)));
        const v = verificaAnteprima(candidato, richiesta);
        pezzo = candidato;
        problemi = v.problemi;
        if (v.ok) break;
        richiesta.correzioni = v.problemi;   // seconda passata: gli si dice cosa non andava
      } catch (e) {
        problemi = [`il modello non ha risposto: ${(e as Error).message}`];
        pezzo = null;
      }
    }
  }

  const buono = pezzo && verificaAnteprima(pezzo, richiesta).ok;
  if (!buono) {
    pezzo = anteprimaDiRipiego(richiesta);
    return {
      testo: montaAnteprima(pezzo, richiesta),
      provider: 'template', tentativi, problemi,
    };
  }

  return { testo: montaAnteprima(pezzo!, richiesta), provider: 'gemini', tentativi, problemi: [] };
}
