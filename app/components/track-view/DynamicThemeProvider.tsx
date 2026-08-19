'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { PaletteTheme } from '@/app/lib/palette';

interface ThemeContextType {
  palette: PaletteTheme | null;
  setPalette: (p: PaletteTheme | null) => void;
  loadPaletteFromArtwork: (url: string) => Promise<void>;
}

const DynamicThemeContext = createContext<ThemeContextType>({
  palette: null,
  setPalette: () => {},
  loadPaletteFromArtwork: async () => {},
});

export function DynamicThemeProvider({
  initialPalette,
  initialArtworkUrl,
  children,
}: {
  initialPalette?: PaletteTheme | null;
  initialArtworkUrl?: string | null;
  children: React.ReactNode;
}) {
  const [palette, setPalette] = useState<PaletteTheme | null>(initialPalette || null);

  const loadPaletteFromArtwork = async (url: string) => {
    if (!url) return;
    try {
      const res = await fetch(`/api/palette?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data: PaletteTheme = await res.json();
        setPalette(data);
      }
    } catch (e) {
      console.error('Failed to load dynamic palette:', e);
    }
  };

  useEffect(() => {
    if (!palette && initialArtworkUrl) {
      loadPaletteFromArtwork(initialArtworkUrl);
    }
  }, [initialArtworkUrl, palette]);

  const cssVars = palette?.cssVars || {};

  return (
    <DynamicThemeContext.Provider value={{ palette, setPalette, loadPaletteFromArtwork }}>
      <div
        className="dynamic-theme-root"
        style={
          {
            ...cssVars,
            position: 'relative',
            minHeight: '100vh',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            transition: 'background 0.5s ease-in-out',
            background: palette?.backgroundCss || undefined,
          } as React.CSSProperties
        }
      >
        {/* Ambient Halo behind Artwork if configured */}
        {palette?.haloColor && (
          <div
            className="ambient-spotlight-halo"
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              borderRadius: '50%',
              filter: 'blur(80px)',
              zIndex: 1,
              width: 'var(--halo-radius, 680px)',
              height: 'var(--halo-radius, 680px)',
              top: 'calc(45% - calc(var(--halo-radius, 680px) / 2))',
              left: 'calc(50% - calc(var(--halo-radius, 680px) / 2))',
              background: palette.haloColor,
              opacity: 'var(--halo-opacity, 0.7)',
              transition: 'all 0.5s ease-in-out',
            }}
          />
        )}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1 }}>
          {children}
        </div>
      </div>
    </DynamicThemeContext.Provider>
  );
}

export function useDynamicTheme() {
  return useContext(DynamicThemeContext);
}
