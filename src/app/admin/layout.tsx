import type { ReactNode } from 'react';
import { MenuAdmin } from './MenuAdmin';

/**
 * L'involucro dell'area admin: serve solo a dare il menù a tutte le pagine
 * sotto `/admin` senza infilarlo in ognuna a mano.
 *
 * Qui non si legge niente dal database e non si controlla chi sei. Non è una
 * dimenticanza: il controllo lo fa ogni pagina con `requireTeamContext` e il
 * rimando alla home, e rifarlo qui vorrebbe dire una interrogazione in più
 * su ogni pagina dell'area. Il menù è una manciata di collegamenti — chi non
 * è admin, se anche li vedesse, verrebbe rimandato indietro al primo clic.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="area-admin">
      <MenuAdmin />
      {children}
    </div>
  );
}
