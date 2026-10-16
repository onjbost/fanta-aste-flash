import { supabaseAdmin } from '@/lib/supabase';
import { giornataCorrente, schedinaGiocata, sfideDiGiornata } from '@/lib/tipsterServer';
import type { Mercato } from '@/lib/tipster';
import { Countdown } from '../asta/Countdown';
import { Schedina, type SfidaUI } from './Schedina';
import { TendinaSchedina } from './giocate';

const FASE: Record<string, string> = {
  regular: 'campionato', gruppi: 'gironi', semifinale: 'semifinale', finale: 'finale',
};

export async function Gioca({ teamId, leagueId }: { teamId: string; leagueId: string }) {
  const giornata = await giornataCorrente(leagueId);
  if (!giornata) {
    return <div className="callout crit">Il calendario non è ancora stato caricato.</div>;
  }

  const db = supabaseAdmin();

  // Tutto quello che serve in una sola andata: le quote se le porta dietro la
  // sfida, le giocate se le porta dietro la schedina. Prima erano quattro
  // interrogazioni in fila, e in fila si sommano le attese.
  const [sfide, { data: quote }, { data: lega }, giocata, { data: bozza }] = await Promise.all([
    sfideDiGiornata(giornata.id),
    db.from('odds').select('fixture_id, market, selection, price, fixtures!inner(matchday_id)')
      .eq('fixtures.matchday_id', giornata.id),
    db.from('leagues').select('tipster_multiplier, tipster_max_picks').eq('id', leagueId).single(),
    schedinaGiocata(teamId, giornata.id),
    db.from('slip_drafts').select('picks').eq('matchday_id', giornata.id).eq('team_id', teamId).maybeSingle(),
  ]);

  const conSquadre = sfide.filter((s) => s.homeTeamId && s.awayTeamId);

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
    quote: perSfida.get(s.id) ?? [],
  }));

  // la bozza, senza le scelte che nel listino di adesso non ci sono più
  const quotate = new Set((quote ?? []).map((q) => `${q.fixture_id}|${q.market}|${q.selection}`));
  const iniziali = chiusa ? [] : ((bozza?.picks ?? []) as { fixtureId: string; market: Mercato; selection: string }[])
    .filter((p) => quotate.has(`${p.fixtureId}|${p.market}|${p.selection}`));

  return (
    <>
      <div className="giornata-testa">
        <div>
          <p className="eyebrow">Giornata {giornata.fanta}</p>
          <span className="sub">
            {new Date(giornata.matchDate).toLocaleDateString('it-IT', {
              weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome',
            })} · {ui.length} sfide
          </span>
        </div>
        <div className={`chiusura${chiusa ? ' chiusa' : ''}`}>
          <span className="k">{chiusa ? 'Chiuse' : 'Chiude tra'}</span>
          <span className="v">
            {chiusa
              ? new Date(giornata.lockAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })
              : <Countdown to={new Date(giornata.lockAt).toISOString()} />}
          </span>
        </div>
      </div>

      {giocata && (
        <TendinaSchedina giornata={giornata.fanta} moltiplicatore={moltiplicatore} {...giocata} />
      )}

      {!pubblicate ? (
        <div className="callout">
          Le quote di questa giornata non sono ancora pubblicate. Appena l'admin le mette in
          lavagna le trovi qui.
        </div>
      ) : (
        <>
          <details className="regola-breve">
            <summary>Ogni giocata presa vale <b>{moltiplicatore} × la quota</b> · massimo {tetto} per sfida</summary>
            <p>
              Se ne fai più d'una sulla stessa sfida il moltiplicatore si divide: due giocate{' '}
              {moltiplicatore / 2} ciascuna, tre {(moltiplicatore / 3).toFixed(2)}. «Salva» tiene le
              scelte senza giocarle, alle quote di adesso; «Gioca schedina» la gioca e congela le
              quote. Le schedine chiudono un'ora prima della prima partita.
            </p>
          </details>

          <Schedina
            sfide={ui}
            iniziali={iniziali}
            moltiplicatore={moltiplicatore}
            tetto={tetto}
            chiusa={chiusa}
            giornata={giornata.fanta}
            giocata={giocata && { giornata: giornata.fanta, ...giocata }}
          />
        </>
      )}
    </>
  );
}
