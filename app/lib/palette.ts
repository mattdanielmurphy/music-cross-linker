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
  return DEFAULT_THEME;
}

export function getContrastColor(hex: string): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return '#FFFFFF';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
