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
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F1F3F0' },
    { media: '(prefers-color-scheme: dark)', color: '#101614' },
  ],
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
          href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
