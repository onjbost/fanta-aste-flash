import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import {
  GIORNI_SVINCOLO_GRATUITO, indisponibiliAttuali, svincoliProponibili,
} from '@/lib/infortuni/infortuniServer';
import { quotazioniAggiornate, ultimeRaccolte } from '@/lib/fonti/fontiServer';
import { TopBar } from '../../TopBar';
import { BottoneAggiorna, BottoneFonti, BottoneProponi } from './Pannello';
import { RigheIndisponibile } from './Righe';

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
  const [tutti, proposte, { data: rosa }, quotazioni, raccolte] = await Promise.all([
    indisponibiliAttuali(),
    svincoliProponibili(ctx.team.leagueId),
    db.from('v_roster').select('player_id, name, team_id').eq('league_id', ctx.team.leagueId),
    quotazioniAggiornate(),
    ultimeRaccolte(),
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

  // Gli svincolati: agganciati a un giocatore della lega che non è in
  // nessuna rosa. Sono quelli da non chiamare all'asta senza saperlo.
  const liberiIds = [...new Set(tutti
    .filter((r) => r.playerId && !squadraDi.has(r.playerId))
    .map((r) => r.playerId as string))];
  const { data: anagrafica } = liberiIds.length
    ? await db.from('players').select('id, role, quotation, league_id')
      .in('id', liberiIds).eq('league_id', ctx.team.leagueId)
    : { data: [] as { id: string; role: string; quotation: number; league_id: string }[] };
  const perId = new Map((anagrafica ?? []).map((p) => [p.id as string, p]));
  const liberi = tutti
    .filter((r) => r.playerId && perId.has(r.playerId) && !squadraDi.has(r.playerId))
    .sort((a, b) => (b.giorniDiStop ?? -1) - (a.giorniDiStop ?? -1));
  const nonAgganciati = tutti.filter((r) => !r.playerId).length;

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
              <RigheIndisponibile key={`${r.playerId}-${r.categoria}`} r={r}
                etichetta={ETICHETTA[r.categoria] ?? r.categoria}
                seconda={nomeSquadra.get(squadraDi.get(r.playerId as string) ?? '') ?? '—'} />
            ))}
          </tbody>
        </table>
        </div>
      )}

      <h2>Fra gli svincolati</h2>
      <p className="sub">
        Indisponibili che non sono in nessuna rosa della lega. Nella pagina Svincolati
        tutti gli allenatori li vedono con l&apos;etichetta, così nessuno chiama all&apos;asta
        un giocatore fermo senza saperlo.
        {nonAgganciati > 0 && <> {nonAgganciati} righe della fonte non corrispondono a
        nessun giocatore del listone e restano fuori da entrambe le tabelle.</>}
      </p>
      {liberi.length === 0 ? (
        <div className="empty">Nessuno svincolato risulta indisponibile.</div>
      ) : (
        <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Giocatore</th><th className="num">Quot.</th><th>Stato</th><th>Rientro</th>
            </tr>
          </thead>
          <tbody>
            {liberi.map((r) => {
              const p = perId.get(r.playerId as string)!;
              const q = quotazioni.get(r.playerId as string)?.qtAttuale ?? Number(p.quotation);
              return (
                <RigheIndisponibile key={`${r.playerId}-${r.categoria}`} r={r}
                  etichetta={ETICHETTA[r.categoria] ?? r.categoria}
                  ruolo={p.role as string} seconda={String(q)} secondaNum />
              );
            })}
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

      <h2>Quotazioni e voti</h2>
      <p className="sub">
        Letti da fantacalcio.it ogni mattina. Le quotazioni aggiornate stanno accanto a
        quelle del listone della lega (che non vengono toccate), e insieme ai voti delle
        ultime giornate entrano nelle quote del Torneo dei Tipster: chi è in forma pesa
        di più, chi non prende voto da settimane scivola fuori dall&apos;undici stimato.
      </p>
      <ul className="sub" style={{ margin: '0 0 12px', paddingLeft: 18 }}>
        <li>
          Quotazioni: {raccolte.quotazioni
            ? <>{quando(raccolte.quotazioni.fetchedAt)} · {raccolte.quotazioni.righe} lette,
              {' '}{raccolte.quotazioni.agganciate} agganciate
              {raccolte.quotazioni.nota && <> · {raccolte.quotazioni.nota}</>}</>
            : 'mai lette'}
        </li>
        <li>
          Voti: {raccolte.voti
            ? <>{quando(raccolte.voti.fetchedAt)} · {raccolte.voti.righe} letti,
              {' '}{raccolte.voti.agganciate} agganciati
              {raccolte.voti.nota && <> · {raccolte.voti.nota}</>}</>
            : 'mai letti'}
        </li>
      </ul>
      <BottoneFonti />
    </div>
  );
}
