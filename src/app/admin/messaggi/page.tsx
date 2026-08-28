import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { MESSAGE_LABEL, type MessageKind } from '@/lib/messages';
import { TopBar } from '../../TopBar';
import { MessageCard } from './MessageCard';

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

      <div className="callout">
        Le chiamate generano il loro messaggio da sole, appena arrivano. Gli altri quattro
        li rigeneri quando vuoi: leggono sempre lo stato attuale della sessione, quindi un
        testo vecchio non resta mai in giro.
      </div>
    </div>
  );
}
