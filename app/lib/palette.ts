export interface ThemeColors {
  '--bg-gradient': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--card-bg': string;
}

import sharp from 'sharp';

export async function getPaletteFromImage(imageUrl: string): Promise<ThemeColors> {
  try {
    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Resize to a small image to get prominent colors
    const stats = await sharp(buffer)
      .resize(10, 10)
      .raw()
      .toBuffer();

    // Simple dominant color extraction (averaging colors)
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < stats.length; i += 3) {
      r += stats[i];
      g += stats[i + 1];
      b += stats[i + 2];
    }
    const count = stats.length / 3;
    const avg = { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };

    const brightness = (avg.r * 299 + avg.g * 587 + avg.b * 114) / 1000;
    const isDark = brightness < 128;

    const color1 = `rgb(${avg.r}, ${avg.g}, ${avg.b})`;
    const color2 = `rgb(${Math.max(0, avg.r - 50)}, ${Math.max(0, avg.g - 50)}, ${Math.max(0, avg.b - 50)})`;

    return {
      '--bg-gradient': `linear-gradient(135deg, ${color1}, ${color2})`,
      '--text-primary': isDark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)',
      '--text-secondary': isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
      '--card-bg': isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    };
  } catch (e) {
    console.error('Palette extraction failed', e);
    return {
      '--bg-gradient': 'linear-gradient(135deg, #08090a, #121318)',
      '--text-primary': 'rgba(255, 255, 255, 0.95)',
      '--text-secondary': 'rgba(255, 255, 255, 0.7)',
      '--card-bg': 'rgba(0, 0, 0, 0.4)',
    };
  }
}
