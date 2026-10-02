import { Suspense } from 'react';
import { supabaseAdmin } from '@/lib/supabase';
import { ICONE } from '../BottomNav';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

/**
 * Tre numeri della lega per la porta d'ingresso: squadre, aste in stagione,
 * giornate di Serie A. Chi arriva qui non è ancora entrato, quindi li legge
 * il server con la chiave di servizio — solo conteggi, nessun dato di nessuno.
 * Se qualcosa non risponde la fila sparisce: il login non deve mai rompersi
 * per una decorazione.
 */
async function numeriDellaLega(): Promise<{ v: number; k: string }[] | null> {
  try {
    const db = supabaseAdmin();
    const conta = (t: string) => db.from(t).select('id', { count: 'exact', head: true });
    const [squadre, aste, giornate] = await Promise.all([
      conta('teams'), conta('auction_sessions'), conta('matchdays'),
    ]);
    if (squadre.error || aste.error || giornate.error) return null;
    return [
      { v: squadre.count ?? 0, k: 'squadre' },
      { v: aste.count ?? 0, k: 'aste flash' },
      { v: giornate.count ?? 0, k: 'giornate' },
    ].filter((n) => n.v > 0);
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const numeri = await numeriDellaLega();

  return (
    <main className="login">
      <div className="login-marchio">
        <span className="login-logo">{ICONE.asta}</span>
        <span>Aste <b>Flash</b></span>
      </div>

      <h1 className="login-titolo">Il mercato della <span>Fanta Mansarda</span></h1>

      {numeri && numeri.length > 0 && (
        <div className="login-numeri">
          {numeri.map((n) => (
            <div key={n.k}><b className="num">{n.v}</b><span>{n.k}</span></div>
          ))}
        </div>
      )}

      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
