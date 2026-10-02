import { notFound } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { diretta } from '@/lib/live/liveServer';
import { TopBar } from '../../TopBar';
import { Diretta } from './Diretta';

export const dynamic = 'force-dynamic';

/**
 * La partita del fanta in diretta: si apre toccando la card della partita
 * nel banner della Home, una volta cominciata la giornata.
 */
export default async function PartitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTeamContext();
  const d = await diretta(id, ctx.team.leagueId);
  if (!d) notFound();

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="home" />
      <p className="eyebrow">{d.titolo} · in diretta</p>
      <h1 className="sr-only">{d.casa.nome} contro {d.ospite.nome}</h1>
      <Diretta d={d} />
    </div>
  );
}
