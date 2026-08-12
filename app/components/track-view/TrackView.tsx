import { Suspense } from 'react';
import { headers } from 'next/headers';
import { detectCountryFromHeaders } from '../../lib/geo';
import { resolveEntity } from '../../lib/urlResolver';
import LinkButtons from '../LinkButtons';
import YouTubeSection from './YouTubeSection';
import AppleSection from './AppleSection';
import SpotifySection from './SpotifySection';
import PlayerSkeleton from './PlayerSkeleton';
import LoadingChip from './LoadingChip';

/** Extract year (4-digit) from a string, return { text, year } */
function extractYear(s: string): { text: string; year: string | null } {
  const m = s.match(/\s*[\(\[\-]?\s*(\d{4})\s*[\)\]]?\s*$/);
  if (m && parseInt(m[1]) >= 1900 && parseInt(m[1]) <= 2100) {
    return { text: s.slice(0, m.index).trim(), year: m[1] };
  }
  return { text: s, year: null };
}

/** Strip noise (feat., remaster, official, etc.) but NOT year (handled separately) */
function cleanSegment(s: string): string {
  return s
    .replace(/\s*(feat\.?.*|ft\.?.*|remaster(ed)?|official.*|audio.*|video.*|lyrics?)\s*$/i, '')
    .replace(/["\u201C\u201D'\[\]]/g, '')
    .trim();
}

/**
 * Try to split a music title into { primary, secondary, year }.
 * Handles: "Artist - Title", "Artist: Title", "Title | Artist",
 *          'Artist "Title" (Year)', "Artist — Title", "Artist ~ Title"
 * Returns null if no recognisable pattern found.
 */
function parseMusicTitle(title: string): { primary: string; secondary: string; year: string | null } | null {
  const seps = [' - ', ' \u2013 ', ' \u2014 ', ' | ', ': ', ' ~ '];
  for (const sep of seps) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      const rawLeft = title.slice(0, idx);
      const rawRight = title.slice(idx + sep.length);
      // Extract year from whichever side has it
      const { text: rightClean, year: rightYear } = extractYear(rawRight);
      const { text: leftClean, year: leftYear } = extractYear(rawLeft);
      const year = rightYear || leftYear || null;
      const left = cleanSegment(leftClean);
      const right = cleanSegment(rightClean);
      if (left && right) return { primary: left, secondary: right, year };
    }
  }
  // Pattern: Artist "Title" (Year) or Artist "Title"
  const quotedMatch = title.match(/^(.+?)\s+["\u201C](.+?)["\u201D]/);
  if (quotedMatch) {
    const { text: rightClean, year } = extractYear(quotedMatch[2]);
    return { primary: cleanSegment(quotedMatch[1]), secondary: cleanSegment(rightClean), year };
  }
  return null;
}

export default async function TrackView({ artist, track, videoId: explicitVideoId, sourceUrl, searchParams }: any) {
  const formatSlug = (slug: string) =>
    decodeURIComponent(slug)
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

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
    ctx = await resolveEntity(a, t, country || 'CA', sourceUrl);
  } catch (e) {
    console.error('Failed to resolve entity:', e);
    ctx = {
      entityId: '',
      isAlbum: false,
      country: country || 'CA',
      sourcePlatform: 'unknown' as const,
      cleanArtist: a,
      cleanTitle: t,
      searchTerm: a ? `${a} ${t}` : t,
      cached: {},
    };
  }

  const displaySource = t;
  const parsed = !a ? parseMusicTitle(displaySource) : null;
  const displayPrimary = parsed ? parsed.primary : displaySource;
  const displaySecondary = parsed ? parsed.secondary : (a || null);
  const displayYear = parsed?.year || null;

  return (
    <div className="main-content">
      <div className="track-card">
        <header className="track-header">
          <div className="badge">{ctx.isAlbum ? 'Album Link' : 'Track Link'}</div>
          <h1 className="track-title accent-text">
            {displayPrimary}
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
  );
}
