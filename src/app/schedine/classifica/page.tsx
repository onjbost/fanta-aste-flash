import { redirect } from 'next/navigation';

/** La classifica adesso è una tab: il vecchio indirizzo resta buono. */
export default function ClassificaRedirect() {
  redirect('/schedine?tab=classifica');
}
