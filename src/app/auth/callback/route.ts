import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/** Atterraggio del magic link: scambia il codice per una sessione e porta alla rosa. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const db = await supabaseServer();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link_scaduto`);
}
