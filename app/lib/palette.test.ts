import { describe, expect, test } from 'bun:test';
import {
  hslToRgb,
  rgbToHex,
  rgbToHsl,
  getRelativeLuminance,
  getContrastRatio,
  buildPaletteTheme,
} from './palette';

describe('Dynamic Album Art Palette & Typography Contrast Engine', () => {
  test('hslToRgb and rgbToHex conversion', () => {
    const rgb = hslToRgb(0, 100, 50); // Red
    expect(rgb).toEqual([255, 0, 0]);
    expect(rgbToHex(...rgb)).toBe('#ff0000');

    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  test('WCAG luminance and contrast ratio calculations', () => {
    const white: [number, number, number] = [255, 255, 255];
    const black: [number, number, number] = [0, 0, 0];

    const lumWhite = getRelativeLuminance(...white);
    const lumBlack = getRelativeLuminance(...black);

    expect(lumWhite).toBeCloseTo(1, 2);
    expect(lumBlack).toBe(0);

    const contrast = getContrastRatio(white, black);
    expect(contrast).toBeCloseTo(21, 0); // 21:1 max contrast
  });

  test('buildPaletteTheme extracts contrast-compliant typography and CSS variables', () => {
    // Tame Impala - Currents style: Dark Indigo dominant + Striking Gold/Orange Accent
    const dominantHsl = { h: 220, s: 65, l: 20 };
    const accentHsl = { h: 38, s: 95, l: 50 };

    const theme = buildPaletteTheme(dominantHsl, accentHsl, {
      patternMode: 'spotlightHalo',
      textMode: 'adaptiveAccent',
      textLightness: 90,
    });

    expect(theme.topHex).toBeDefined();
    expect(theme.accentHex).toBeDefined();
    expect(theme.baseHex).toBeDefined();
    expect(theme.titleColor).toBeDefined();
    expect(theme.backgroundCss).toContain('linear-gradient');
    expect(theme.haloColor).toContain('radial-gradient');
    expect(theme.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(theme.cssVars['--c-bg-top']).toBe(theme.topHex);
    expect(theme.cssVars['--c-text-title']).toBe(theme.titleColor);
  });
});
