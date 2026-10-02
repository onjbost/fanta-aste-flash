import Link from 'next/link';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { squadreDellaLega, ultimeClassifiche, type RigaClassifica, type Squadra } from '@/lib/homeServer';
import { TopBar } from '../TopBar';
import { Stemma } from '../Stemma';

export const dynamic = 'force-dynamic';

type Vista = 'campionato' | 'coppa' | 'tipster';

const VISTE: { key: Vista; label: string }[] = [
  { key: 'campionato', label: 'Campionato' },
  { key: 'coppa', label: 'Coppa Mansarda' },
  { key: 'tipster', label: 'Tipster' },
];

const n = (v: number | null) => (v === null ? '—' : String(v));
const segno = (v: number | null) => (v === null ? '—' : v > 0 ? `+${v}` : String(v));
const fp = (v: number | null) => (v === null ? '—' : v.toFixed(1));

function Squadra({ nome, stemma }: { nome: string; stemma: string | null }) {
  return <span className="squadra-cella"><Stemma nome={nome} url={stemma} size={24} /><span>{nome}</span></span>;
}

/**
 * La tabella di una competizione della lega, come la scrive Leghe Fantacalcio.
 * In vista le colonne che contano (V, N, P, differenza, punti); fantapunti e
 * gol scorrono di lato, per chi li cerca.
 */
function Tabella({ righe, mia, squadre }: { righe: RigaClassifica[]; mia: string; squadre: Map<string, Squadra> }) {
  return (
    <div className="panel classifica">
      <div className="tablewrap">
        <table style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>#</th><th>Squadra</th>
              <th className="num">V</th><th className="num">N</th><th className="num">P</th>
              <th className="num">DR</th><th className="num">Pt</th>
              <th className="num">FP</th><th className="num">GF</th><th className="num">GS</th><th className="num">G</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.nome} className={r.teamId === mia ? 'mia' : undefined}
                  aria-current={r.teamId === mia ? 'true' : undefined}>
                <td className="pos">{r.posizione}</td>
                <td><Squadra nome={r.nome} stemma={r.teamId ? squadre.get(r.teamId)?.stemma ?? null : null} /></td>
                <td className="num">{n(r.vinte)}</td>
                <td className="num">{n(r.pari)}</td>
                <td className="num">{n(r.perse)}</td>
                <td className="num">{segno(r.differenza)}</td>
                <td className="num pt">{n(r.punti)}</td>
                <td className="num">{fp(r.fantapunti)}</td>
                <td className="num">{n(r.golFatti)}</td>
                <td className="num">{n(r.golSubiti)}</td>
                <td className="num">{n(r.giocate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function Tipster({ mia, leagueId, squadre }: { mia: string; leagueId: string; squadre: Map<string, Squadra> }) {
  // stessa lettura della classifica che stava nelle schedine: la vista somma
  // le giocate di tutti, e le policy lascerebbero vedere solo le proprie
  const { data } = await supabaseAdmin().from('v_tipster_classifica').select('*').eq('league_id', leagueId);
  type Riga = { team_id: string; team_name: string; punti: number; giocate: number; azzeccate: number };
  const righe = ((data ?? []) as unknown as Riga[]).sort((a, b) => Number(b.punti) - Number(a.punti));
  if (!righe.length) return <div className="panel"><div className="empty">Ancora nessuna giornata giocata.</div></div>;

  return (
    <div className="panel classifica">
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>#</th><th>Squadra</th><th className="num">Giocate</th><th className="num">Prese</th><th className="num">Punti</th></tr>
          </thead>
          <tbody>
            {righe.map((r, i) => (
              <tr key={r.team_id} className={r.team_id === mia ? 'mia' : undefined}
                  aria-current={r.team_id === mia ? 'true' : undefined}>
                <td className="pos">{i + 1}</td>
                <td><Squadra nome={r.team_name} stemma={squadre.get(r.team_id)?.stemma ?? null} /></td>
                <td className="num">{r.giocate}</td>
                <td className="num">{r.azzeccate}</td>
                <td className="num pt">{Number(r.punti).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Le classifiche della lega in una pagina sola: campionato, Coppa Mansarda
 * (un girone per volta) e Torneo dei Tipster. Ci si arriva dalla Home — sulla
 * competizione della slide che stavi guardando — e dalle Schedine.
 */
export default async function ClassificaPage({
  searchParams,
}: { searchParams: Promise<{ c?: string; g?: string; da?: string }> }) {
  const ctx = await requireTeamContext();
  const sp = await searchParams;
  const vista: Vista = sp.c === 'coppa' || sp.c === 'tipster' ? sp.c : 'campionato';
  const [cl, squadre] = await Promise.all([ultimeClassifiche(ctx.team.leagueId), squadreDellaLega(ctx.team.leagueId)]);

  const gironi = Object.keys(cl.coppa.gironi).sort();
  // il girone di partenza è quello della propria squadra
  const mioGirone = gironi.find((g) => cl.coppa.gironi[g].some((r) => r.teamId === ctx.team.id));
  const girone = sp.g && gironi.includes(sp.g) ? sp.g : mioGirone ?? gironi[0];
  const indietro = sp.da === 'schedine' ? '/schedine' : '/';
  const qs = (c: Vista, g?: string) =>
    `/classifica?c=${c}${g ? `&g=${g}` : ''}${sp.da ? `&da=${sp.da}` : ''}`;

  const giornata = vista === 'campionato' ? cl.campionato.giornata : vista === 'coppa' ? cl.coppa.giornata : null;

  return (
    <div className="shell pieno">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="classifica" pieno indietro={indietro} />

      <h1>Classifica</h1>

      <nav className="tabs" aria-label="Competizione">
        {VISTE.map((v) => (
          <Link key={v.key} href={qs(v.key)} className={v.key === vista ? 'on' : ''}
                aria-current={v.key === vista ? 'page' : undefined}>
            {v.label}
          </Link>
        ))}
      </nav>

      {vista === 'campionato' && (cl.campionato.righe.length
        ? <Tabella righe={cl.campionato.righe} mia={ctx.team.id} squadre={squadre} />
        : <div className="panel"><div className="empty">La classifica arriva col primo import della giornata.</div></div>)}

      {vista === 'coppa' && (gironi.length ? (
        <>
          {gironi.length > 1 && (
            <div className="chips" role="group" aria-label="Girone">
              {gironi.map((g) => (
                <Link key={g} href={qs('coppa', g)} className="chip" aria-current={g === girone ? 'page' : undefined}>
                  {g === '—' ? 'Fase finale' : `Girone ${g}`}
                </Link>
              ))}
            </div>
          )}
          <Tabella righe={cl.coppa.gironi[girone!]} mia={ctx.team.id} squadre={squadre} />
        </>
      ) : <div className="panel"><div className="empty">La coppa non ha ancora una classifica.</div></div>)}

      {vista === 'tipster' && <Tipster mia={ctx.team.id} leagueId={ctx.team.leagueId} squadre={squadre} />}

      {giornata !== null && (
        <p className="classifica-nota">Aggiornata alla {giornata}ª giornata di Serie A · scorri di lato per fantapunti e gol</p>
      )}
    </div>
  );
}
