import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

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
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Link non valido o già usato. Chiedine un altro.')}`);
}
