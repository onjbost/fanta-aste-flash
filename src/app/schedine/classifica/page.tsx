import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { TopBar } from '../../TopBar';

export const dynamic = 'force-dynamic';

export default async function ClassificaPage() {
  const ctx = await requireTeamContext();
  const db = supabaseAdmin();

  const [{ data: generale }, { data: perGiornata }] = await Promise.all([
    db.from('v_tipster_classifica').select('*').eq('league_id', ctx.team.leagueId),
    db.from('v_tipster_giornata').select('*').eq('league_id', ctx.team.leagueId),
  ]);

  type Riga = {
    team_id: string; team_name: string; punti: number;
    giornate: number; giocate: number; azzeccate: number; media_giornata: number;
  };
  type RigaG = {
    team_id: string; team_name: string; fanta: number; serie_a: number;
    punti: number; giocate: number; azzeccate: number;
  };

  const classifica = ((generale ?? []) as unknown as Riga[])
    .sort((a, b) => Number(b.punti) - Number(a.punti));
  const giornate = ((perGiornata ?? []) as unknown as RigaG[]);

  const numeri = [...new Set(giornate.map((g) => g.fanta))].sort((a, b) => a - b);
  const ultima = numeri.length ? numeri[numeri.length - 1] : null;
  const diGiornata = giornate.filter((g) => g.fanta === ultima)
    .sort((a, b) => Number(b.punti) - Number(a.punti));

  const puntiDi = new Map(giornate.map((g) => [`${g.team_id}|${g.fanta}`, Number(g.punti)]));

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="schedine" />

      <p className="eyebrow">Torneo dei tipster</p>
      <h1>Classifica</h1>
      <p className="sub">
        {classifica.length === 0
          ? 'Ancora nessuna giornata giocata.'
          : `${numeri.length} ${numeri.length === 1 ? 'giornata' : 'giornate'} in archivio`}
      </p>

      <h2>Generale</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Squadra</th>
                <th className="num">Punti</th><th className="num">Media</th>
                <th className="num">Azzeccate</th><th className="num">Giocate</th>
              </tr>
            </thead>
            <tbody>
              {classifica.map((r, i) => (
                <tr key={r.team_id} style={r.team_id === ctx.team.id ? { background: 'var(--accent-soft)' } : undefined}>
                  <td className="num">{i + 1}</td>
                  <td><b>{r.team_name}</b></td>
                  <td className="num"><b>{Number(r.punti).toFixed(1)}</b></td>
                  <td className="num">{Number(r.media_giornata ?? 0).toFixed(1)}</td>
                  <td className="num">{r.azzeccate}</td>
                  <td className="num">{r.giocate}</td>
                </tr>
              ))}
              {classifica.length === 0 && (
                <tr><td colSpan={6}><div className="empty">La classifica si riempie appena si chiude la prima giornata.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ultima !== null && (
        <>
          <h2>Giornata {ultima}</h2>
          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Squadra</th>
                    <th className="num">Punti</th><th className="num">Azzeccate</th><th className="num">Giocate</th>
                  </tr>
                </thead>
                <tbody>
                  {diGiornata.map((r, i) => (
                    <tr key={r.team_id} style={r.team_id === ctx.team.id ? { background: 'var(--accent-soft)' } : undefined}>
                      <td className="num">{i + 1}</td>
                      <td>
                        <b>{r.team_name}</b>
                        {i === 0 && Number(r.punti) > 0 && <span className="tag ok" style={{ marginLeft: 8 }}>tipster di giornata</span>}
                      </td>
                      <td className="num"><b>{Number(r.punti).toFixed(1)}</b></td>
                      <td className="num">{r.azzeccate}</td>
                      <td className="num">{r.giocate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {numeri.length > 1 && (
        <>
          <h2>Andamento</h2>
          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Squadra</th>
                    {numeri.map((n) => <th key={n} className="num">{n}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {classifica.map((r) => (
                    <tr key={r.team_id}>
                      <td><b>{r.team_name}</b></td>
                      {numeri.map((n) => {
                        const p = puntiDi.get(`${r.team_id}|${n}`);
                        return <td key={n} className="num">{p == null ? '—' : p.toFixed(0)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
