import { NextRequest, NextResponse } from 'next/server';
import { fetchOdesliByUrl } from '../../lib/odesli';
import { getSlugForUrl } from '../../lib/slugStore';

/** Split a YouTube video title like "Daniel Lanois - Belladonna (2005)" into
 *  { artist: 'Daniel Lanois', title: 'Belladonna' }. Returns null if no
 *  recognizable "Artist - Title" pattern is present. */
function parseArtistTitleFromVideoTitle(videoTitle: string): { artist: string; title: string } | null {
  const seps = [' - ', ' \u2013 ', ' \u2014 ', ' | ', ': ', ' ~ '];
  for (const sep of seps) {
    const idx = videoTitle.indexOf(sep);
    if (idx > 0) {
      const left = videoTitle.slice(0, idx).trim();
      let right = videoTitle.slice(idx + sep.length).trim();
      right = right
        .replace(/\s*[\(\[][^)\]]*[\)\]]\s*$/, '')
        .replace(/\s*(feat\.?.*|ft\.?.*|remaster(ed)?|official.*|full album.*|audio.*|video.*|lyrics?)\s*$/i, '')
        .trim();
      if (left && right) return { artist: left, title: right };
    }
  }
  return null;
}

/**
 * Resolves an external media link (YouTube/Spotify/Apple Music/etc.) to a
 * canonical slug for this app, doing all the slow network work (Odesli,
 * oEmbed) here so the page shell can render instantly and just poll/redirect
 * once this responds.
 */
export async function POST(req: NextRequest) {
  const { lookupUrl, videoId } = await req.json();

  if (!lookupUrl) {
    return NextResponse.json({ error: 'lookupUrl is required' }, { status: 400 });
  }

  const odesli = await fetchOdesliByUrl(lookupUrl);

  if (odesli) {
    const isYoutube = !!videoId;
    let artistName = odesli.artistName || '';
    let title = odesli.title || (isYoutube ? 'YouTube Video' : 'Unknown Title');

    if (isYoutube) {
      let rawVideoTitle: string | null = null;
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        ).then((r) => (r.ok ? r.json() : null));
        rawVideoTitle = oembed?.title || null;
      } catch {}

      const parsed = parseArtistTitleFromVideoTitle(rawVideoTitle || title);
      if (parsed) {
        artistName = parsed.artist;
        title = parsed.title;
      }
    }

    const slug = getSlugForUrl(lookupUrl, title, artistName, videoId || undefined);
    return NextResponse.json({ slug });
  }

  if (videoId) {
    const slug = getSlugForUrl(lookupUrl, videoId, '', videoId);
    return NextResponse.json({ slug });
  }

  return NextResponse.json({ slug: null });
}
