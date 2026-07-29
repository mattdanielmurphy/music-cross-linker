import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Music Cross Linker - Universal Track Links',
  description: 'Search and cross-link tracks across YouTube, Spotify, and Apple Music.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
