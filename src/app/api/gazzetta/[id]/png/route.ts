import { NextResponse } from 'next/server';
import { leggiGazzetta } from '@/lib/gazzetta/gazzettaServer';
import { primaInPng } from '@/lib/gazzetta/png';
import { supabaseServer } from '@/lib/supabase';

/**
 * Il PNG della prima pagina, reso al momento.
 *
 * Non si salva da nessuna parte: si legge `dati` e si disegna. Un PNG
 * conservato sarebbe una copia che invecchia, e il modo più facile di
 * mandare nel gruppo la versione di prima delle correzioni.
 *
 * Per questo l'editor salva e **poi** scarica: quello che esce da qui è
 * sempre quello che sta nel database, non quello che stava sullo schermo.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _req: Request, { params }: { params: Promise<{ id: string }> },
) {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });

  const { data: m } = await db.from('team_members')
    .select('is_admin').eq('user_id', auth.user.id).maybeSingle();
  if (!m?.is_admin) return NextResponse.json({ error: 'non autorizzato' }, { status: 403 });

  const { id } = await params;
  const gazzetta = await leggiGazzetta(id);
  if (!gazzetta) return NextResponse.json({ error: 'non esiste' }, { status: 404 });

  const png = await primaInPng(gazzetta.dati);
  const nome = `gazzetta-${gazzetta.tipo}-${gazzetta.versione}.png`;

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename="${nome}"`,
      // mai in cache: la pagina cambia a ogni correzione dell'admin
      'cache-control': 'no-store',
    },
  });
}
