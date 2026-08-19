import sharp from 'sharp';

export interface HslColor {
  h: number; // 0 - 360
  s: number; // 0 - 100
  l: number; // 0 - 100
}

export interface PaletteThemeConfig {
  patternMode?: 'spotlightHalo' | 'linearDual' | 'dualCornerMesh' | 'triStopHorizon' | 'radialAura';
  gradientAngle?: number;       // deg
  topSpreadPercent?: number;    // %
  midSpreadPercent?: number;    // %
  haloRadiusPx?: number;        // px
  haloOpacity?: number;         // 0.0 - 1.0
  topLightness?: number;        // %
  accentLightness?: number;     // %
  accentIntensity?: number;     // 0.0 - 1.0
  saturationMultiplier?: number;// boost factor e.g. 1.15
  baseLightness?: number;       // %
  textMode?: 'adaptiveAccent' | 'dualTone' | 'neonPop' | 'luminousWhite' | 'pureWhite';
  textLightness?: number;       // %
  textSaturation?: number;      // %
  textGlowOpacity?: number;     // 0.0 - 1.0
  cardGlowOpacity?: number;     // 0.0 - 1.0
  grainOverlay?: boolean;
  playerShadowDepth?: number;   // 1 - 4
}

export interface PaletteTheme {
  dominantHsl: HslColor;
  accentHsl: HslColor;
  topHex: string;
  accentHex: string;
  baseHex: string;
  titleColor: string;
  artistColor: string;
  textShadow: string;
  contrastRatio: number;
  backgroundCss: string;
  haloColor: string;
  cardBorderColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
  playerShadow: string;
  cssVars: Record<string, string>;
}

export const DEFAULT_PALETTE_CONFIG: Required<PaletteThemeConfig> = {
  patternMode: 'spotlightHalo',
  gradientAngle: 185,
  topSpreadPercent: 26,
  midSpreadPercent: 78,
  haloRadiusPx: 340,
  haloOpacity: 0.70,
  topLightness: 21,
  accentLightness: 38,
  accentIntensity: 0.90,
  saturationMultiplier: 1.15,
  baseLightness: 5,
  textMode: 'adaptiveAccent',
  textLightness: 90,
  textSaturation: 92,
  textGlowOpacity: 0.50,
  cardGlowOpacity: 0.40,
  grainOverlay: false,
  playerShadowDepth: 3,
};

// Simple LRU cache for computed palette themes
const PALETTE_CACHE = new Map<string, PaletteTheme>();
const MAX_CACHE_SIZE = 500;

export function clearPaletteCache(): void {
  PALETTE_CACHE.clear();
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1);
}

export function rgbToHsl(r: number, g: number, b: number): HslColor {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function getRelativeLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lum1 = getRelativeLuminance(...rgb1);
  const lum2 = getRelativeLuminance(...rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Extracts the Dominant Base Hue and the Striking Accent Hue from an image buffer
 */
export async function extractArtworkHues(
  imageBuffer: Buffer
): Promise<{ dominantHsl: HslColor; accentHsl: HslColor }> {
  // Resize to 80x80 for fast quantization and pixel inspection
  const { data, info } = await sharp(imageBuffer)
    .resize(80, 80, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const step = info.channels; // 4 (RGBA)

  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;

    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;

    // Filter extreme near-blacks and near-whites from hue dominance
    if (l < 0.05 || l > 0.95) continue;

    // 16-step RGB quantizing
    const qr = Math.floor(r / 16) * 16;
    const qg = Math.floor(g / 16) * 16;
    const qb = Math.floor(b / 16) * 16;
    const key = `${qr},${qg},${qb}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.r = Math.round((existing.r * existing.count + r) / (existing.count + 1));
      existing.g = Math.round((existing.g * existing.count + g) / (existing.count + 1));
      existing.b = Math.round((existing.b * existing.count + b) / (existing.count + 1));
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const list = Array.from(buckets.values()).map((c) => ({
    ...c,
    ...rgbToHsl(c.r, c.g, c.b),
  }));

  if (list.length === 0) {
    return {
      dominantHsl: { h: 220, s: 50, l: 30 },
      accentHsl: { h: 38, s: 95, l: 50 },
    };
  }

  // 1. Dominant Hue scoring: saturation + abundance weighting
  const sortedByDominance = [...list].sort(
    (a, b) =>
      Math.pow(b.s + 10, 0.8) * Math.log2(b.count + 2) -
      Math.pow(a.s + 10, 0.8) * Math.log2(a.count + 2)
  );
  const dom = sortedByDominance[0] || { h: 220, s: 50, l: 30 };

  // 2. Striking Accent Hue: high saturation + high hue angle distance ΔH > 45°
  // Scoring formula captures vivid streaks (e.g. Tame Impala's orange/gold stripe)
  const accents = [...list].sort((a, b) => {
    const distA = hueDistance(a.h, dom.h);
    const distB = hueDistance(b.h, dom.h);
    const scoreA = Math.pow(a.s, 2.0) * Math.pow(Math.max(distA, 25), 1.2) * Math.log2(a.count + 1);
    const scoreB = Math.pow(b.s, 2.0) * Math.pow(Math.max(distB, 25), 1.2) * Math.log2(b.count + 1);
    return scoreB - scoreA;
  });

  let acc = accents[0];
  // If the accent is too close in hue to dominant, pick complementary
  if (!acc || hueDistance(acc.h, dom.h) < 25) {
    acc = {
      r: 255,
      g: 165,
      b: 0,
      count: 1,
      h: (dom.h + 180) % 360,
      s: 85,
      l: 50,
    };
  }

  return {
    dominantHsl: { h: dom.h, s: dom.s, l: dom.l },
    accentHsl: { h: acc.h, s: acc.s, l: acc.l },
  };
}

/**
 * Builds the complete PaletteTheme given dominant/accent HSL and design configuration
 */
export function buildPaletteTheme(
  dominantHsl: HslColor,
  accentHsl: HslColor,
  userConfig: PaletteThemeConfig = {}
): PaletteTheme {
  const config = { ...DEFAULT_PALETTE_CONFIG, ...userConfig };
  const satMult = config.saturationMultiplier;

  // 1. Dominant Top Color
  const topSat = Math.min(100, Math.round(dominantHsl.s * satMult));
  const topRgb = hslToRgb(dominantHsl.h, topSat, config.topLightness);
  const topHex = rgbToHex(...topRgb);

  // 2. Striking Accent Color
  const accentSat = Math.min(100, Math.round(accentHsl.s * satMult * 1.05));
  const accentRgb = hslToRgb(accentHsl.h, accentSat, config.accentLightness);
  const accentHex = rgbToHex(...accentRgb);

  // 3. Base Floor Color (dark obsidian/slate floor)
  const baseRgb = hslToRgb(215, 12, config.baseLightness);
  const baseHex = rgbToHex(...baseRgb);

  // 4. Background Gradient
  let backgroundCss = '';
  let haloColor = '';

  if (config.patternMode === 'linearDual') {
    backgroundCss = `linear-gradient(${config.gradientAngle}deg, ${topHex} 0%, ${topHex} ${config.topSpreadPercent}%, ${accentHex} ${config.midSpreadPercent}%, ${baseHex} 100%)`;
  } else if (config.patternMode === 'spotlightHalo') {
    backgroundCss = `linear-gradient(${config.gradientAngle}deg, ${topHex} 0%, ${topHex} ${config.topSpreadPercent}%, ${baseHex} 95%)`;
    haloColor = `radial-gradient(circle, ${accentHex} 0%, rgba(0,0,0,0) 70%)`;
  } else if (config.patternMode === 'dualCornerMesh') {
    backgroundCss = `radial-gradient(at 15% 15%, ${topHex} 0%, transparent 60%), radial-gradient(at 85% 35%, ${accentHex} 0%, transparent 65%), linear-gradient(180deg, #0b0d12 0%, ${baseHex} 100%)`;
  } else if (config.patternMode === 'triStopHorizon') {
    backgroundCss = `linear-gradient(${config.gradientAngle}deg, ${topHex} 0%, ${topHex} ${Math.max(10, config.topSpreadPercent - 10)}%, ${accentHex} ${config.topSpreadPercent}%, ${topHex} ${config.midSpreadPercent}%, ${baseHex} 100%)`;
  } else if (config.patternMode === 'radialAura') {
    backgroundCss = `radial-gradient(circle at 50% 35%, ${accentHex} 0%, ${topHex} 50%, ${baseHex} 100%)`;
  }

  // 5. Typography & Text Color Calculation with adaptive contrast enforcement
  let titleColor = '#ffffff';
  let artistColor = 'rgba(255, 255, 255, 0.9)';
  let textShadow = 'none';
  let titleRgb: [number, number, number] = [255, 255, 255];

  let textLightness = config.textLightness;
  const textSaturation = Math.min(100, Math.round(accentHsl.s * (config.textSaturation / 100)));

  if (config.textMode === 'adaptiveAccent') {
    titleRgb = hslToRgb(accentHsl.h, textSaturation, textLightness);
    titleColor = rgbToHex(...titleRgb);
    artistColor = 'rgba(255, 255, 255, 0.92)';
  } else if (config.textMode === 'dualTone') {
    titleRgb = hslToRgb(accentHsl.h, textSaturation, textLightness);
    titleColor = rgbToHex(...titleRgb);
    const artistRgb = hslToRgb(
      accentHsl.h,
      Math.round(textSaturation * 0.35),
      Math.min(95, textLightness + 4)
    );
    artistColor = rgbToHex(...artistRgb);
  } else if (config.textMode === 'neonPop') {
    titleRgb = hslToRgb(accentHsl.h, 100, Math.min(95, textLightness + 2));
    titleColor = rgbToHex(...titleRgb);
    artistColor = '#ffffff';
  } else if (config.textMode === 'luminousWhite') {
    titleRgb = hslToRgb(accentHsl.h, Math.round(textSaturation * 0.2), 95);
    titleColor = rgbToHex(...titleRgb);
    artistColor = 'rgba(255, 255, 255, 0.85)';
  } else {
    titleColor = '#ffffff';
    titleRgb = [255, 255, 255];
    artistColor = 'rgba(255, 255, 255, 0.88)';
  }

  // Ensure minimum 4.5:1 contrast against top background
  let contrastRatio = getContrastRatio(titleRgb, topRgb);
  if (contrastRatio < 4.5 && textLightness < 98) {
    while (contrastRatio < 4.5 && textLightness <= 98) {
      textLightness += 2;
      titleRgb = hslToRgb(accentHsl.h, textSaturation, textLightness);
      contrastRatio = getContrastRatio(titleRgb, topRgb);
    }
    titleColor = rgbToHex(...titleRgb);
  }

  // 6. Text Glow Shadow
  if (config.textGlowOpacity > 0) {
    const glowRgb = hslToRgb(accentHsl.h, 95, 60);
    const glowOpacity = config.textGlowOpacity * 0.7;
    const glowBlur = Math.round(config.textGlowOpacity * 22);
    textShadow = `0 0 ${glowBlur}px rgba(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]}, ${glowOpacity}), 0 2px 10px rgba(0,0,0,0.8)`;
  } else {
    textShadow = '0 2px 12px rgba(0, 0, 0, 0.7)';
  }

  // 7. Cards, Badges & Player Glow
  const cardBorderColor = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${config.cardGlowOpacity * 0.6})`;
  const badgeBg = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.12)`;
  const badgeBorder = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.4)`;
  const badgeColor = titleColor;

  let playerShadow = '';
  if (config.playerShadowDepth === 1) {
    playerShadow = '0 6px 16px rgba(0, 0, 0, 0.6)';
  } else if (config.playerShadowDepth === 2) {
    playerShadow = '0 12px 28px rgba(0, 0, 0, 0.75), 0 0 1px rgba(255,255,255,0.15)';
  } else if (config.playerShadowDepth === 3) {
    playerShadow = `0 18px 42px rgba(0, 0, 0, 0.85), 0 0 30px rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.25)`;
  } else {
    playerShadow = `0 24px 56px rgba(0, 0, 0, 0.9), 0 0 45px rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.45)`;
  }

  const cssVars: Record<string, string> = {
    '--c-bg-top': topHex,
    '--c-bg-accent': accentHex,
    '--c-bg-base': baseHex,
    '--c-text-title': titleColor,
    '--c-text-artist': artistColor,
    '--c-text-glow': textShadow,
    '--c-card-border': cardBorderColor,
    '--c-badge-bg': badgeBg,
    '--c-badge-border': badgeBorder,
    '--c-badge-color': badgeColor,
    '--c-player-shadow': playerShadow,
    '--grad-angle': `${config.gradientAngle}deg`,
    '--top-spread': `${config.topSpreadPercent}%`,
    '--mid-spread': `${config.midSpreadPercent}%`,
    '--halo-radius': `${config.haloRadiusPx}px`,
    '--halo-opacity': `${config.haloOpacity}`,
  };

  return {
    dominantHsl,
    accentHsl,
    topHex,
    accentHex,
    baseHex,
    titleColor,
    artistColor,
    textShadow,
    contrastRatio: parseFloat(contrastRatio.toFixed(2)),
    backgroundCss,
    haloColor,
    cardBorderColor,
    badgeBg,
    badgeBorder,
    badgeColor,
    playerShadow,
    cssVars,
  };
}

/**
 * High-level helper: Extracts palette from image URL with in-memory caching
 */
export async function getPaletteForArtworkUrl(
  artworkUrl: string,
  config?: PaletteThemeConfig
): Promise<PaletteTheme> {
  const cacheKey = `${artworkUrl}::${JSON.stringify(config || {})}`;
  if (PALETTE_CACHE.has(cacheKey)) {
    return PALETTE_CACHE.get(cacheKey)!;
  }

  try {
    const res = await fetch(artworkUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch artwork: ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hues = await extractArtworkHues(buffer);
    const theme = buildPaletteTheme(hues.dominantHsl, hues.accentHsl, config);

    if (PALETTE_CACHE.size >= MAX_CACHE_SIZE) {
      const firstKey = PALETTE_CACHE.keys().next().value;
      if (firstKey) PALETTE_CACHE.delete(firstKey);
    }
    PALETTE_CACHE.set(cacheKey, theme);
    return theme;
  } catch (err) {
    console.error('Error extracting artwork palette:', err);
    // Fallback theme
    const fallbackTheme = buildPaletteTheme(
      { h: 220, s: 15, l: 15 },
      { h: 215, s: 30, l: 40 },
      config
    );
    return fallbackTheme;
  }
}
