import { Suspense } from 'react';
import { cleanYouTubeTitle, formatSlug, parseMusicTitle } from '../../lib/youtube/titleParser';
import { headers } from 'next/headers';
import { detectCountryFromHeaders } from '../../lib/geo';
import { resolveEntity, resolveBestMediaMetadata } from '../../lib/urlResolver';
import { getPaletteForArtworkUrl, PaletteTheme } from '../../lib/palette';
import { DynamicThemeProvider } from './DynamicThemeProvider';
import LinkButtons from '../LinkButtons';
import YouTubeSection from './YouTubeSection';
import AppleSection from './AppleSection';
import SpotifySection from './SpotifySection';
import PlayerSkeleton from './PlayerSkeleton';
import LoadingChip from './LoadingChip';
import TypeBadge from './TypeBadge';

export default async function TrackView({ artist, track, videoId: explicitVideoId, sourceUrl, searchParams }: any) {
  const typeHint = (searchParams?.type === 'album' || searchParams?.type === 'track') ? searchParams.type : null;

  // If track looks like a slug (lowercase, hyphens), format it; otherwise use as-is (already a title)
  const isSlugLike = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(track);
  const a = artist ? formatSlug(artist) : '';
  const t = isSlugLike ? formatSlug(track) : track;

  let country = searchParams?.country;
  if (!country) {
    const h = await headers();
    country = await detectCountryFromHeaders(h);
  }

  // This is the only thing we block the initial render on: one cheap DB round
  // trip to find-or-create the canonical entity. Every platform lookup below
  // (iTunes, Spotify, YouTube) happens independently, in parallel, streamed in
  // via Suspense as soon as each resolves — the page shell renders instantly.
  let ctx;
  try {
    ctx = await resolveEntity(a, t, country || 'CA', sourceUrl, typeHint);
  } catch (e) {
    console.error('Failed to resolve entity:', e);
    ctx = {
      entityId: '',
      isAlbum: typeHint === 'album',
      country: country || 'CA',
      sourcePlatform: 'unknown' as const,
      cleanArtist: a,
      cleanTitle: t,
      searchTerm: a ? `${a} ${t}` : t,
      cached: {},
      typeHint,
    };
  }

  const displaySource = t;
  const parsed = !a ? parseMusicTitle(displaySource) : null;
  const displayPrimary = ctx.canonicalTitle || (parsed ? parsed.primary : displaySource);
  const displaySecondary = ctx.canonicalArtist || (parsed ? parsed.secondary : (a || null));
  const displayYear = parsed?.year || null;

  // Resolve best artwork metadata for palette extraction
  let initialPalette: PaletteTheme | null = null;
  let initialArtworkUrl: string | null = null;

  try {
    const media = await resolveBestMediaMetadata(a || displaySecondary, t || displayPrimary, explicitVideoId, sourceUrl);
    if (media.imageUrl) {
      initialArtworkUrl = media.imageUrl;
      initialPalette = await getPaletteForArtworkUrl(media.imageUrl);
    }
  } catch (err) {
    console.error('Failed to pre-extract artwork palette:', err);
  }

  return (
    <DynamicThemeProvider initialPalette={initialPalette} initialArtworkUrl={initialArtworkUrl} initialType={ctx.isAlbum ? 'album' : 'track'}>
      <div className="main-content">
        <div className="track-card">
          <header className="track-header">
            <TypeBadge isAlbum={ctx.isAlbum} typeHint={typeHint} />
            <h1 className="track-title accent-text">
              {cleanYouTubeTitle(displayPrimary)}
              {displayYear && <span className="year-chip">{displayYear}</span>}
            </h1>
            {displaySecondary && <h2 className="track-artist">{displaySecondary}</h2>}
          </header>

          {/* YouTube — highest priority, streamed in first */}
          <Suspense fallback={<PlayerSkeleton />}>
            <YouTubeSection ctx={ctx} artist={a} title={t} explicitVideoId={explicitVideoId} sourceUrl={sourceUrl} />
          </Suspense>

          <LinkButtons>
            {/* Spotify — second priority */}
            <Suspense fallback={<LoadingChip platform="spotify" />}>
              <SpotifySection ctx={ctx} sourceUrl={sourceUrl} />
            </Suspense>

            {/* Apple Music — third priority */}
            <Suspense fallback={<LoadingChip platform="apple_music" />}>
              <AppleSection ctx={ctx} sourceUrl={sourceUrl} />
            </Suspense>
          </LinkButtons>
        </div>
      </div>
    </DynamicThemeProvider>
  );
}

