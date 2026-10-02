import { RosaVista } from './rosa/RosaVista';

export const dynamic = 'force-dynamic';

// Provvisoria: la Home nuova (banner partita, scadenze) arriva con la fase 2.
export default function Home() {
  return <RosaVista active="home" />;
}
