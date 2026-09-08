import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { validaPayload } from '@/lib/redazione/tabellino';
import { TopBar } from '@/app/TopBar';
import { Correttore } from './Correttore';

export const dynamic = 'force-dynamic';

/**
 * La pagina di correzione di un import.
 *
 * Il grezzo è già in archivio — `redazione_imports` lo salva prima di
 * giudicarlo — quindi qui non si ricopia niente dalla lega: si riapre quello
 * che era arrivato, si sistemano i numeri che mancavano e lo si rimanda.
 */
export default async function CorreggiPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const { id } = await params;
  const db = supabaseAdmin();
  const { data: riga } = await db.from('redazione_imports')
    .select('id, giornata, stato, errore, ricevuto_il, payload, league_id')
    .eq('id', id).maybeSingle();

  const intestazione = (
    <>
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />
      <p className="eyebrow">
        <Link href="/admin/redazione">Redazione</Link> · correzione
      </p>
    </>
  );

  if (!riga || riga.league_id !== ctx.team.leagueId) {
    return (
      <div className="shell">
        {intestazione}
        <h1>Import inesistente</h1>
        <div className="callout crit">Questo import non c&apos;è, o non è di questa lega.</div>
      </div>
    );
  }

  const v = validaPayload(riga.payload);
  if (!v.ok) {
    return (
      <div className="shell">
        {intestazione}
        <h1>Grezzo illeggibile</h1>
        <div className="callout crit">
          {v.errore}.<br />
          Qui non c&apos;è niente da correggere: la pagina va ripresa dalla lega con il preferito.
        </div>
      </div>
    );
  }

  const payload = v.valore;

  return (
    <div className="shell">
      {intestazione}
      <h1>Giornata {payload.giornata ?? '—'}</h1>
      <p className="sub">
        Arrivato il {new Date(riga.ricevuto_il as string).toLocaleString('it-IT', {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
        })}
        {' · '}stato <b>{String(riga.stato)}</b>
        {riga.errore ? ` · ${riga.errore}` : ''}
      </p>

      <div className="callout">
        Il conto si rifà mentre scrivi, con la stessa regola che userà l&apos;import: fantavoti di
        chi è sceso in campo, più modificatore e bonus capitano, contro il totale che dà la lega.
        Quando una squadra quadra diventa verde. Quello che mandi è una copia corretta — il grezzo
        originale resta in archivio così com&apos;era arrivato.
      </div>

      <Correttore importId={riga.id as string} payload={payload} />
    </div>
  );
}
