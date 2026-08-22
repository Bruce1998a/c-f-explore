import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: 'C-F Explore · Clima y riesgos de Ecuador',
  description: 'Análisis interactivo de índices de El Niño y eventos peligrosos registrados en Ecuador.',
  openGraph: {
    title: 'C-F Explore · Clima y riesgos de Ecuador',
    description: 'Compara índices de El Niño y analiza eventos peligrosos por provincia y región.',
    type: 'website',
    images: [{ url: '/og.png', width: 2048, height: 1072, alt: 'C-F Explore · Clima y riesgos de Ecuador' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'C-F Explore · Clima y riesgos de Ecuador',
    description: 'Compara índices de El Niño y analiza eventos peligrosos por provincia y región.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
