import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { costruisciMateriale } from '@/lib/redazione/redazioneServer';
import { supabaseAdmin } from '@/lib/supabase';
import { TopBar } from '../../TopBar';
import {
  AzioniImport, Giornata, Impostazioni, Preferito, SchedaFlavour,
  type ArticoloVista, type GiornataVista, type ImportVista, type SfidaVista,
} from './Pannelli';

export const dynamic = 'force-dynamic';

interface RigaTabellino {
  fixture_id: string; team_id: string; starter: boolean;
  counted: boolean; entered: boolean; player_id: string | null;
}

function quando(iso: string) {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });
}

export default async function AdminRedazionePage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const lega = ctx.team.leagueId;

  const [{ data: grezzi }, { data: articoli }, { data: impostazioni },
    { data: squadre }, { data: flavour }] = await Promise.all([
    db.from('redazione_imports')
      .select('id, giornata, stato, conti_ok, conti_totali, errore, ricevuto_il, matchday_id')
      .eq('league_id', lega).order('ricevuto_il', { ascending: false }).limit(40),
    db.from('news_articles')
      .select('id, matchday_id, versione, provider, model, tono, testo, generated_at, sent_at, verifica')
      .eq('league_id', lega).order('versione', { ascending: false }).limit(80),
    db.from('leagues')
      .select('redazione_tono, redazione_min_parole, redazione_parole_vietate').eq('id', lega).single(),
    db.from('teams').select('id, name, manager_name').eq('league_id', lega).order('name'),
    db.from('team_flavour').select('*').eq('league_id', lega),
  ]);

  const tono = Number(impostazioni?.redazione_tono ?? 4);
  const minParole = Number(impostazioni?.redazione_min_parole ?? 150);
  const vietate = (impostazioni?.redazione_parole_vietate as string[] | undefined) ?? [];
  const flavourDi = new Map((flavour ?? []).map((f) => [f.team_id as string, f]));

  // ---- le giornate di cui abbiamo qualcosa: un import o un articolo
  const idGiornate = [...new Set([
    ...(grezzi ?? []).map((i) => i.matchday_id as string | null),
    ...(articoli ?? []).map((a) => a.matchday_id as string | null),
  ].filter((x): x is string => !!x))];

  const orfani = (grezzi ?? []).filter((i) => !i.matchday_id);

  let giornate: GiornataVista[] = [];

  if (idGiornate.length) {
    const { data: md } = await db.from('matchdays')
      .select('id, fanta, serie_a, match_date').in('id', idGiornate).order('serie_a', { ascending: false });

    const { data: fx } = await db.from('fixtures')
      .select(`id, matchday_id, home_goals, away_goals, home_fp, away_fp,
               home_modulo, away_modulo, home_team_id, away_team_id,
               casa:home_team_id(name), ospite:away_team_id(name)`)
      .in('matchday_id', idGiornate).not('tabellino_at', 'is', null);

    const idSfide = (fx ?? []).map((f) => f.id as string);
    const { data: le } = idSfide.length
      ? await db.from('lineup_entries')
        .select('fixture_id, team_id, starter, counted, entered, player_id').in('fixture_id', idSfide)
      : { data: [] as RigaTabellino[] };
    const righe = (le ?? []) as RigaTabellino[];

    /** Quanti giocatori, quanti agganciati, quanti subentri, e se si è giocato in dieci. */
    function riepilogo(fixtureId: string): Omit<SfidaVista, 'id' | 'casa' | 'ospite' | 'golCasa' | 'golOspite' | 'fpCasa' | 'fpOspite' | 'moduloCasa' | 'moduloOspite'> {
      const mie = righe.filter((r) => r.fixture_id === fixtureId);
      const entrati = mie.filter((r) => r.entered).length;
      return {
        giocatori: mie.length,
        agganciati: mie.filter((r) => r.player_id).length,
        subentri: entrati,
        // un titolare che non ha contato e non è stato rilevato: si è giocato in dieci
        inDieci: mie.filter((r) => r.starter && !r.counted).length - entrati,
      };
    }

    giornate = (md ?? []).map((m) => {
      const id = m.id as string;
      const sfide: SfidaVista[] = (fx ?? [])
        .filter((f) => f.matchday_id === id)
        .map((f) => {
          const r = f as unknown as Record<string, unknown>;
          return {
            id: r.id as string,
            casa: (r.casa as { name: string } | null)?.name ?? '?',
            ospite: (r.ospite as { name: string } | null)?.name ?? '?',
            golCasa: r.home_goals as number | null, golOspite: r.away_goals as number | null,
            fpCasa: r.home_fp as number | null, fpOspite: r.away_fp as number | null,
            moduloCasa: r.home_modulo as string | null, moduloOspite: r.away_modulo as string | null,
            ...riepilogo(r.id as string),
          };
        });

      const imports: ImportVista[] = (grezzi ?? [])
        .filter((i) => i.matchday_id === id)
        .map((i) => ({
          id: i.id as string, stato: i.stato as string,
          contiOk: i.conti_ok as number | null, contiTotali: i.conti_totali as number | null,
          errore: i.errore as string | null, ricevutoIl: i.ricevuto_il as string,
        }));

      const suoi: ArticoloVista[] = (articoli ?? [])
        .filter((a) => a.matchday_id === id)
        .map((a) => {
          const v = a.verifica as { problemi?: string[] } | null;
          return {
            id: a.id as string, versione: a.versione as number,
            provider: a.provider as string, model: a.model as string | null,
            tono: a.tono as number, testo: a.testo as string,
            generatoIl: a.generated_at as string, inviatoIl: a.sent_at as string | null,
            problemi: v?.problemi ?? [],
          };
        })
        .sort((x, y) => y.versione - x.versione);

      return {
        matchdayId: id,
        fanta: (m.fanta as number | null) ?? null,
        serieA: Number(m.serie_a),
        dataPartita: m.match_date as string,
        sfide, imports, articoli: suoi,
        spunti: null, erroreSpunti: null,
      };
    });

    // Gli spunti si contano solo per la giornata che si apre da sola: è una
    // passata completa sul database, e farla per tutte e trentasette
    // renderebbe la pagina lenta per un'informazione che nessuno guarda.
    const prima = giornate.find((g) => g.sfide.length);
    if (prima) {
      try {
        const m = await costruisciMateriale(prima.matchdayId);
        prima.spunti = m.richiesta.spunti.length;
      } catch (e) {
        prima.erroreSpunti = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const sito = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
  const segreto = process.env.REDAZIONE_IMPORT_SECRET ?? null;
  const modello = process.env.GEMINI_API_KEY ? (process.env.GEMINI_MODEL || 'gemini-flash-latest') : null;
  const daAprire = giornate.find((g) => g.sfide.length)?.matchdayId ?? giornate[0]?.matchdayId;

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Admin · la redazione</p>
      <h1>La giornata, raccontata</h1>
      <p className="sub">
        Importi il tabellino dalla lega, l&apos;app trova gli spunti e scrive il pezzo.
        Niente parte senza che tu l&apos;abbia letto.
      </p>

      <div className="filters" style={{ marginTop: 0 }}>
        <a className="btn" href="/admin">Pannello admin</a>
        <a className="btn" href="/admin/schedine">Tipster</a>
        <a className="btn" href="/admin/messaggi">Centro messaggi</a>
      </div>

      {!modello && (
        <div className="callout">
          <b>GEMINI_API_KEY non è configurata.</b> Il pezzo si scrive lo stesso, con i
          template di riserva: corretto ma asciutto. La chiave si prende gratis su
          Google AI Studio e va messa fra le variabili su Vercel.
        </div>
      )}

      <details className="panel giornata" style={{ marginBottom: 16 }}>
        <summary>
          <div className="giornata-riga">
            <span className="giornata-n">Il preferito</span>
            <span className="giornata-meta">
              {segreto ? 'pronto da trascinare nella barra' : 'manca la parola d’ordine'}
            </span>
          </div>
        </summary>
        <div className="giornata-corpo"><Preferito sito={sito} segreto={segreto} /></div>
      </details>

      <h2>Le giornate</h2>
      {giornate.length === 0 ? (
        <div className="panel"><div className="empty">
          Nessuna giornata ancora. Installa il preferito qui sopra, apri una giornata
          conclusa sulla lega e cliccalo.
        </div></div>
      ) : (
        giornate.map((g) => (
          <Giornata key={g.matchdayId} g={g} tonoBase={tono}
            apertaDiDefault={g.matchdayId === daAprire} />
        ))
      )}

      {orfani.length > 0 && (
        <>
          <h2>Invii non riconosciuti</h2>
          <p className="sub">
            Sono arrivati ma non si è capito a quale giornata appartenessero. Il grezzo
            è salvato: si corregge il codice e si preme <b>Rifai</b>.
          </p>
          <div className="panel" style={{ padding: '4px 16px 12px' }}>
            {orfani.map((i) => (
              <div key={i.id as string} style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                padding: '10px 0', borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '.86rem', whiteSpace: 'nowrap' }}>
                  {quando(i.ricevuto_il as string)}
                </span>
                <span style={{ fontSize: '.82rem', color: 'var(--muted)', flex: 1, minWidth: 160 }}>
                  {(i.errore as string | null) ?? 'senza giornata'}
                </span>
                <AzioniImport importId={i.id as string} stato={i.stato as string} />
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Come deve scrivere</h2>
      <details className="panel giornata" style={{ marginBottom: 10 }}>
        <summary>
          <div className="giornata-riga">
            <span className="giornata-n">Impostazioni</span>
            <span className="giornata-meta">
              tono {tono}/5 · minimo {minParole} parole per sfida
              {vietate.length > 0 && ` · ${vietate.length} parole vietate`}
            </span>
          </div>
        </summary>
        <div className="giornata-corpo">
          <Impostazioni tono={tono} minParole={minParole} vietate={vietate} />
        </div>
      </details>

      <h2>Le schede delle squadre</h2>
      <p className="sub">
        È quello che fa la differenza fra un pezzo generico e uno che sembra scritto da
        uno della lega. Dieci minuti, una volta sola.
      </p>
      {(squadre ?? []).map((t) => {
        const fl = flavourDi.get(t.id as string);
        return (
          <SchedaFlavour key={t.id as string} squadra={{
            teamId: t.id as string, nome: t.name as string,
            allenatore: (t.manager_name as string | null) ?? null,
            soprannomi: (fl?.soprannomi as string[] | undefined) ?? [],
            tormentoni: (fl?.tormentoni as string | null) ?? null,
            puntiDeboli: (fl?.punti_deboli as string | null) ?? null,
            intoccabile: (fl?.intoccabile as string | null) ?? null,
          }} />
        );
      })}
    </div>
  );
}
