import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { ultimeRaccolte } from '@/lib/fonti/fontiServer';
import type { PassoGiro } from '@/lib/leghe/legheServer';
import { TopBar } from '../../TopBar';
import { AggiornaFonti, AggiornaIndisponibili, ImportaGiornata } from './Pannello';
import { AggiornaListone, AggiornaRose } from './Rose';
import { Passi, SEGNO } from './Passi';
import { AzioniGruppo } from '../AzioniGruppo';

export const dynamic = 'force-dynamic';
// calcolo sulla lega, import e rose possono prendersi qualche decina di secondi
export const maxDuration = 300;

const ORIGINE: Record<string, string> = { cron: 'cron del mattino', manuale: 'a mano', reimport: 'reimport' };

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Il Pannello amministratore: le operazioni che di solito fa il cron, a
 * portata di pulsante, e il registro di tutti i giri sulla giornata —
 * del cron e a mano — diviso per giornata.
 */
export default async function PannelloPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const [{ data: righe }, raccolte, { data: indisp }, { data: ultimaFanta }] = await Promise.all([
    db.from('cron_log').select('id, creato_il, origine, competizione, giornata, serie_a, esito, passi')
      .order('creato_il', { ascending: false }).limit(200),
    ultimeRaccolte(),
    db.from('injury_reports').select('fetched_at, righe, agganciate').order('fetched_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('fixtures').select('matchdays!inner(fanta)').eq('league_id', ctx.team.leagueId)
      .eq('competition', 'campionato').not('home_goals', 'is', null),
  ]);

  // il registro, una scheda per giornata, dalla più recente
  type Riga = { id: string; creato_il: string; origine: string; competizione: string; giornata: number; serie_a: number | null; esito: 'ok' | 'ko' | 'info'; passi: PassoGiro[] };
  const gruppi = new Map<string, Riga[]>();
  for (const r of (righe ?? []) as unknown as Riga[]) {
    const k = `${r.competizione}:${r.giornata}`;
    gruppi.set(k, [...(gruppi.get(k) ?? []), r]);
  }
  // la proposta del campo «giornata»: quella dopo l'ultima già importata
  const fatte = Math.max(0, ...((ultimaFanta ?? []) as unknown as { matchdays: { fanta: number | null } }[])
    .map((f) => Number(f.matchdays?.fanta ?? 0)));

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Admin</p>
      <h1>Pannello amministratore</h1>
      <AzioniGruppo pagina="/admin/pannello" />
      <p className="sub">
        Le operazioni che il cron fa da solo ogni mattina, quando servono subito, e il registro di
        ogni giro sulla giornata. Se un giro del cron va storto, ti arriva anche su Telegram.
      </p>

      <h2>Giornata</h2>
      <div className="panel" style={{ padding: 16 }}>
        <p className="sub" style={{ marginTop: 0 }}>
          Se su Leghe Fantacalcio la giornata è già calcolata la importa e basta; se non lo è, prima
          la calcola (solo se le partite sono tutte finite) e poi la importa: risultati, tabellino,
          classifiche e schedine.
        </p>
        <ImportaGiornata prossima={fatte + 1} />
      </div>

      <h2>Listone e rose</h2>
      <div className="panel" style={{ padding: 16 }}>
        <p className="sub" style={{ marginTop: 0 }}>
          Da Leghe Fantacalcio, senza file: il listone con gli svincolati, e le rose con i prezzi
          pagati. Ogni mattina li aggiorna il cron; le rose solo se nessuna differenza tocca un
          giocatore mosso nell&apos;app nelle ultime tre settimane — in quel caso te lo dice e
          decidi tu da qui, guardando le differenze.
        </p>
        <p className="sub">
          Listone: {raccolte.listone ? `${quando(raccolte.listone.fetchedAt)} · ${raccolte.listone.righe} giocatori${raccolte.listone.nota ? ` (${raccolte.listone.nota})` : ''}` : 'mai letto dalla lega'}
        </p>
        <AggiornaListone />
        <p className="sub">
          Rose: {raccolte.rose ? `${quando(raccolte.rose.fetchedAt)} · ${raccolte.rose.nota ?? ''}` : 'mai lette dalla lega'}
        </p>
        <AggiornaRose />
      </div>

      <h2>Fonti</h2>
      <div className="panel" style={{ padding: 16 }}>
        <p className="sub" style={{ marginTop: 0 }}>
          Quotazioni, voti e statistiche: {raccolte.quotazioni ? `quotazioni ${quando(raccolte.quotazioni.fetchedAt)}` : 'quotazioni mai lette'}
          {' · '}{raccolte.voti ? `voti ${quando(raccolte.voti.fetchedAt)}${raccolte.voti.nota ? ` (${raccolte.voti.nota})` : ''}` : 'voti mai letti'}
          {' · '}{raccolte.statistiche ? `statistiche ${quando(raccolte.statistiche.fetchedAt)} (${raccolte.statistiche.agganciate} giocatori)` : 'statistiche mai lette'}
        </p>
        <AggiornaFonti />
        <p className="sub" style={{ marginTop: 0 }}>
          Indisponibili: {indisp ? `${quando(indisp.fetched_at as string)} · ${indisp.righe} letti, ${indisp.agganciate} agganciati` : 'mai letti'}
        </p>
        <AggiornaIndisponibili />
      </div>

      <h2>Registro</h2>
      {gruppi.size === 0 ? (
        <div className="panel"><div className="empty">Ancora nessun giro sulla giornata.</div></div>
      ) : [...gruppi].map(([k, voci], i) => {
        const prima = voci[0];
        const nome = prima.competizione === 'coppa' ? `Coppa · turno ${prima.giornata}` : `Giornata ${prima.giornata}`;
        return (
          <details key={k} className="panel giornata" style={{ marginBottom: 10 }} open={i === 0}>
            <summary>
              <div className="giornata-riga">
                <span className="giornata-n">{SEGNO[prima.esito]} {nome}</span>
                <span className="giornata-meta">
                  {prima.serie_a ? `${prima.serie_a}ª di Serie A · ` : ''}ultimo giro {quando(prima.creato_il)}
                </span>
              </div>
            </summary>
            <div className="giornata-corpo">
              {voci.map((v) => (
                <div key={v.id} style={{ padding: '8px 0', borderTop: '1px solid var(--surface-3)' }}>
                  <b>{SEGNO[v.esito]} {quando(v.creato_il)}</b>
                  <span className="sub"> · {ORIGINE[v.origine] ?? v.origine}</span>
                  <Passi passi={v.passi} />
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
