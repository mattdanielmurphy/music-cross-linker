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
    const pixels = await sharp(Buffer.from(buffer))
      .resize(50, 50)
      .raw()
      .ensureAlpha()
      .toBuffer();

    const vibrantPixels: { r: number; g: number; b: number; s: number }[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      if ((r + g + b < 40) || (r < 25 && g < 25 && b < 25) || (r > 230 && g > 230 && b > 230)) continue;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const s = max === 0 ? 0 : (max - min) / max;
      vibrantPixels.push({ r, g, b, s });
    }

    vibrantPixels.sort((a, b) => b.s - a.s);
    const sample = vibrantPixels.slice(0, 3).map(c => `rgb(${c.r}, ${c.g}, ${c.b})`);
    
    if (sample.length < 2) {
      return {
        '--bg-gradient': 'linear-gradient(135deg, #4b0082, #008080)',
        '--text-primary': 'rgba(255, 255, 255, 0.95)',
        '--text-secondary': 'rgba(255, 255, 255, 0.7)',
        '--card-bg': 'rgba(0,0,0,0.3)'
      };
    }

    return {
      '--bg-gradient': `linear-gradient(135deg, ${sample.join(', ')})`,
      '--text-primary': 'rgba(255, 255, 255, 0.95)',
      '--text-secondary': 'rgba(255, 255, 255, 0.7)',
      '--card-bg': 'rgba(0,0,0,0.3)'
    };
  } catch (e) {
    return {
      '--bg-gradient': 'linear-gradient(135deg, #2c3e50, #000000)',
      '--text-primary': 'rgba(255, 255, 255, 0.95)',
      '--text-secondary': 'rgba(255, 255, 255, 0.7)',
      '--card-bg': 'rgba(0,0,0,0.3)'
    };
  }
}
