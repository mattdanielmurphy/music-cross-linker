import { headers } from 'next/headers';
import { detectCountryFromHeaders } from '../../lib/geo';
import { getPlatformLinks } from '../../lib/urlResolver';
import { getTopVideos } from '../../lib/youtube';
import LinkButtons from '../LinkButtons';

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

export default async function TrackView({ artist, track, videoId: explicitVideoId, searchParams }: any) {
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

  let links = { appleUrl: '', spotifyUrl: '', youtubeUrl: '', isAlbum: false, country: country || 'CA' };
  try {
    links = await getPlatformLinks(a, t, country);
  } catch (e) {
    console.error('Failed to get platform links:', e);
  }
  const { appleUrl, spotifyUrl, youtubeUrl, isAlbum } = links;

  let videoId = explicitVideoId || '';
  if (!videoId && youtubeUrl) {
    const match = youtubeUrl.match(/(?:v=|\/embed\/|\/watch\?v=|\/youtu\.be\/)([^"&?\/\s]{11})/);
    videoId = match ? match[1] : '';
  }
  if (!videoId) {
    const videos = await getTopVideos(a || t, t, 'track', 5);
    videoId = videos[0]?.id || '';
  }

  // Parse title into display parts (only when artist isn't already known from slug store)
  const parsed = !a ? parseMusicTitle(t) : null;
  const displayPrimary = parsed ? parsed.primary : t;
  const displaySecondary = parsed ? parsed.secondary : (a || null);
  const displayYear = parsed?.year || null;

  return (
    <div className="main-content">
      <div className="track-card">
        <header className="track-header">
          <div className="badge">{isAlbum ? 'Album Link' : 'Track Link'}</div>
          <h1 className="track-title accent-text">
            {displayPrimary}
            {displayYear && <span className="year-chip">{displayYear}</span>}
          </h1>
          {displaySecondary && <h2 className="track-artist">{displaySecondary}</h2>}
        </header>
        
        {videoId && (
          <div className="player-wrapper">
            <iframe 
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
              title={`${t} by ${a}`} 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen 
              suppressHydrationWarning={true}
            />
          </div>
        )}

        <LinkButtons appleUrl={appleUrl} spotifyUrl={spotifyUrl} youtubeUrl={youtubeUrl} country={country} />
      </div>
    </div>
  );
}
