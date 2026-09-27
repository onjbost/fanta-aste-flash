import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { MESSAGE_LABEL, type MessageKind } from '@/lib/messages';
import { giocatoriBloccati, rosePerScambio } from '@/lib/mercato/scambioServer';
import { TopBar } from '../../TopBar';
import { MessageCard } from './MessageCard';
import { TradeForm } from './TradeForm';

export const dynamic = 'force-dynamic';

const ORDER: MessageKind[] = ['call', 'calls_closed', 'joins_closed', 'room_open', 'results'];

export default async function MessaggiPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const { data: session } = await db.from('auction_sessions')
    .select('id, number, status, auction_at').eq('league_id', ctx.team.leagueId)
    .not('status', 'eq', 'closed').order('number').limit(1).maybeSingle();

  const { data: saved } = session
    ? await db.from('messages').select('id, kind, body, status, created_at')
        .eq('session_id', session.id).order('created_at', { ascending: false })
    : { data: [] };

  // Il fantacalciomercato non appartiene a nessuna asta: uno scambio può
  // chiudersi in qualunque momento della stagione, anche a mercato degli
  // svincolati fermo. Le rose intere servono al selettore dei giocatori e al
  // conto di «come resteranno le rose», che il form fa da sé senza tornare
  // al server: i dati li ha già tutti qui.
  const [rose, bloccati, { data: trades }] = await Promise.all([
    rosePerScambio(ctx.team.leagueId),
    giocatoriBloccati(ctx.team.leagueId),
    // `spunti` sono i fatti congelati al momento della scrittura (`salvaScambio`):
    // sono loro che permettono di rivedere l'effetto di uno scambio ripreso
    // dopo un ricarico, quando la scelta non è più nel browser
    db.from('trades')
      .select('id, body, created_at, applied_at, reverted_at, settlement, settlement_payer, spunti')
      .eq('league_id', ctx.team.leagueId)
      .order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Centro messaggi</p>
      <h1>Testi per il gruppo</h1>
      <p className="sub">
        {session
          ? <>Asta flash #{session.number} · generati dai dati veri della sessione. Controlli, copi, incolli su WhatsApp.</>
          : 'Nessuna asta aperta.'}
      </p>

      {session && ORDER.map((kind) => {
        const existing = (saved ?? []).filter((m) => m.kind === kind);
        return (
          <MessageCard
            key={kind}
            sessionId={session.id}
            kind={kind}
            label={MESSAGE_LABEL[kind]}
            saved={existing.map((m) => ({ id: m.id, body: m.body, status: m.status, createdAt: m.created_at }))}
          />
        );
      })}

      {session && (
        <div className="callout">
          Le chiamate generano il loro messaggio da sole, appena arrivano. Gli altri quattro
          li rigeneri quando vuoi: leggono sempre lo stato attuale della sessione, quindi un
          testo vecchio non resta mai in giro.
        </div>
      )}

      <h2>Fantacalciomercato</h2>
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
