import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { TopBar } from '../../TopBar';
import { CreditiEditor } from '../rose/CreditiEditor';
import { AzioniGruppo } from '../AzioniGruppo';

export const dynamic = 'force-dynamic';

/**
 * I crediti residui di tutte le squadre, da allineare a quelli dell'app
 * ufficiale. Stava in fondo a Gestione rose; ha una pagina sua perché si usa
 * da sola, quando i conti della lega e i nostri non coincidono.
 */
export default async function CreditiPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = await supabaseServer();
  const { data: creditiLega } = await db.from('v_team_credits')
    .select('team_id, name, credits').eq('league_id', ctx.team.leagueId).order('name');

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">Gestione squadre</p>
      <h1>Gestione crediti</h1>
      <AzioniGruppo pagina="/admin/crediti" />
      <p className="sub">
        I crediti residui di ogni squadra secondo l&apos;app. Se non coincidono con quelli
        dell&apos;app ufficiale, scrivi il numero giusto: la differenza diventa un movimento
        di credito, con il motivo, e finisce nel registro.
      </p>

      <CreditiEditor
        squadre={(creditiLega ?? []).map((t) => ({
          id: String(t.team_id), name: String(t.name), credits: Number(t.credits ?? 0),
        }))}
      />
    </div>
  );
}
