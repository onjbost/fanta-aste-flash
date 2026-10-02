import type { ReactNode } from 'react';

/**
 * L'involucro dell'area admin.
 *
 * Il menù delle sezioni admin adesso vive nel cassetto ☰ della testata,
 * insieme alle voci di tutti: qui non resta niente da aggiungere. Il
 * controllo su chi sei lo fa ogni pagina con `requireTeamContext`.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
