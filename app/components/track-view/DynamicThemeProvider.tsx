'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { PaletteTheme } from '@/app/lib/palette';
import type { MediaType } from '@/app/lib/urlResolver';

export interface PlatformMatchReport {
  platform: 'spotify' | 'apple_music' | 'youtube';
  url?: string | null;
  entityType?: MediaType;
  artworkUrl?: string | null;
  confidence?: 'high' | 'low' | 'none' | number | null;
}

interface ThemeContextType {
  palette: PaletteTheme | null;
  setPalette: (p: PaletteTheme | null) => void;
  loadPaletteFromArtwork: (url: string) => Promise<void>;
  reconciledType: MediaType | null;
  reportPlatformMatch: (report: PlatformMatchReport) => void;
}

const DEFAULT_FALLBACK_VARS: Record<string, string> = {
  '--c-bg-top': '#181920',
  '--c-bg-accent': '#232530',
  '--c-bg-base': '#08090a',
  '--c-text-title': '#ffffff',
  '--c-text-artist': 'rgba(255, 255, 255, 0.88)',
  '--c-text-artist-shadow': '0 2px 10px rgba(0, 0, 0, 0.6)',
  '--c-text-glow': '0 2px 12px rgba(0, 0, 0, 0.7)',
  '--c-card-border': 'rgba(255, 255, 255, 0.1)',
  '--c-badge-bg': 'rgba(255, 255, 255, 0.06)',
  '--c-badge-border': 'rgba(255, 255, 255, 0.15)',
  '--c-badge-color': '#ffffff',
  '--c-player-shadow': '0 18px 42px rgba(0, 0, 0, 0.85)',
};

const DynamicThemeContext = createContext<ThemeContextType>({
  palette: null,
  setPalette: () => {},
  loadPaletteFromArtwork: async () => {},
  reconciledType: null,
  reportPlatformMatch: () => {},
});

export function DynamicThemeProvider({
  initialPalette,
  initialArtworkUrl,
  initialType,
  children,
}: {
  initialPalette?: PaletteTheme | null;
  initialArtworkUrl?: string | null;
  initialType?: MediaType;
  children: React.ReactNode;
}) {
  const [palette, setPalette] = useState<PaletteTheme | null>(initialPalette || null);
  const [reconciledType, setReconciledType] = useState<MediaType | null>(initialType || null);
  const reportsRef = useRef<Map<string, PlatformMatchReport>>(new Map());
  const currentArtworkRef = useRef<string | null>(initialArtworkUrl || null);

  const loadPaletteFromArtwork = useCallback(async (url: string) => {
    if (!url) return;
    try {
      currentArtworkRef.current = url;
      const res = await fetch(`/api/palette?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data: PaletteTheme = await res.json();
        setPalette(data);
      }
    } catch (e) {
      console.error('Failed to load dynamic palette:', e);
    }
  }, []);

  const reportPlatformMatch = useCallback((report: PlatformMatchReport) => {
    if (!report.platform) return;
    reportsRef.current.set(report.platform, report);

    // 1. Evaluate consensus type promotion
    const reports = Array.from(reportsRef.current.values()).filter(
      r => r.url && r.entityType && !r.url.includes('/search')
    );
    const albumReports = reports.filter(r => r.entityType === 'album');

    if (albumReports.length >= 2 || (reports.length === 1 && albumReports.length === 1)) {
      setReconciledType('album');
    }

    // 2. High quality artwork sampling priority: Apple / Spotify album art > YouTube thumbnail
    const appleMatch = reportsRef.current.get('apple_music');
    const spotifyMatch = reportsRef.current.get('spotify');
    const candidateArt = appleMatch?.artworkUrl || spotifyMatch?.artworkUrl || report.artworkUrl;

    if (candidateArt && (!palette || candidateArt !== currentArtworkRef.current)) {
      loadPaletteFromArtwork(candidateArt);
    }
  }, [palette, loadPaletteFromArtwork]);

  useEffect(() => {
    if (!palette && initialArtworkUrl) {
      loadPaletteFromArtwork(initialArtworkUrl);
    }
  }, [initialArtworkUrl, palette, loadPaletteFromArtwork]);

  const cssVars = palette?.cssVars || DEFAULT_FALLBACK_VARS;
  const backgroundCss = palette?.backgroundCss || 'linear-gradient(190deg, #181920 0%, #101116 30%, #08090a 100%)';

  return (
    <DynamicThemeContext.Provider value={{ palette, setPalette, loadPaletteFromArtwork, reconciledType, reportPlatformMatch }}>
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
            background: backgroundCss,
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
