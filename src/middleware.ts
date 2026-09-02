import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cosa non va mandato al login.
 *
 * Le rotte sotto `/api` non hanno una sessione e non devono averla: si
 * autenticano da sole con la loro parola d'ordine — `CRON_SECRET` per il cron,
 * `REDAZIONE_IMPORT_SECRET` per l'import della giornata. Redirigerle rompe
 * tutto in silenzio: chi chiama non riceve un 401 onesto ma un 405 o una
 * pagina HTML, e ci mette un pomeriggio a capire perché.
 *
 * Sta fuori dal middleware perché è una decisione che si può provare senza
 * tirare in ballo Supabase, ed è esattamente il punto in cui l'errore si
 * nasconde.
 */
export function percorsoPubblico(path: string): boolean {
  return path.startsWith('/login')
    || path.startsWith('/auth')
    || path.startsWith('/api/')
    || path === '/redazione-bookmarklet.js';
}

/** Tiene viva la sessione Supabase a ogni richiesta e protegge le pagine private. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await db.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = percorsoPubblico(path);

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (data.user && path.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Il file del preferito è pubblico per forza: lo carica la pagina della lega,
  // che non ha e non deve avere i nostri cookie. Le immagini e gli asset di
  // Next non passano di qui per lo stesso motivo di sempre, la velocità.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json'
    + '|redazione-bookmarklet.js'
    + '|.*\\.(?:svg|png|webp|ico)$).*)',
  ],
};
