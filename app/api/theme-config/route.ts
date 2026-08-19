import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DEFAULT_PALETTE_CONFIG, PaletteThemeConfig, clearPaletteCache } from '@/app/lib/palette';

export const runtime = 'nodejs';

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export async function GET() {
  const tmpPath = path.join(process.cwd(), 'tmp', 'theme_config.json');
  let currentConfig = DEFAULT_PALETTE_CONFIG;

  if (fs.existsSync(tmpPath)) {
    try {
      const data = fs.readFileSync(tmpPath, 'utf8');
      currentConfig = { ...DEFAULT_PALETTE_CONFIG, ...JSON.parse(data) };
    } catch (e) {
      console.error('Failed to read theme_config.json:', e);
    }
  }

  return NextResponse.json(currentConfig, {
    headers: getCorsHeaders(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: PaletteThemeConfig = await request.json();
    const newConfig = {
      ...DEFAULT_PALETTE_CONFIG,
      ...body,
    };

    // 1. Save to tmp/theme_config.json
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpPath = path.join(tmpDir, 'theme_config.json');
    fs.writeFileSync(tmpPath, JSON.stringify(newConfig, null, 2), 'utf8');

    // 2. Update app/lib/palette.ts on disk so it persists in source control
    const palettePath = path.join(process.cwd(), 'app', 'lib', 'palette.ts');
    if (fs.existsSync(palettePath)) {
      let content = fs.readFileSync(palettePath, 'utf8');
      const configString = `export const DEFAULT_PALETTE_CONFIG: Required<PaletteThemeConfig> = {
  patternMode: '${newConfig.patternMode}',
  gradientAngle: ${newConfig.gradientAngle},
  topSpreadPercent: ${newConfig.topSpreadPercent},
  midSpreadPercent: ${newConfig.midSpreadPercent},
  haloRadiusPx: ${newConfig.haloRadiusPx},
  haloOpacity: ${Number(newConfig.haloOpacity).toFixed(2)},
  topLightness: ${newConfig.topLightness},
  accentLightness: ${newConfig.accentLightness},
  accentIntensity: ${Number(newConfig.accentIntensity).toFixed(2)},
  saturationMultiplier: ${Number(newConfig.saturationMultiplier).toFixed(2)},
  baseLightness: ${newConfig.baseLightness},
  textMode: '${newConfig.textMode}',
  textLightness: ${newConfig.textLightness},
  textSaturation: ${newConfig.textSaturation},
  textGlowOpacity: ${Number(newConfig.textGlowOpacity).toFixed(2)},
  cardGlowOpacity: ${Number(newConfig.cardGlowOpacity).toFixed(2)},
  grainOverlay: ${newConfig.grainOverlay},
  playerShadowDepth: ${newConfig.playerShadowDepth},
};`;

      const regex = /export const DEFAULT_PALETTE_CONFIG: Required<PaletteThemeConfig> = {[\s\S]*?};/;
      if (regex.test(content)) {
        content = content.replace(regex, configString);
        fs.writeFileSync(palettePath, content, 'utf8');
      }
    }

    // 3. Clear the in-memory cache
    if (typeof clearPaletteCache === 'function') {
      clearPaletteCache();
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Palette configuration saved and locked in to app/lib/palette.ts!',
        config: newConfig,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error('Failed to save theme config:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save configuration' },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
