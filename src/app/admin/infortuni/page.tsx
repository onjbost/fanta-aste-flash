import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import {
  GIORNI_SVINCOLO_GRATUITO, indisponibiliAttuali, svincoliProponibili,
} from '@/lib/infortuni/infortuniServer';
import { TopBar } from '../../TopBar';
import { BottoneAggiorna, BottoneProponi } from './Pannello';

export const dynamic = 'force-dynamic';

const ETICHETTA: Record<string, string> = {
  infortunato: 'Infortunato',
  squalificato: 'Squalificato',
  in_dubbio: 'In dubbio',
  diffidato: 'Diffidato',
};

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default async function InfortuniPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const [tutti, proposte, { data: rosa }] = await Promise.all([
    indisponibiliAttuali(),
    svincoliProponibili(ctx.team.leagueId),
    db.from('v_roster').select('player_id, name, team_id').eq('league_id', ctx.team.leagueId),
  ]);

  const squadraDi = new Map((rosa ?? []).map((r) => [r.player_id as string, r.team_id as string]));
  const { data: squadre } = await db.from('teams')
    .select('id, name').eq('league_id', ctx.team.leagueId);
  const nomeSquadra = new Map((squadre ?? []).map((t) => [t.id as string, t.name as string]));

  // Quelli che riguardano la lega vengono prima: sono gli unici che cambiano
  // qualcosa nelle quote e negli svincoli. Il resto della Serie A serve solo
  // a capire se la raccolta ha funzionato.
  const nostri = tutti
    .filter((r) => r.playerId && squadraDi.has(r.playerId))
    .sort((a, b) => (b.giorniDiStop ?? -1) - (a.giorniDiStop ?? -1));

  const raccoltoIl = tutti[0]?.raccoltoIl ?? null;
  const fuoriUso = tutti.filter((r) => r.categoria === 'infortunato' || r.categoria === 'squalificato');

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Indisponibili</p>
      <h1>Chi è fuori</h1>
      <p className="sub">
        Letti da fantacalcio.it ogni mercoledì. Servono a tre cose: le quote del
        Torneo dei Tipster escludono dall&apos;undici chi non può giocare, gli svincoli
        oltre i {GIORNI_SVINCOLO_GRATUITO} giorni te li propongo già compilati, e la
        Redazione sa chi mancava.
      </p>

      <BottoneAggiorna />

      {!raccoltoIl ? (
        <div className="callout crit">
          Non ho ancora nessuna raccolta. Premi <b>Aggiorna adesso</b>: se la pagina
          risponde, da qui in poi ci pensa il cron del mercoledì.
        </div>
      ) : (
        <p className="sub" style={{ marginTop: -6 }}>
          Ultima raccolta: {quando(raccoltoIl)} · {tutti.length} indisponibili in Serie A,
          di cui {fuoriUso.length} non schierabili · {nostri.length} in una rosa della lega.
        </p>
      )}

      {proposte.length > 0 && (
        <>
          <h2>Svincoli gratuiti da decidere</h2>
          <p className="sub">
            Fermi per più di {GIORNI_SVINCOLO_GRATUITO} giorni secondo la stima. La stima
            è dedotta da una frase in italiano, quindi qui sotto trovi sempre <b>la frase
            originale</b>: è quella che devi guardare, non il numero. Aprendo la richiesta
            resta da approvare, come tutte le altre — non decido io.
          </p>
          {proposte.map((p) => (
            <div key={p.playerId} className="msgcard" style={{ padding: 14, marginBottom: 12 }}>
              <b>{p.nome}</b> · {p.squadra} · fermo ancora ~{p.giorni} giorni
              (rientro stimato {p.rientroStimato})
              <p className="sub" style={{ margin: '6px 0 10px', fontStyle: 'italic' }}>
                «{p.motivazione}»
              </p>
              <BottoneProponi playerId={p.playerId} nome={p.nome} />
            </div>
          ))}
        </>
      )}

      <h2>Nelle rose della lega</h2>
      {nostri.length === 0 ? (
        <div className="empty">Nessun giocatore della lega risulta indisponibile.</div>
      ) : (
        <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Giocatore</th><th>Squadra</th><th>Stato</th><th>Rientro</th>
            </tr>
          </thead>
          <tbody>
            {nostri.map((r) => (
              <tr key={`${r.playerId}-${r.categoria}`}>
                <td>{r.nome}<br /><span className="sub">{r.club}</span></td>
                <td>{nomeSquadra.get(squadraDi.get(r.playerId as string) ?? '') ?? '—'}</td>
                <td>{ETICHETTA[r.categoria] ?? r.categoria}</td>
                <td>
                  {r.rientroStimato
                    ? <>{r.rientroStimato}<br /><span className="sub">~{r.giorniDiStop} giorni</span></>
                    : <span className="sub">non deducibile</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {raccoltoIl && (
        <div className="callout" style={{ marginTop: 18 }}>
          Gli indisponibili con il rientro «non deducibile» non sono un errore: la fonte
          non sempre dice un mese. Restano fuori dall&apos;undici lo stesso — per le quote
          conta che non giochino, non quando torneranno.
        </div>
      )}
    </div>
  );
}
