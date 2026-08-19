import { NextRequest, NextResponse } from 'next/server';
import { getPaletteForArtworkUrl, PaletteThemeConfig } from '@/app/lib/palette';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing artwork url parameter' }, { status: 400 });
  }

  // Parse optional overrides
  const config: PaletteThemeConfig = {};
  if (searchParams.has('patternMode')) config.patternMode = searchParams.get('patternMode') as any;
  if (searchParams.has('gradientAngle')) config.gradientAngle = Number(searchParams.get('gradientAngle'));
  if (searchParams.has('topSpreadPercent')) config.topSpreadPercent = Number(searchParams.get('topSpreadPercent'));
  if (searchParams.has('midSpreadPercent')) config.midSpreadPercent = Number(searchParams.get('midSpreadPercent'));
  if (searchParams.has('haloRadiusPx')) config.haloRadiusPx = Number(searchParams.get('haloRadiusPx'));
  if (searchParams.has('haloOpacity')) config.haloOpacity = Number(searchParams.get('haloOpacity'));
  if (searchParams.has('topLightness')) config.topLightness = Number(searchParams.get('topLightness'));
  if (searchParams.has('accentLightness')) config.accentLightness = Number(searchParams.get('accentLightness'));
  if (searchParams.has('accentIntensity')) config.accentIntensity = Number(searchParams.get('accentIntensity'));
  if (searchParams.has('saturationMultiplier')) config.saturationMultiplier = Number(searchParams.get('saturationMultiplier'));
  if (searchParams.has('baseLightness')) config.baseLightness = Number(searchParams.get('baseLightness'));
  if (searchParams.has('textMode')) config.textMode = searchParams.get('textMode') as any;
  if (searchParams.has('textLightness')) config.textLightness = Number(searchParams.get('textLightness'));
  if (searchParams.has('textSaturation')) config.textSaturation = Number(searchParams.get('textSaturation'));
  if (searchParams.has('textGlowOpacity')) config.textGlowOpacity = Number(searchParams.get('textGlowOpacity'));
  if (searchParams.has('cardGlowOpacity')) config.cardGlowOpacity = Number(searchParams.get('cardGlowOpacity'));
  if (searchParams.has('grainOverlay')) config.grainOverlay = searchParams.get('grainOverlay') === 'true';
  if (searchParams.has('playerShadowDepth')) config.playerShadowDepth = Number(searchParams.get('playerShadowDepth'));

  try {
    const palette = await getPaletteForArtworkUrl(url, config);
    return NextResponse.json(palette, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to extract palette' }, { status: 500 });
  }
}
