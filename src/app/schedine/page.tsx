import Link from 'next/link';
import { requireTeamContext } from '@/lib/queries';
import { TopBar } from '../TopBar';
import { Gioca } from './Gioca';
import { Storico } from './Storico';
import { Classifica } from './Classifica';
import { Altre } from './Altre';

export const dynamic = 'force-dynamic';

type Tab = 'gioca' | 'storico' | 'altre' | 'classifica';

const TAB: { key: Tab; label: string; href: string }[] = [
  { key: 'gioca', label: 'Gioca', href: '/schedine' },
  { key: 'storico', label: 'Le mie schedine', href: '/schedine?tab=storico' },
  { key: 'altre', label: 'Giocate degli altri', href: '/schedine?tab=altre' },
  { key: 'classifica', label: 'Classifica', href: '/schedine?tab=classifica' },
];

export default async function SchedinePage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireTeamContext();
  const { tab } = await searchParams;
  const attiva: Tab = tab === 'storico' || tab === 'altre' || tab === 'classifica' ? tab : 'gioca';

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="schedine" />

      <p className="eyebrow">Torneo dei tipster</p>
      <h1>Schedine</h1>

      <nav className="tabs" aria-label="Sezioni delle schedine">
        {TAB.map((t) => (
          <Link key={t.key} href={t.href} className={t.key === attiva ? 'on' : ''}
                aria-current={t.key === attiva ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {attiva === 'gioca' && <Gioca teamId={ctx.team.id} leagueId={ctx.team.leagueId} />}
      {attiva === 'storico' && <Storico teamId={ctx.team.id} />}
      {attiva === 'altre' && <Altre teamId={ctx.team.id} leagueId={ctx.team.leagueId} />}
      {attiva === 'classifica' && <Classifica teamId={ctx.team.id} leagueId={ctx.team.leagueId} />}
    </div>
  );
}
