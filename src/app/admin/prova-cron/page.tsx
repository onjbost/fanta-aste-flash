import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { TopBar } from '../../TopBar';
import { Prova } from './Prova';

export const dynamic = 'force-dynamic';
// calcolo sulla lega e import possono prendersi qualche decina di secondi
export const maxDuration = 60;

/** PROVA DEL CRON — temporaneo, da togliere dopo il collaudo. */
export default async function ProvaCronPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />
      <p className="eyebrow">Collaudo · temporaneo</p>
      <h1>Prova del cron</h1>
      <p className="sub">
        Fa su una giornata scelta quello che il cron fa la mattina dopo l&apos;ultima partita:
        controlla che le partite siano finite, preme «Calcola giornata» su Leghe Fantacalcio se non
        è calcolata, verifica, e la importa (risultati, tabellino, classifiche, schedine). Salta solo
        i controlli sulla data e sul «già importata», che mostra comunque.
      </p>
      <div className="callout">
        Per provare anche il calcolo: annulla prima il calcolo della giornata su Leghe Fantacalcio,
        poi premi il pulsante. Niente messaggi Telegram da qui.
      </div>
      <Prova />
    </div>
  );
}
