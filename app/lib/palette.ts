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
    const buffer = await response.arrayBuffer();
    let image = sharp(Buffer.from(buffer));
    const metadata = await image.metadata();

    if (imageUrl.includes('youtube.com') || imageUrl.includes('ytimg.com')) {
      const { width, height } = metadata;
      if (width && height) {
        image = image.extract({
          left: Math.floor(width * 0.25),
          top: Math.floor(height * 0.1),
          width: Math.floor(width * 0.5),
          height: Math.floor(height * 0.8),
        });
      }
    }

    const pixels = await image
      .resize(20, 20)
      .raw()
      .ensureAlpha()
      .toBuffer();

    const colors: { r: number; g: number; b: number }[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      const isTooDark = (r + g + b < 40) || (r < 25 && g < 25 && b < 25);
      const isTooLight = (r > 230 && g > 230 && b > 230);
      
      if (!isTooDark && !isTooLight) {
        colors.push({ r, g, b });
      }
    }

    if (colors.length === 0) {
      return {
        '--bg-gradient': 'linear-gradient(135deg, #2c3e50, #000000)',
        '--text-primary': 'rgba(255, 255, 255, 0.95)',
        '--text-secondary': 'rgba(255, 255, 255, 0.7)',
        '--card-bg': 'rgba(0, 0, 0, 0.4)',
      };
    }

    // Simple sampling
    const sample = colors.filter((_, i) => i % Math.max(1, Math.floor(colors.length / 3)) === 0).slice(0, 3);
    const colorStops = sample.map(c => `rgb(${c.r}, ${c.g}, ${c.b})`).join(', ');

    return {
      '--bg-gradient': `linear-gradient(135deg, ${colorStops})`,
      '--text-primary': 'rgba(255, 255, 255, 0.95)',
      '--text-secondary': 'rgba(255, 255, 255, 0.7)',
      '--card-bg': 'rgba(255, 255, 255, 0.05)',
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
