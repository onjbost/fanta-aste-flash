import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';
import { notifyAdmin, tgFirstLogin } from '@/lib/telegram';

/**
 * Registra l'accesso e, se è il primo, avvisa l'admin.
 *
 * La riga in app_logins nasce una volta sola: da lì in poi si aggiornano
 * solo data e contatore. Così "primo accesso" è un fatto scritto, non una
 * deduzione da confrontare ogni volta con last_sign_in_at.
 *
 * Non è mai bloccante: se qualcosa qui dentro va storto, l'accesso deve
 * comunque riuscire.
 */
async function recordLogin(userId: string, email: string | undefined) {
  try {
    const db = supabaseAdmin();
    const { data: existing } = await db.from('app_logins')
      .select('user_id, logins').eq('user_id', userId).maybeSingle();

    if (existing) {
      await db.from('app_logins').update({
        last_seen_at: new Date().toISOString(),
        logins: (existing.logins ?? 0) + 1,
        email,
      }).eq('user_id', userId);
      return;
    }

    await db.from('app_logins').insert({ user_id: userId, email });

    const { data: member } = await db.from('team_members')
      .select('team_id').eq('user_id', userId).maybeSingle();
    await notifyAdmin(tgFirstLogin(email ?? '(senza email)', !!member));
  } catch {
    // un accesso non deve fallire perché la notifica non parte
  }
}

/** Atterraggio del magic link: scambia il codice per una sessione e porta alla rosa. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Supabase può rimandare qui anche con un errore esplicito (link scaduto,
  // già usato, redirect non in whitelist): meglio dirlo che mostrare una
  // pagina bianca.
  const errorDescription = searchParams.get('error_description');
  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription)}`);
  }

  if (code) {
    const db = await supabaseServer();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) await recordLogin(data.user.id, data.user.email);
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Link non valido o già usato. Chiedine un altro.')}`,
  );
}
