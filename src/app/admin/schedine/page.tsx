import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { giornataDaRiga, sfideDiGiornata } from '@/lib/tipsterServer';
import { TopBar } from '../../TopBar';
import { Quote, Orario, Rinvio, Risultato, Chiusura, Accoppiamento } from './Pannelli';

export const dynamic = 'force-dynamic';

/** Per l'input datetime-local serve l'ora locale, senza fuso. */
function perInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function AdminSchedinePage({
  searchParams,
}: { searchParams: Promise<{ g?: string }> }) {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const { g } = await searchParams;

  const { data: tutte } = await db.from('matchdays')
    .select('*').eq('league_id', ctx.team.leagueId).not('fanta', 'is', null).order('serie_a');
  const giornate = (tutte ?? []).map(giornataDaRiga);
  if (!giornate.length) {
    return (
      <div className="shell">
        <TopBar teamName={ctx.team.name} isAdmin active="admin" />
        <h1>Tipster</h1>
        <div className="callout crit">
          Calendario non caricato. Esegui <code>npm run calendari</code>.
        </div>
      </div>
    );
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const scelta = g ? giornate.find((x) => String(x.fanta) === g) : undefined;
  const giornata = scelta
    ?? giornate.find((x) => x.status !== 'settled' && x.matchDate >= oggi)
    ?? giornate.find((x) => x.status !== 'settled')
    ?? giornate[giornate.length - 1];

  const sfide = await sfideDiGiornata(giornata.id);
  const [{ data: quote }, { data: sa }, { data: squadre }, { data: slips }] = await Promise.all([
    db.from('odds').select('id, fixture_id').in('fixture_id', sfide.map((s) => s.id)),
    db.from('serie_a_fixtures').select('id, home_club, away_club, status, policy')
      .eq('matchday_id', giornata.id).order('home_club'),
    db.from('teams').select('id, name').eq('league_id', ctx.team.leagueId).order('name'),
    db.from('slips').select('id, team_id, points, teams(name)').eq('matchday_id', giornata.id),
  ]);

  const daDefinire = sfide.filter((s) => !s.homeTeamId || !s.awayTeamId);
  const conSquadre = sfide.filter((s) => s.homeTeamId && s.awayTeamId);
  const rinviate = (sa ?? []).filter((p) => p.status === 'postponed');
  const senzaRisultato = conSquadre.filter((s) => s.homeGoals == null).length;

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Admin · torneo dei tipster</p>
      <h1>Giornata {giornata.fanta}</h1>
      <p className="sub">
        Serie A {giornata.serieA} · {new Date(giornata.matchDate).toLocaleDateString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long',
        })} · stato <b>{giornata.status}</b>
      </p>

      <form className="filters" style={{ alignItems: 'center' }}>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="g">Giornata</label>
          <select id="g" name="g" defaultValue={String(giornata.fanta)}>
            {giornate.map((x) => (
              <option key={x.id} value={String(x.fanta)}>
                {x.fanta} — Serie A {x.serieA} ({x.status})
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Vai</button>
      </form>

      <div className="stats">
        <div className="stat">
          <div className="k">Chiusura schedine</div>
          <div className="v" style={{ fontSize: '1.1rem' }}>
            {new Date(giornata.lockAt).toLocaleString('it-IT', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <div className="note">un'ora prima della prima partita</div>
        </div>
        <div className="stat">
          <div className="k">Schedine arrivate</div>
          <div className="v">{(slips ?? []).length}<small>/8</small></div>
          <div className="note">{giornata.oddsPublishedAt ? 'quote pubblicate' : 'quote non pubblicate'}</div>
        </div>
        <div className="stat">
          <div className="k">Risultati mancanti</div>
          <div className="v">{senzaRisultato}</div>
          <div className="note">{rinviate.length ? `${rinviate.length} partite rinviate` : 'nessun rinvio'}</div>
        </div>
      </div>

      <h2>Quote</h2>
      <Quote
        matchdayId={giornata.id}
        pubblicate={!!giornata.oddsPublishedAt}
        esiti={(quote ?? []).length}
      />

      <h2>Orario del turno</h2>
      <div className="panel" style={{ padding: 16 }}>
        <Orario matchdayId={giornata.id} valore={perInput(giornata.firstKickoffAt)} />
      </div>

      <h2>Partite di Serie A e rinvii</h2>
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: 0 }}>
          Una partita rinviata cambia due cose: le quote (i suoi giocatori non prendono voto) e il
          momento in cui la giornata si può chiudere. Dopo averla segnata, rigenera le quote.
        </p>
        {(sa ?? []).map((p) => (
          <Rinvio key={p.id} id={p.id as string} casa={String(p.home_club)} ospite={String(p.away_club)}
                  stato={String(p.status)} policy={(p.policy as string | null) ?? null} />
        ))}
      </div>

      {daDefinire.length > 0 && (
        <>
          <h2>Coppa: accoppiamenti da decidere</h2>
          <div className="panel" style={{ padding: 16 }}>
            {daDefinire.map((s) => (
              <Accoppiamento
                key={s.id}
                fixtureId={s.id}
                etichetta={`${s.phase === 'finale' ? 'Finale' : 'Semifinale'} ${s.slot}`}
                squadre={(squadre ?? []).map((t) => ({ id: t.id as string, name: String(t.name) }))}
                casa={s.homeTeamId}
                ospite={s.awayTeamId}
              />
            ))}
          </div>
        </>
      )}

      <h2>Risultati</h2>
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: 0 }}>
          Gol e, se li hai sottomano, i fantapunti: i gol risolvono i mercati, i fantapunti servono
          a tarare il modello per le giornate dopo.
        </p>
        {conSquadre.map((s) => (
          <Risultato key={s.id} fixtureId={s.id}
            casa={`${s.competition === 'coppa' ? '🏆 ' : ''}${s.homeName}`} ospite={s.awayName}
            golCasa={s.homeGoals} golOspite={s.awayGoals} fpCasa={null} fpOspite={null} />
        ))}
        <Chiusura matchdayId={giornata.id} />
      </div>

      {(slips ?? []).length > 0 && (
        <>
          <h2>Punti della giornata</h2>
          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead><tr><th>Squadra</th><th className="num">Punti</th></tr></thead>
                <tbody>
                  {(slips as unknown as { id: string; points: number | null; teams: { name: string } | null }[])
                    .sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0))
                    .map((s) => (
                      <tr key={s.id}>
                        <td>{s.teams?.name ?? '—'}</td>
                        <td className="num">{s.points == null ? '—' : Number(s.points).toFixed(1)}</td>
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
