import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { TopBar } from '../TopBar';
import { ICONE } from '../BottomNav';
import { Gioca } from './Gioca';
import { Storico } from './Storico';
import { Altre } from './Altre';

export const dynamic = 'force-dynamic';

type Tab = 'gioca' | 'storico' | 'altre';

const TAB: { key: Tab; label: string; href: string }[] = [
  { key: 'gioca', label: 'Gioca', href: '/schedine' },
  { key: 'storico', label: 'Le mie', href: '/schedine?tab=storico' },
  { key: 'altre', label: 'Altri', href: '/schedine?tab=altre' },
];

export default async function SchedinePage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireTeamContext();
  const { tab } = await searchParams;
  if (tab === 'classifica') redirect('/classifica?c=tipster&da=schedine');
  const attiva: Tab = tab === 'storico' || tab === 'altre' ? tab : 'gioca';

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="schedine" />

      <div className="titolo-riga">
        <div>
          <p className="eyebrow">Torneo dei tipster</p>
          <h1>Schedine</h1>
        </div>
        {/* la classifica dei tipster vive con le altre, nella pagina delle classifiche */}
        <Link href="/classifica?c=tipster&da=schedine" className="btn piccolo">
          {ICONE.classifica}Classifica
        </Link>
      </div>

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
    </div>
  );
}
