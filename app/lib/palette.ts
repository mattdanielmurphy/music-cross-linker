import sharp from 'sharp';

export interface ThemeColors {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--accent': string;
}

const DEFAULT_THEME: ThemeColors = {
  '--bg-primary': '#121212',
  '--bg-secondary': '#1e1e1e',
  '--text-primary': '#ffffff',
  '--text-secondary': '#b3b3b3',
  '--accent': '#1db954',
};

export async function getPaletteFromImage(imageUrl: string): Promise<ThemeColors> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    const buffer = Buffer.from(await response.arrayBuffer());

    const stats = await sharp(buffer)
      .resize(64, 64)
      .raw()
      .ensureAlpha()
      .stats();

    const dominant = stats.dominant;
    const r = dominant.r;
    const g = dominant.g;
    const b = dominant.b;

    const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    
    // Simple palette derivation based on dominant color
    return {
      '--bg-primary': '#121212',
      '--bg-secondary': '#1e1e1e',
      '--text-primary': '#ffffff',
      '--text-secondary': '#b3b3b3',
      '--accent': hex,
    };
  } catch (error) {
    console.error('Failed to extract palette, returning default:', error);
    return DEFAULT_THEME;
  }
}

export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
