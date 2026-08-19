import { describe, expect, test } from 'bun:test';
import {
  hslToRgb,
  rgbToHex,
  rgbToHsl,
  getRelativeLuminance,
  getContrastRatio,
  buildPaletteTheme,
  getAestheticScoreMultiplier,
  sanitizeHarmoniousHsl,
  extractArtworkHues,
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

  test('Gross Color Rejection List heavily penalizes murky olive, baby poop, and sludge tones', () => {
    // Olive sludge (h ~ 70)
    const sludgeMult = getAestheticScoreMultiplier(70, 60, 30);
    expect(sludgeMult).toBe(0.05); // 95% penalty

    // Dirty mustard (h ~ 50)
    const mustardMult = getAestheticScoreMultiplier(50, 50, 40);
    expect(mustardMult).toBe(0.20); // 80% penalty

    // Rich Sunset Amber / Golden Honey (h ~ 35) gets aesthetic boost
    const sunsetMult = getAestheticScoreMultiplier(35, 80, 50);
    expect(sunsetMult).toBe(1.30);

    // Deep Twilight Blue / Sapphire (h ~ 220) gets aesthetic boost
    const indigoMult = getAestheticScoreMultiplier(220, 70, 35);
    expect(indigoMult).toBe(1.30);
  });

  test('sanitizeHarmoniousHsl remaps ugly olive tones to warm gold or rich emerald', () => {
    // Dirty mustard / yellow-olive (h = 60) -> warm gold (h = 42)
    const cleanGold = sanitizeHarmoniousHsl({ h: 60, s: 80, l: 35 });
    expect(cleanGold.h).toBe(42);

    // Sludge olive (h = 85) -> rich forest emerald (h = 135)
    const cleanEmerald = sanitizeHarmoniousHsl({ h: 85, s: 70, l: 30 });
    expect(cleanEmerald.h).toBe(135);

    // Pleasing twilight blue (h = 220) remains intact
    const blue = sanitizeHarmoniousHsl({ h: 220, s: 60, l: 30 });
    expect(blue.h).toBe(220);
  });

  test('extractArtworkHues computes true perceptual average ambient and avoids ugly background sludge', async () => {
    // Create synthetic 80x80 image buffer (sharp):
    // Sunset sky (orange/salmon/purple) + small cluster of murky olive pixels
    const width = 80;
    const height = 80;
    const channels = 4;
    const rawBuffer = Buffer.alloc(width * height * channels);

    for (let i = 0; i < width * height; i++) {
      const idx = i * channels;
      if (i < width * height * 0.7) {
        // 70% Sunset Orange Sky: rgb(240, 100, 40) -> Sunset Orange (h ~ 18)
        rawBuffer[idx] = 240;
        rawBuffer[idx + 1] = 100;
        rawBuffer[idx + 2] = 40;
        rawBuffer[idx + 3] = 255;
      } else {
        // 30% Olive Foliage / Murky Building: rgb(110, 100, 20) -> Murky Olive (h ~ 53)
        rawBuffer[idx] = 110;
        rawBuffer[idx + 1] = 100;
        rawBuffer[idx + 2] = 20;
        rawBuffer[idx + 3] = 255;
      }
    }

    const pngBuffer = await import('sharp').then((m) =>
      m.default(rawBuffer, { raw: { width, height, channels } }).png().toBuffer()
    );

    const hues = await extractArtworkHues(pngBuffer);

    // Dominant average should represent the warm sunset tone, not murky olive
    expect(hues.dominantHsl.h).toBeLessThanOrEqual(45);
    expect(hues.dominantHsl.h).toBeGreaterThanOrEqual(10);
  });
});
