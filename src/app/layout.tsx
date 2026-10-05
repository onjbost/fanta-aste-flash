import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Le funzioni girano a Francoforte, dove sta il database.
 *
 * Vercel per difetto le mette a Washington: ogni interrogazione a Supabase
 * (eu-central-1) attraversava l'Atlantico due volte, un decimo di secondo a
 * botta. Una pagina che ne fa sei ci perdeva mezzo secondo abbondante prima
 * ancora di iniziare a disegnare. Stessa architettura, stesso codice: cambia
 * solo il continente.
 */
export const preferredRegion = 'fra1';

export const metadata: Metadata = {
  title: 'Aste Flash · Fanta Mansarda',
  description: 'Mercato degli svincolati della Lega Fanta Mansarda',
  manifest: '/manifest.json',
  // le icone (favicon e home del telefono) sono il martello del login
  // (Logo.tsx): icon.svg, favicon.ico e apple-icon.png in questa cartella, le
  // altre in public/. Si rigenerano con `node scripts/icone.mjs`
  appleWebApp: { capable: true, title: 'Aste Flash', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  // un tema solo, scuro: la barra del telefono prende il verde notte del fondo
  themeColor: '#0C1410',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap"
        />
      </head>
      {/* il contenitore che scorre quando l'app è aperta dall'icona: vedi
          `.app-scorre` in globals.css. Nel browser è un div qualunque */}
      <body><div className="app-scorre">{children}</div></body>
    </html>
  );
}
