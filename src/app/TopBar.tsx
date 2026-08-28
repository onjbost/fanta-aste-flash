import Link from 'next/link';
import { signOut } from './actions';

export function TopBar(props: { teamName: string; isAdmin: boolean; active: 'rosa' | 'asta' | 'listone' | 'regolamento' | 'admin' }) {
  return (
    <div className="topbar">
      <div className="brand">Aste Flash <span>·</span> Fanta Mansarda</div>
      <nav>
        <Link href="/" className={props.active === 'rosa' ? 'active' : ''}>Rosa</Link>
        <Link href="/asta" className={props.active === 'asta' ? 'active' : ''}>Asta</Link>
        <Link href="/listone" className={props.active === 'listone' ? 'active' : ''}>Listone</Link>
        <Link href="/regolamento" className={props.active === 'regolamento' ? 'active' : ''}>Regole</Link>
        {props.isAdmin && (
          <Link href="/admin" className={props.active === 'admin' ? 'active' : ''}>Admin</Link>
        )}
        <form action={signOut}><button className="link" type="submit">Esci</button></form>
      </nav>
    </div>
  );
}
