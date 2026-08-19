import type { Metadata } from 'next';
import UrlTipFooter from './components/UrlTipFooter';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Multilink - Universal Music Links',
    template: '%s | Multilink',
  },
  description: 'Search and cross-link tracks across YouTube, Spotify, and Apple Music.',
  openGraph: {
    title: 'Multilink - Universal Music Links',
    description: 'Search and cross-link tracks across YouTube, Spotify, and Apple Music.',
    siteName: 'Multilink',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Multilink - Universal Music Links',
    description: 'Search and cross-link tracks across YouTube, Spotify, and Apple Music.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <UrlTipFooter />
      </body>
    </html>
  );
}
