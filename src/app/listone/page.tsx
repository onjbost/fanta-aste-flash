import { loadFreeAgents, requireTeamContext } from '@/lib/queries';
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
        {players.length} giocatori liberi. Chi è uscito da una rosa nell&apos;ultima asta
        torna chiamabile dalla prossima. I fuori lista non compaiono: la società non
        li ha iscritti, quindi non prendono voto.
      </p>

      {error && (
        <div className="callout crit">
          Gli svincolati non si sono caricati: {error}. Se hai appena aggiornato il
          database, controlla di aver eseguito tutte le migrazioni.
        </div>
      )}

      <Svincolati players={players} />

      <div className="callout">
        Nelle aste di gennaio (#7, #8, #9) i giocatori arrivati in Serie A nel mercato
        invernale non si possono chiamare — art. 11.2. L&apos;app li segnala e blocca
        la chiamata.
      </div>
    </div>
  );
}
