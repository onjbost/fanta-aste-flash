'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase';

export type UsernameState = { ok: boolean; message: string } | null;

/**
 * Ognuno sceglie come si chiama nel registro.
 *
 * Lo scrive una server action col service role e non il browser: su
 * `team_members` non c'è — e non ci deve essere — una policy di
 * aggiornamento, perché una policy di Postgres filtra le righe e non le
 * colonne, e su quella riga c'è anche `is_admin`. Qui si tocca una colonna
 * sola, e solo quella della propria riga.
 */
export async function salvaUsername(_prev: UsernameState, form: FormData): Promise<UsernameState> {
  const grezzo = String(form.get('username') ?? '').trim();

  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sessione scaduta, rientra.' };

  const admin = supabaseAdmin();

  // vuoto = torno a farmi chiamare con l'email
  if (grezzo === '') {
    await admin.from('team_members').update({ username: null }).eq('user_id', auth.user.id);
    revalidatePath('/registro');
    return { ok: true, message: 'Nome rimosso: nel registro comparirà la tua email.' };
  }

  if (grezzo.length < 3 || grezzo.length > 20) {
    return { ok: false, message: 'Il nome va da 3 a 20 caratteri.' };
  }
  /*
   * Lettere, numeri, spazio, punto, trattino e underscore. Niente parentesi:
   * nel registro la squadra sta già fra parentesi, e un nome che se ne porta
   * dietro un paio renderebbe la riga illeggibile.
   */
  if (!/^[\p{L}\p{N} ._-]+$/u.test(grezzo)) {
    return { ok: false, message: 'Usa lettere, numeri, spazi, punti, trattini.' };
  }

  const { data: mio } = await admin.from('team_members')
    .select('league_id').eq('user_id', auth.user.id).maybeSingle();
  if (!mio) return { ok: false, message: 'Non risulti collegato a nessuna squadra.' };

  // preso da un altro: il controllo è anche nel database (indice unico), ma
  // un messaggio chiaro vale più di un errore di vincolo
  const { data: presi } = await admin.from('team_members')
    .select('user_id, username').eq('league_id', mio.league_id).not('username', 'is', null);
  const collisione = (presi ?? []).find(
    (m) => m.user_id !== auth.user!.id
      && String(m.username).toLowerCase() === grezzo.toLowerCase(),
  );
  if (collisione) return { ok: false, message: 'Questo nome l\'ha già preso un altro allenatore.' };

  const { error } = await admin.from('team_members')
    .update({ username: grezzo }).eq('user_id', auth.user.id);
  if (error) return { ok: false, message: `Non è andata: ${error.message}` };

  revalidatePath('/registro');
  revalidatePath('/');
  return { ok: true, message: `Fatto: nel registro sei ${grezzo}.` };
}
