import Link from 'next/link';
import { loadTeamContext } from '@/lib/queries';
import { BottomNav, type NavKey } from './BottomNav';
import { Cassetto } from './Cassetto';

/**
 * La testata di ogni pagina: ☰, marchio, saldo crediti. Sotto, la barra.
 *
 * Crediti e stemma li legge da sé: il contesto di squadra è memorizzato per
 * richiesta, quindi la pagina che l'ha già chiesto non paga una seconda
 * andata al database, e le pagine non devono passarli a mano.
 *
 * `pieno` toglie la barra in basso: la sala e le classifiche sono schermate
 * in cui serve tutto lo spazio, e da cui si esce con ←.
 */
export async function TopBar(props: { teamName: string; isAdmin: boolean; active: NavKey; pieno?: boolean }) {
  const ctx = await loadTeamContext();
  const crediti = ctx?.credits ?? null;
  const salaLive = ctx?.nextSession?.status === 'live';

  return (
    <>
      <header className="topbar">
        <Cassetto
          squadra={ctx?.team.name ?? props.teamName}
          crediti={crediti}
          stemma={ctx?.team.logoUrl ?? null}
          isAdmin={props.isAdmin}
        />
        <div className="brand">Aste <span>Flash</span></div>
        {crediti !== null && (
          <Link href="/rosa" className="saldo" aria-label={`${crediti} crediti residui`}>
            {crediti}<small>cr</small>
          </Link>
        )}
      </header>
      {!props.pieno && <BottomNav active={props.active} salaLive={salaLive} />}
    </>
  );
}
