import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { giocatoriBloccati, rosePerScambio } from '@/lib/mercato/scambioServer';
import { TopBar } from '../../TopBar';
import { TradeForm } from './TradeForm';
import { AzioniGruppo } from '../AzioniGruppo';

export const dynamic = 'force-dynamic';

export default async function ScambiPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const [rose, bloccati, { data: trades }] = await Promise.all([
    rosePerScambio(ctx.team.leagueId),
    giocatoriBloccati(ctx.team.leagueId),
    db.from('trades')
      .select('id, body, created_at, applied_at, reverted_at, settlement, settlement_payer, spunti')
      .eq('league_id', ctx.team.leagueId)
      .order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Fantacalciomercato</p>
      <h1>Scambi fra allenatori</h1>
      <AzioniGruppo pagina="/admin/scambi" />
      <p className="sub">
        Uno scambio fra due squadre, raccontato al gruppo e registrato sul serio.
        Si fa in due tempi: prima l&apos;annuncio e le rose come resteranno, poi la
        conferma, che è il momento in cui contratti e crediti si muovono. Finché non
        confermi, non ho toccato niente.
      </p>

      <TradeForm
        rose={rose.map((l) => ({
          teamId: l.teamId,
          nome: l.nome,
          crediti: l.crediti,
          // `rosePerScambio` mette la rosa intera dentro `cede`: qui diventa
          // la rosa da cui pescare, e al client basta il minimo per
          // disegnarla — niente fantamedie né presenze
          rosa: l.cede.map((g) => ({
            playerId: g.playerId, nome: g.nome, ruolo: g.ruolo, club: g.club, prezzo: g.prezzo,
          })),
        }))}
        bloccati={[...bloccati]}
        saved={(trades ?? []).map((t) => ({
          id: t.id, body: t.body ?? '', createdAt: t.created_at,
          appliedAt: t.applied_at, revertedAt: t.reverted_at,
          settlement: Number(t.settlement ?? 0),
          settlementPayer: t.settlement_payer === 'to'
            ? 'to' as const
            : t.settlement_payer === 'from' ? 'from' as const : null,
          spunti: t.spunti as unknown,
        }))}
      />
    </div>
  );
}
