import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { costruisciMateriale } from '@/lib/redazione/redazioneServer';
import { supabaseAdmin } from '@/lib/supabase';
import { TopBar } from '../../TopBar';
import { Articolo, AzioniImport, Impostazioni, Preferito, SchedaFlavour, Scrittura } from './Pannelli';

export const dynamic = 'force-dynamic';

const STATO: Record<string, { testo: string; critico: boolean }> = {
  ricevuto: { testo: 'ricevuto, non scritto', critico: true },
  importato: { testo: 'importato', critico: false },
  scartato: { testo: 'messo da parte', critico: true },
};

interface RigaImport {
  id: string; giornata: number | null; stato: string;
  conti_ok: number | null; conti_totali: number | null;
  errore: string | null; ricevuto_il: string; matchday_id: string | null;
}

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

  const [{ data: grezzi }, { data: lega }, { data: squadre }, { data: flavour }] = await Promise.all([
    db.from('redazione_imports')
      .select('id, giornata, stato, conti_ok, conti_totali, errore, ricevuto_il, matchday_id')
      .eq('league_id', ctx.team.leagueId).order('ricevuto_il', { ascending: false }).limit(20),
    db.from('leagues')
      .select('redazione_tono, redazione_min_parole, redazione_parole_vietate')
      .eq('id', ctx.team.leagueId).single(),
    db.from('teams').select('id, name, manager_name').eq('league_id', ctx.team.leagueId).order('name'),
    db.from('team_flavour').select('*').eq('league_id', ctx.team.leagueId),
  ]);

  const imports = (grezzi ?? []) as RigaImport[];
  const ultimo = imports.find((i) => i.stato === 'importato' && i.matchday_id);
  const flavourDi = new Map((flavour ?? []).map((f) => [f.team_id as string, f]));

  const tono = Number(lega?.redazione_tono ?? 4);
  const minParole = Number(lega?.redazione_min_parole ?? 150);
  const vietate = (lega?.redazione_parole_vietate as string[] | undefined) ?? [];

  // ---- la giornata importata, com'è andata
  let sfide: {
    id: string; casa: string; ospite: string; golCasa: number | null; golOspite: number | null;
    fpCasa: number | null; fpOspite: number | null; moduloCasa: string | null; moduloOspite: string | null;
    casaId: string; ospiteId: string;
  }[] = [];
  let righe: RigaTabellino[] = [];
  let giornataFanta: number | null = null;
  let spunti = 0;
  let erroreSpunti: string | null = null;
  let articoli: {
    id: string; versione: number; provider: string; model: string | null; tono: number;
    testo: string; generatoIl: string; inviatoIl: string | null; problemi: string[];
  }[] = [];

  if (ultimo?.matchday_id) {
    const [{ data: md }, { data: fx }, { data: art }] = await Promise.all([
      db.from('matchdays').select('fanta').eq('id', ultimo.matchday_id).maybeSingle(),
      db.from('fixtures')
        .select(`id, home_goals, away_goals, home_fp, away_fp, home_modulo, away_modulo,
                 home_team_id, away_team_id, casa:home_team_id(name), ospite:away_team_id(name)`)
        .eq('matchday_id', ultimo.matchday_id).not('tabellino_at', 'is', null),
      db.from('news_articles')
        .select('id, versione, provider, model, tono, testo, generated_at, sent_at, verifica')
        .eq('matchday_id', ultimo.matchday_id).order('versione', { ascending: false }).limit(6),
    ]);
    giornataFanta = (md?.fanta as number | null) ?? null;

    sfide = (fx ?? []).map((f) => {
      const r = f as unknown as Record<string, unknown>;
      return {
        id: r.id as string,
        casa: (r.casa as { name: string } | null)?.name ?? '?',
        ospite: (r.ospite as { name: string } | null)?.name ?? '?',
        golCasa: r.home_goals as number | null, golOspite: r.away_goals as number | null,
        fpCasa: r.home_fp as number | null, fpOspite: r.away_fp as number | null,
        moduloCasa: r.home_modulo as string | null, moduloOspite: r.away_modulo as string | null,
        casaId: r.home_team_id as string, ospiteId: r.away_team_id as string,
      };
    });

    if (sfide.length) {
      const { data: le } = await db.from('lineup_entries')
        .select('fixture_id, team_id, starter, counted, entered, player_id')
        .in('fixture_id', sfide.map((s) => s.id));
      righe = (le ?? []) as RigaTabellino[];
    }

    articoli = (art ?? []).map((a) => {
      const v = a.verifica as { problemi?: string[] } | null;
      return {
        id: a.id as string, versione: a.versione as number,
        provider: a.provider as string, model: a.model as string | null,
        tono: a.tono as number, testo: a.testo as string,
        generatoIl: a.generated_at as string, inviatoIl: a.sent_at as string | null,
        problemi: v?.problemi ?? [],
      };
    });

    // il conteggio degli spunti è utile prima di generare: dice se la giornata
    // ha materiale o se il pezzo verrà per forza piatto
    try {
      const m = await costruisciMateriale(ultimo.matchday_id);
      spunti = m.richiesta.spunti.length;
    } catch (e) {
      erroreSpunti = e instanceof Error ? e.message : String(e);
    }
  }

  function riepilogo(fixtureId: string, teamId: string) {
    const mie = righe.filter((r) => r.fixture_id === fixtureId && r.team_id === teamId);
    return {
      totale: mie.length,
      entrati: mie.filter((r) => r.entered).length,
      fuori: mie.filter((r) => r.starter && !r.counted).length - mie.filter((r) => r.entered).length,
      agganciati: mie.filter((r) => r.player_id).length,
    };
  }

  const sito = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
  const segreto = process.env.REDAZIONE_IMPORT_SECRET ?? null;
  const modello = process.env.GEMINI_API_KEY ? (process.env.GEMINI_MODEL || 'gemini-flash-latest') : null;

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

      <h2>Il preferito</h2>
      <Preferito sito={sito} segreto={segreto} />

      {ultimo && sfide.length > 0 && (
        <>
          <h2>Giornata {giornataFanta ?? ultimo.giornata}</h2>
          <p className="sub">
            Importata {quando(ultimo.ricevuto_il)} · {ultimo.conti_ok}/{ultimo.conti_totali} sfide
          </p>

          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Sfida</th>
                    <th className="num">Risultato</th>
                    <th className="num">Fantapunti</th>
                    <th>Moduli</th>
                    <th>Tabellino</th>
                  </tr>
                </thead>
                <tbody>
                  {sfide.map((s) => {
                    const c = riepilogo(s.id, s.casaId);
                    const o = riepilogo(s.id, s.ospiteId);
                    return (
                      <tr key={s.id}>
                        <td>{s.casa} – {s.ospite}</td>
                        <td className="num">{s.golCasa}-{s.golOspite}</td>
                        <td className="num">{s.fpCasa} · {s.fpOspite}</td>
                        <td className="mono" style={{ fontSize: '.8rem' }}>
                          {s.moduloCasa ?? '—'} · {s.moduloOspite ?? '—'}
                        </td>
                        <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                          {c.totale + o.totale} giocatori · {c.agganciati + o.agganciati} agganciati
                          {(c.entrati + o.entrati) > 0 && <> · {c.entrati + o.entrati} subentri</>}
                          {(c.fuori + o.fuori) > 0 && (
                            <span style={{ color: 'var(--crit)' }}> · {c.fuori + o.fuori} in dieci</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <h2>Il pezzo</h2>
          {erroreSpunti ? (
            <div className="callout crit">Non riesco a preparare il materiale: {erroreSpunti}</div>
          ) : (
            <Scrittura matchdayId={ultimo.matchday_id!} tonoBase={tono} spunti={spunti} />
          )}

          {articoli.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {articoli.map((a) => <Articolo key={a.id} articolo={a} />)}
            </div>
          )}
        </>
      )}

      <h2>Gli import ricevuti</h2>
      {imports.length === 0 ? (
        <div className="panel"><div className="empty">
          Nessun import ancora. Installa il preferito qui sopra, apri una giornata
          conclusa sulla lega e cliccalo.
        </div></div>
      ) : (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th className="num">Giornata</th>
                  <th>Stato</th>
                  <th className="num">Sfide</th>
                  <th>Problema</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => {
                  const s = STATO[i.stato] ?? { testo: i.stato, critico: true };
                  return (
                    <tr key={i.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{quando(i.ricevuto_il)}</td>
                      <td className="num">{i.giornata ?? '—'}</td>
                      <td style={{ color: s.critico ? 'var(--crit)' : undefined }}>{s.testo}</td>
                      <td className="num">
                        {i.conti_totali == null ? '—' : `${i.conti_ok ?? 0}/${i.conti_totali}`}
                      </td>
                      <td style={{ fontSize: '.82rem', color: 'var(--muted)', maxWidth: 240 }}>
                        {i.errore ?? '—'}
                      </td>
                      <td><AzioniImport importId={i.id} stato={i.stato} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2>Come deve scrivere</h2>
      <Impostazioni tono={tono} minParole={minParole} vietate={vietate} />

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
