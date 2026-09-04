import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { TopBar } from '../../TopBar';
import { SalaDiProva } from './SalaDiProva';

export const dynamic = 'force-dynamic';

/**
 * Sala d'asta di prova, solo per l'admin.
 *
 * Non tocca il database: legge soltanto le regole della lega — percentuale di
 * rimborso, rilancio minimo, durata del timer — per far girare la simulazione
 * con i numeri veri. Nessuna sessione, nessun lotto, nessun movimento: la
 * serata finta vive tutta nel browser e sparisce ricaricando la pagina.
 */
export default async function ProvaPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const { data: league } = await db.from('leagues')
    .select('timer_seconds').eq('id', ctx.team.leagueId).maybeSingle();

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Pannello admin · prova</p>
      <h1>Sala d&apos;asta di prova</h1>
      <p className="sub">
        Una serata inventata per vedere come si comporta la sala: si apre, si
        aprono i lotti uno alla volta, si rilancia e il timer riparte. Puoi
        rifarla quante volte vuoi.
      </p>

      <SalaDiProva cfg={ctx.cfg} timerSecondi={league?.timer_seconds ?? 10} />
    </div>
  );
}
