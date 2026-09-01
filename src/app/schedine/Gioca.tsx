import { supabaseAdmin } from '@/lib/supabase';
import { giornataCorrente, sfideDiGiornata } from '@/lib/tipsterServer';
import type { Mercato } from '@/lib/tipster';
import { Countdown } from '../asta/Countdown';
import { Schedina, type SfidaUI } from './Schedina';

const FASE: Record<string, string> = {
  regular: 'campionato', gruppi: 'gironi', semifinale: 'semifinale', finale: 'finale',
};

export async function Gioca({ teamId, leagueId }: { teamId: string; leagueId: string }) {
  const giornata = await giornataCorrente(leagueId);
  if (!giornata) {
    return <div className="callout crit">Il calendario non è ancora stato caricato.</div>;
  }

  const db = supabaseAdmin();
  const sfide = await sfideDiGiornata(giornata.id);
  const conSquadre = sfide.filter((s) => s.homeTeamId && s.awayTeamId);

  const [{ data: quote }, { data: lega }, { data: mieSlip }] = await Promise.all([
    db.from('odds').select('fixture_id, market, selection, price')
      .in('fixture_id', conSquadre.map((s) => s.id)),
    db.from('leagues').select('tipster_multiplier, tipster_max_picks').eq('id', leagueId).single(),
    db.from('slips').select('id').eq('matchday_id', giornata.id).eq('team_id', teamId).maybeSingle(),
  ]);

  const { data: miePicks } = mieSlip
    ? await db.from('picks').select('fixture_id, market, selection, price, outcome, points')
        .eq('slip_id', mieSlip.id)
    : { data: [] as Record<string, unknown>[] };

  const moltiplicatore = Number(lega?.tipster_multiplier ?? 10);
  const tetto = Number(lega?.tipster_max_picks ?? 3);
  const pubblicate = !!giornata.oddsPublishedAt;
  const chiusa = new Date() >= new Date(giornata.lockAt);

  const perSfida = new Map<string, { market: Mercato; selection: string; price: number }[]>();
  (quote ?? []).forEach((q) => {
    const l = perSfida.get(q.fixture_id as string) ?? [];
    l.push({ market: q.market as Mercato, selection: String(q.selection), price: Number(q.price) });
    perSfida.set(q.fixture_id as string, l);
  });

  const ui: SfidaUI[] = conSquadre.map((s) => ({
    id: s.id, competition: s.competition, fase: FASE[s.phase] ?? s.phase,
    casa: s.homeName, ospite: s.awayName,
<<<<<<< HEAD
    quote: perSfida.get(s.id) ?? [],
=======
    quote: (perSfida.get(s.id) ?? []).sort((a, b) => a.price - b.price),
>>>>>>> 59bd0f6b2cb654de49646c4a8945d1b5cc513f1d
  }));

  const iniziali = (miePicks ?? []).map((p) => ({
    fixtureId: String(p.fixture_id), market: p.market as Mercato, selection: String(p.selection),
  }));

  return (
    <>
      <p className="sub" style={{ marginTop: -8 }}>
        <b>Giornata {giornata.fanta}</b>{chiusa ? ' · schedine chiuse' : ''} · 
        {new Date(giornata.matchDate).toLocaleDateString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
      </p>

      <div className="stats">
        <div className="stat">
          <div className="k">{chiusa ? 'Chiuse il' : 'Si chiude tra'}</div>
          <div className="v">
            {chiusa
              ? new Date(giornata.lockAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
              : <Countdown to={new Date(giornata.lockAt).toISOString()} />}
          </div>
          <div className="note">un'ora prima della prima partita</div>
        </div>
        <div className="stat">
          <div className="k">Sfide</div>
          <div className="v">{ui.length}</div>
          <div className="note">
            {ui.filter((s) => s.competition === 'campionato').length} di campionato
            {ui.some((s) => s.competition === 'coppa') && ` · ${ui.filter((s) => s.competition === 'coppa').length} di coppa`}
          </div>
        </div>
        <div className="stat">
          <div className="k">Le tue giocate</div>
          <div className="v">{iniziali.length}</div>
          <div className="note">massimo {tetto} per sfida</div>
        </div>
      </div>

      {!pubblicate ? (
        <div className="callout">
          Le quote di questa giornata non sono ancora pubblicate. Appena l'admin le mette in
          lavagna le trovi qui.
        </div>
      ) : (
        <>
          <div className="callout">
            Ogni giocata azzeccata vale <b>{moltiplicatore} × la quota</b>. Se ne fai più d'una sulla
            stessa sfida il moltiplicatore si divide: due giocate {moltiplicatore / 2} ciascuna,
            tre {(moltiplicatore / 3).toFixed(2)}. La quota si congela quando salvi.
          </div>

          <Schedina
            sfide={ui}
            iniziali={iniziali}
            moltiplicatore={moltiplicatore}
            tetto={tetto}
            chiusa={chiusa}
          />
        </>
      )}
    </>
  );
}
