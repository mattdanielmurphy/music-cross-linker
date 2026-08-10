import { headers } from 'next/headers';
import { detectCountryFromHeaders } from '../../lib/geo';
import { getPlatformLinks } from '../../lib/urlResolver';
import { getTopVideos } from '../../lib/youtube';
import LinkButtons from '../LinkButtons';

/** Strip trailing year, feat., remaster, etc. from a title segment */
function cleanSegment(s: string): string {
  return s
    .replace(/\s*\(?(\d{4}|feat\.?.*|ft\.?.*|remaster(ed)?|official.*|audio.*|video.*|lyrics?)\)?\s*$/i, '')
    .replace(/["'\[\]]/g, '')
    .trim();
}

/**
 * Try to split a music title into { primary, secondary }.
 * Handles: "Artist - Title", "Artist: Title", "Title | Artist",
 *          'Artist "Title" (Year)', "Artist — Title", "Artist ~ Title"
 * Returns null if no recognisable pattern found.
 */
function parseMusicTitle(title: string): { primary: string; secondary: string } | null {
  // Separators to try in priority order
  const seps = [' - ', ' – ', ' — ', ' | ', ': ', ' ~ '];
  for (const sep of seps) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      const left = cleanSegment(title.slice(0, idx));
      const right = cleanSegment(title.slice(idx + sep.length));
      if (left && right) return { primary: left, secondary: right };
    }
  }
  // Pattern: Artist "Title" ...
  const quotedMatch = title.match(/^(.+?)\s+["\u201C](.+?)["\u201D]/);
  if (quotedMatch) {
    return { primary: cleanSegment(quotedMatch[1]), secondary: cleanSegment(quotedMatch[2]) };
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

  let links = { appleUrl: '', spotifyUrl: '', youtubeUrl: '', isAlbum: false, country: country || 'CA', resolvedTitle: undefined as string | undefined, resolvedArtist: undefined as string | undefined };
  try {
    links = await getPlatformLinks(a, t, country);
  } catch (e) {
    console.error('Failed to get platform links:', e);
  }
  const { appleUrl, spotifyUrl, youtubeUrl, isAlbum, resolvedTitle, resolvedArtist } = links;

  let videoId = explicitVideoId || '';
  if (!videoId && youtubeUrl) {
    const match = youtubeUrl.match(/(?:v=|\/embed\/|\/watch\?v=|\/youtu\.be\/)([^"&?\/\s]{11})/);
    videoId = match ? match[1] : '';
  }
  if (!videoId) {
    const videos = await getTopVideos(a || t, t, 'track', 5);
    videoId = videos[0]?.id || '';
  }

  // Determine display title/artist:
  // 1. If iTunes resolved a real title+artist, use those
  // 2. Otherwise try to split the formatted slug title with parseMusicTitle
  // 3. Otherwise show full title as h1 only
  let displayPrimary: string;
  let displaySecondary: string | null;

  if (resolvedTitle) {
    displayPrimary = resolvedTitle;
    displaySecondary = resolvedArtist || null;
  } else {
    const parsed = !a ? parseMusicTitle(t) : null;
    displayPrimary = parsed ? parsed.primary : t;
    displaySecondary = parsed ? parsed.secondary : (a || null);
  }

  return (
    <div className="main-content">
      <div className="track-card">
        <header className="track-header">
          <div className="badge">{isAlbum ? 'Album Link' : 'Track Link'}</div>
          <h1 className="track-title accent-text">{displayPrimary}</h1>
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
