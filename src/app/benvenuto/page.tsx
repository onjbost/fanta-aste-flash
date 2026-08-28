import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { signOut } from '../actions';
import { CopySql } from './CopySql';

export const dynamic = 'force-dynamic';

/**
 * Sei entrato, ma il tuo account non è ancora collegato a una squadra.
 *
 * È lo stato in cui si trova chiunque al primo accesso, admin compreso:
 * l'utente esiste in Supabase solo dopo che ha aperto il magic link, quindi
 * il collegamento alla squadra può avvenire soltanto adesso. Invece di
 * rimbalzare al login — che creerebbe un giro infinito — spieghiamo cosa
 * manca e diamo all'admin il comando già pronto.
 */
export default async function BenvenutoPage() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: team } = await db.from('teams')
    .select('id').eq('user_id', auth.user.id).maybeSingle();
  if (team) redirect('/');

  const email = auth.user.email ?? '';
  const { data: teams } = await db.from('teams')
    .select('name, user_id').order('name');
  const libere = (teams ?? []).filter((t) => !t.user_id).map((t) => t.name);

  const sql = `update teams
   set user_id  = (select id from auth.users where email = '${email}'),
       email    = '${email}',
       is_admin = true
 where name = '${libere[0] ?? 'Nome Squadra'}';`;

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">Aste Flash <span>·</span> Fanta Mansarda</div>
        <nav>
          <form action={signOut}><button className="link" type="submit">Esci</button></form>
        </nav>
      </div>

      <p className="eyebrow">Ci siamo quasi</p>
      <h1>Account da collegare</h1>
      <p className="sub">
        Sei entrato come <b>{email}</b>, ma questo account non è ancora associato a
        nessuna squadra della lega. Deve farlo l'admin, una volta sola.
      </p>

      {libere.length > 0 ? (
        <>
          <div className="callout">
            Squadre ancora senza allenatore collegato: <b>{libere.join(', ')}</b>.
          </div>

          <h2>Se l'admin sei tu</h2>
          <p style={{ fontSize: '.92rem', color: 'var(--muted)' }}>
            Apri Supabase → <b>SQL Editor</b>, incolla questo, cambia il nome della
            squadra con la tua e premi <i>Run</i>. Poi ricarica questa pagina.
          </p>
          <CopySql sql={sql} />
          <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
            Per gli altri allenatori è lo stesso comando senza <code>is_admin = true</code>.
          </p>
        </>
      ) : (
        <div className="callout">
          Tutte le squadre risultano già collegate a un allenatore. Se questo account
          dovrebbe essere il tuo, chiedi all'admin di controllare l'indirizzo email
          associato alla tua squadra.
        </div>
      )}
    </div>
  );
}
