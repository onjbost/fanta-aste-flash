import { loadFreeAgents, requireTeamContext } from '@/lib/queries';
import { expectedStatus } from '@/lib/rules';
import { TopBar } from '../TopBar';
import { Svincolati } from './Svincolati';

export const dynamic = 'force-dynamic';

export default async function SvincolatiPage() {
  const ctx = await requireTeamContext();

  // Si caricano tutti una volta sola: ordinare e filtrare avviene nel browser,
  // così ogni click è immediato invece di essere un giro al server.
  const { players, error } = await loadFreeAgents();

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="listone" />

      <p className="eyebrow">Mercato</p>
      <h1>Svincolati</h1>
      <p className="sub">
        Chi è uscito da una rosa nell&apos;ultima asta torna chiamabile dalla prossima. I fuori
        lista non compaiono: non prendono voto. Gli indisponibili hanno l&apos;etichetta, e nel
        foglio del giocatore c&apos;è cosa scrive fantacalcio.it.
      </p>

      {error && (
        <div className="callout crit">
          Gli svincolati non si sono caricati: {error}. Se hai appena aggiornato il
          database, controlla di aver eseguito tutte le migrazioni.
        </div>
      )}

      <Svincolati
        players={players}
        chiamateAperte={ctx.nextSession ? expectedStatus(ctx.nextSession, new Date(), ctx.cfg) === 'calls_open' : false}
      />

      <p className="nota-piede">
        Nelle aste di gennaio (#7, #8, #9) i giocatori arrivati in Serie A nel mercato
        invernale non si possono chiamare — art. 11.2. L&apos;app li segnala e blocca
        la chiamata.
      </p>
    </div>
  );
}
