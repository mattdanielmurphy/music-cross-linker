import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

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
  gradientAngle: 190,
  topSpreadPercent: 30,
  midSpreadPercent: 80,
  haloRadiusPx: 320,
  haloOpacity: 0.65,
  topLightness: 19,
  accentLightness: 34,
  accentIntensity: 0.80,
  saturationMultiplier: 0.95,
  baseLightness: 6,
  textMode: 'dualTone',
  textLightness: 86,
  textSaturation: 70,
  textGlowOpacity: 0.35,
  cardGlowOpacity: 0.30,
  grainOverlay: true,
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

export interface GrossColorRejectionRule {
  id: string;
  name: string;
  hueMin: number;
  hueMax: number;
  satMin?: number;
  satMax?: number;
  lightnessMin?: number;
  lightnessMax?: number;
  penaltyMultiplier: number;
  fallbackTargetHue?: number;
}

/**
 * Gross Color Rejection List:
 * Filters out unappealing, muddy, murky, and sickly hues (e.g. Pantone 448 C "ugliest color",
 * baby poop, murky bile, dirty mustard, and sludge olive) from dominating album art backgrounds.
 */
export const GROSS_COLOR_REJECTION_RULES: GrossColorRejectionRule[] = [
  {
    id: 'pantone-448c-sludge-olive',
    name: 'Murky Olive / Pantone 448 C Sludge / Baby Poop',
    hueMin: 55,
    hueMax: 95,
    penaltyMultiplier: 0.05, // 95% rejection penalty
    fallbackTargetHue: 42,
  },
  {
    id: 'dirty-mustard-yellow',
    name: 'Dirty Mustard / Muddy Yellow-Green',
    hueMin: 45,
    hueMax: 55,
    penaltyMultiplier: 0.20, // 80% penalty
    fallbackTargetHue: 40,
  },
  {
    id: 'pea-soup-chartreuse',
    name: 'Sickly Pea Soup Chartreuse',
    hueMin: 95,
    hueMax: 110,
    satMin: 15,
    penaltyMultiplier: 0.25,
    fallbackTargetHue: 135,
  },
];

/**
 * Calculates an aesthetic score multiplier for a given color.
 * Murky/sludge hues are heavily penalized, while rich and atmospheric musical
 * background tones (sunset ambers, twilight blues, velvet purples, emeralds) are boosted.
 */
export function getAestheticScoreMultiplier(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;

  // 1. Check Gross Color Rejection Rules
  for (const rule of GROSS_COLOR_REJECTION_RULES) {
    if (h >= rule.hueMin && h <= rule.hueMax) {
      const satMatch = (rule.satMin === undefined || s >= rule.satMin) &&
                       (rule.satMax === undefined || s <= rule.satMax);
      const lightMatch = (rule.lightnessMin === undefined || l >= rule.lightnessMin) &&
                         (rule.lightnessMax === undefined || l <= rule.lightnessMax);
      if (satMatch && lightMatch) {
        return rule.penaltyMultiplier;
      }
    }
  }

  // 2. Atmospheric & High-Aesthetic Harmony Boosts
  if (h >= 200 && h <= 250) {
    // Twilight Blue / Sapphire / Indigo
    return 1.30;
  }
  if ((h >= 10 && h <= 42) || (h >= 345 && h <= 360)) {
    // Sunset Amber / Golden Honey / Warm Coral
    return 1.30;
  }
  if (h >= 265 && h <= 335) {
    // Velvet Violet / Royal Purple / Magenta
    return 1.25;
  }
  if (h >= 125 && h <= 170) {
    // Lush Forest / Emerald
    return 1.20;
  }

  return 1.0;
}

/**
 * Sanitizes and harmonizes any remaining unpleasant or gross hues into aesthetic musical palettes.
 * Prevents monochromatic olive/sludge artwork from producing unpleasant background gradients.
 */
export function sanitizeHarmoniousHsl(hsl: HslColor): HslColor {
  let { h, s, l } = hsl;
  h = ((h % 360) + 360) % 360;

  if (h >= 50 && h <= 95) {
    // Olive / Sludge / Dirty Mustard zone
    if (h <= 75) {
      // Shift dirty mustard toward warm golden amber
      h = 42;
      s = Math.min(s, 75);
    } else {
      // Shift drab olive toward deep lush emerald
      h = 135;
      s = Math.min(s, 65);
    }
  } else if (h > 95 && h <= 110) {
    // Sickly chartreuse -> clean emerald
    h = 135;
  }

  return { h, s, l };
}

export interface ContentBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Checks if a pixel is an uncolored/neutral border pixel (black, off-black, white, off-white, neutral gray).
 * Striking or intentional colors (s >= 25, rich hues) are preserved.
 */
export function isNeutralBorderPixel(r: number, g: number, b: number): boolean {
  const hsl = rgbToHsl(r, g, b);
  // Saturated/striking color is NOT a neutral border
  if (hsl.s >= 25) return false;
  // Near black / off-black
  if (hsl.l <= 20) return true;
  // Near white / off-white
  if (hsl.l >= 82) return true;
  // Flat gray
  if (hsl.s <= 10) return true;
  return false;
}

/**
 * Detects letterbox (top/bottom) and pillarbox (left/right) neutral borders in an image buffer.
 * Strips black/white/gray filler bars while preserving intentional colorful album borders.
 */
export function detectContentBoundingBox(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): ContentBoundingBox {
  const isNeutralAt = (x: number, y: number): boolean => {
    const idx = (y * width + x) * channels;
    const a = channels >= 4 ? data[idx + 3] : 255;
    if (a < 128) return true; // transparent is treated as border
    return isNeutralBorderPixel(data[idx], data[idx + 1], data[idx + 2]);
  };

  const maxCropX = Math.floor(width * 0.4);
  const maxCropY = Math.floor(height * 0.4);

  // Top letterbox
  let minY = 0;
  while (minY < maxCropY) {
    let neutralCount = 0;
    for (let x = 0; x < width; x++) {
      if (isNeutralAt(x, minY)) neutralCount++;
    }
    if (neutralCount / width >= 0.88) {
      minY++;
    } else {
      break;
    }
  }

  // Bottom letterbox
  let maxY = height - 1;
  while (maxY > height - 1 - maxCropY && maxY > minY) {
    let neutralCount = 0;
    for (let x = 0; x < width; x++) {
      if (isNeutralAt(x, maxY)) neutralCount++;
    }
    if (neutralCount / width >= 0.88) {
      maxY--;
    } else {
      break;
    }
  }

  // Left pillarbox
  let minX = 0;
  while (minX < maxCropX) {
    let neutralCount = 0;
    for (let y = minY; y <= maxY; y++) {
      if (isNeutralAt(minX, y)) neutralCount++;
    }
    const h = maxY - minY + 1;
    if (neutralCount / h >= 0.88) {
      minX++;
    } else {
      break;
    }
  }

  // Right pillarbox
  let maxX = width - 1;
  while (maxX > width - 1 - maxCropX && maxX > minX) {
    let neutralCount = 0;
    for (let y = minY; y <= maxY; y++) {
      if (isNeutralAt(maxX, y)) neutralCount++;
    }
    const h = maxY - minY + 1;
    if (neutralCount / h >= 0.88) {
      maxX--;
    } else {
      break;
    }
  }

  // Safety fallback if entire image was flagged
  if (maxX - minX < 10 || maxY - minY < 10) {
    return { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 };
  }

  return { minX, maxX, minY, maxY };
}

export function decodeImageToRgba(
  imageBuffer: Buffer
): { data: Uint8Array | Buffer; width: number; height: number } | null {
  if (!imageBuffer || imageBuffer.length < 4) return null;

  // 1. JPEG check (magic FF D8)
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    try {
      const decoded = jpeg.decode(imageBuffer, { useTArray: true, formatAsRGBA: true });
      return { data: decoded.data, width: decoded.width, height: decoded.height };
    } catch {
      // fallback
    }
  }

  // 2. PNG check (magic 89 50 4E 47)
  if (
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    try {
      const png = PNG.sync.read(imageBuffer);
      return { data: png.data, width: png.width, height: png.height };
    } catch {
      // fallback
    }
  }

  // 3. Fallback attempts
  try {
    const decoded = jpeg.decode(imageBuffer, { useTArray: true, formatAsRGBA: true });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  } catch {
    try {
      const png = PNG.sync.read(imageBuffer);
      return { data: png.data, width: png.width, height: png.height };
    } catch {
      return null;
    }
  }
}

export function sampleImageBufferToGrid(
  rawData: Uint8Array | Buffer,
  origWidth: number,
  origHeight: number,
  targetWidth = 80,
  targetHeight = 80
): Buffer {
  const targetBuffer = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(origHeight - 1, Math.floor((y / targetHeight) * origHeight));
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(origWidth - 1, Math.floor((x / targetWidth) * origWidth));
      const srcIdx = (srcY * origWidth + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      targetBuffer[dstIdx] = rawData[srcIdx];
      targetBuffer[dstIdx + 1] = rawData[srcIdx + 1];
      targetBuffer[dstIdx + 2] = rawData[srcIdx + 2];
      targetBuffer[dstIdx + 3] = rawData[srcIdx + 3] !== undefined ? rawData[srcIdx + 3] : 255;
    }
  }
  return targetBuffer;
}

/**
 * Extracts the True Perceptual Average Color (for the ambient background)
 * and the Striking Accent Hue (for glowing highlights and typography) from an artwork buffer.
 */
export async function extractArtworkHues(
  imageBuffer: Buffer
): Promise<{ dominantHsl: HslColor; accentHsl: HslColor }> {
  const decoded = decodeImageToRgba(imageBuffer);
  if (!decoded) {
    return {
      dominantHsl: { h: 220, s: 50, l: 30 },
      accentHsl: { h: 38, s: 95, l: 50 },
    };
  }

  // Resize to 80x80 for fast quantization, statistical averaging, and pixel inspection
  const width = 80;
  const height = 80;
  const data = sampleImageBufferToGrid(decoded.data, decoded.width, decoded.height, width, height);

  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const step = 4; // 4 (RGBA)

  // Detect and ignore letterbox/pillarbox neutral borders (black, off-black, white, gray)
  const bbox = detectContentBoundingBox(data, width, height, step);

  // Circular mean accumulators for true weighted average color
  let sumCosHue = 0;
  let sumSinHue = 0;
  let sumSat = 0;
  let sumLight = 0;
  let totalWeight = 0;

  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      const i = (y * width + x) * step;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;

      const hsl = rgbToHsl(r, g, b);

      // Filter extreme near-blacks and near-whites from hue dominance
      if (hsl.l < 5 || hsl.l > 95) continue;

      // Aesthetic weighting: penalize murky olive/sludge, boost rich sunset/indigo tones
      const aestheticWeight = getAestheticScoreMultiplier(hsl.h, hsl.s, hsl.l);
      // Weight by saturation + aesthetic suitability so vivid/representative regions guide the average
      const pixelWeight = (Math.max(15, hsl.s) / 100) * aestheticWeight;

      const rad = (hsl.h * Math.PI) / 180;
      sumCosHue += Math.cos(rad) * pixelWeight;
      sumSinHue += Math.sin(rad) * pixelWeight;
      sumSat += hsl.s * pixelWeight;
      sumLight += hsl.l * pixelWeight;
      totalWeight += pixelWeight;

      // 16-step RGB quantizing for discrete cluster & accent scoring
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
  }

  const list = Array.from(buckets.values()).map((c) => ({
    ...c,
    ...rgbToHsl(c.r, c.g, c.b),
  }));

  if (list.length === 0 || totalWeight === 0) {
    return {
      dominantHsl: { h: 220, s: 50, l: 30 },
      accentHsl: { h: 38, s: 95, l: 50 },
    };
  }

  // 1. Calculate Perceptual Average HSL (ambient foundation)
  const avgHueRad = Math.atan2(sumSinHue, sumCosHue);
  let avgHueDeg = Math.round((avgHueRad * 180) / Math.PI);
  if (avgHueDeg < 0) avgHueDeg += 360;

  const avgSat = Math.round(sumSat / totalWeight);
  const avgLight = Math.round(sumLight / totalWeight);

  const rawDom: HslColor = {
    h: avgHueDeg,
    s: Math.max(20, Math.min(90, avgSat)),
    l: Math.max(15, Math.min(80, avgLight)),
  };
  const dom = sanitizeHarmoniousHsl(rawDom);

  // 2. Striking Accent Hue: vibrant feature with high contrast ΔH from dominant average
  const accents = [...list].sort((a, b) => {
    const distA = hueDistance(a.h, dom.h);
    const distB = hueDistance(b.h, dom.h);
    const multA = getAestheticScoreMultiplier(a.h, a.s, a.l);
    const multB = getAestheticScoreMultiplier(b.h, b.s, b.l);
    const scoreA = Math.pow(a.s, 2.0) * Math.pow(Math.max(distA, 25), 1.2) * Math.log2(a.count + 1) * multA;
    const scoreB = Math.pow(b.s, 2.0) * Math.pow(Math.max(distB, 25), 1.2) * Math.log2(b.count + 1) * multB;
    return scoreB - scoreA;
  });

  let rawAcc = accents[0];
  // If the accent is too close in hue to dominant average, pick complementary pop
  if (!rawAcc || hueDistance(rawAcc.h, dom.h) < 25) {
    rawAcc = {
      r: 255,
      g: 165,
      b: 0,
      count: 1,
      h: (dom.h + 180) % 360,
      s: 85,
      l: 50,
    };
  }
  const acc = sanitizeHarmoniousHsl({ h: rawAcc.h, s: rawAcc.s, l: rawAcc.l });

  return {
    dominantHsl: dom,
    accentHsl: acc,
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

  // Sanitize dominant & accent HSL through gross color harmony filter
  const cleanDom = sanitizeHarmoniousHsl(dominantHsl);
  const cleanAcc = sanitizeHarmoniousHsl(accentHsl);

  // 1. Dominant Top Color (Aesthetic average ambient)
  const topSat = Math.min(100, Math.round(cleanDom.s * satMult));
  const topRgb = hslToRgb(cleanDom.h, topSat, config.topLightness);
  const topHex = rgbToHex(...topRgb);

  // 2. Striking Accent Color
  const accentSat = Math.min(100, Math.round(cleanAcc.s * satMult * 1.05));
  const accentRgb = hslToRgb(cleanAcc.h, accentSat, config.accentLightness);
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
