import { redirect } from 'next/navigation';

/** Le classifiche adesso stanno tutte su /classifica: il vecchio indirizzo resta buono. */
export default function ClassificaRedirect() {
  redirect('/classifica?c=tipster&da=schedine');
}
