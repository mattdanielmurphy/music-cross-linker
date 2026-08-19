import { NextRequest, NextResponse } from 'next/server';
import { fetchOdesliByUrl } from '../../lib/odesli';
import { cleanYouTubeTitle, parseYouTubeTitle } from '../../lib/youtube/titleParser';
import { getSlugForUrl } from '../../lib/slugStore';


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
      let channelName: string | null = null;
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        ).then((r) => (r.ok ? r.json() : null));
        rawVideoTitle = oembed?.title || null;
        channelName = oembed?.author_name || null;
      } catch {}

      if (rawVideoTitle) {
        const parsed = parseYouTubeTitle(rawVideoTitle, channelName || undefined);
        if (parsed.artist) artistName = parsed.artist;
        title = parsed.title;
      } else if (title) {
        const parsed = parseYouTubeTitle(title, channelName || undefined);
        if (parsed.artist) artistName = parsed.artist;
        title = parsed.title;
      }
    }

    const slug = getSlugForUrl(lookupUrl, title, artistName, videoId || undefined);
    return NextResponse.json({ slug });
  }

  if (videoId) {
    let rawVideoTitle: string | null = null;
    let channelName: string | null = null;
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      ).then((r) => (r.ok ? r.json() : null));
      rawVideoTitle = oembed?.title || null;
      channelName = oembed?.author_name || null;
    } catch {}

    if (rawVideoTitle) {
      const parsed = parseYouTubeTitle(rawVideoTitle, channelName || undefined);
      const artistName = parsed.artist || '';
      const title = parsed.title;
      const slug = getSlugForUrl(lookupUrl, title, artistName, videoId);
      return NextResponse.json({ slug });
    }

    const slug = getSlugForUrl(lookupUrl, videoId, '', videoId);
    return NextResponse.json({ slug });
  }

  return NextResponse.json({ slug: null });
}
