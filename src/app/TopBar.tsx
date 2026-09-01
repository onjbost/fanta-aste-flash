import { signOut } from './actions';
import { BottomNav, type NavKey } from './BottomNav';

export function TopBar(props: { teamName: string; isAdmin: boolean; active: NavKey }) {
  return (
    <>
      <div className="topbar">
        <div className="brand">Aste Flash <span>·</span> Fanta Mansarda</div>
        <div className="topbar-right">
          <span className="who">{props.teamName}</span>
          <form action={signOut}><button className="link" type="submit">Esci</button></form>
        </div>
      </div>
      <BottomNav active={props.active} isAdmin={props.isAdmin} />
    </>
  );
}
