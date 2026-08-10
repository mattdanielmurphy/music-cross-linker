import { redirect } from 'next/navigation';
import { fetchOdesliByUrl } from '../lib/odesli';
import { getSlugForUrl, getRecordBySlug } from '../lib/slugStore';
import TrackView from '../components/track-view/TrackView';

const MUSIC_HOSTS = ['youtube.com', 'youtu.be', 'music.apple.com', 'spotify.com', 'soundcloud.com'];

function extractVideoId(str: string): string | null {
  const m = str.match(/[?&]v=([\w-]{11})/) || str.match(/youtu\.be\/([\w-]{11})/) || str.match(/\/shorts\/([\w-]{11})/) || str.match(/\/embed\/([\w-]{11})/);
  return m ? m[1] : null;
}

export default async function Page({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ url: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const urlSegments = resolvedParams.url || [];

  // Detect if this is a music URL from the raw segments (before any URL parsing)
  const rawJoined = urlSegments.join('/');
  const isExternalUrl = urlSegments[0] === 'https:' || urlSegments[0] === 'http:' ||
    MUSIC_HOSTS.some(h => rawJoined.includes(h));

  if (isExternalUrl) {
    // First: safely extract videoId directly from segments + searchParams
    // (before URL parsing which may throw on malformed encoded chars)
    const videoIdFromParams = typeof resolvedSearchParams.v === 'string' ? resolvedSearchParams.v : null;
    const videoIdFromPath = extractVideoId(decodeURIComponent(rawJoined));
    const videoId = videoIdFromParams || videoIdFromPath;

    // Try to build a clean canonical URL (only v= param matters)
    let canonicalUrl: string | null = null;
    try {
      // Normalize protocol
      let cleaned = decodeURIComponent(rawJoined).replace(/^(https?:\/*)+/i, 'https://');
      if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
      const u = new URL(cleaned);
      // Only keep the v param to ensure stable canonical URLs
      if (videoId) {
        canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      } else {
        canonicalUrl = u.origin + u.pathname;
      }
    } catch {
      if (videoId) {
        canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (!canonicalUrl && !videoId) {
      redirect('/');
    }

    // Try Odesli / oEmbed
    const lookupUrl = canonicalUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const odesli = await fetchOdesliByUrl(lookupUrl);

    if (odesli) {
      // Don't trust channel name as artist — use empty string so search uses title only
      const artistName = '';
      const title = odesli.title || 'YouTube Video';
      const slug = getSlugForUrl(lookupUrl, title, artistName, videoId || undefined);
      redirect(`/${slug}`);
    }

    // oEmbed fallback failed — just store by videoId
    if (videoId) {
      const slug = getSlugForUrl(lookupUrl, videoId, '', videoId);
      redirect(`/${slug}`);
    }

    redirect('/');
  }

  // Handle direct slug/track rendering
  if (urlSegments.length === 1) {
    const record = getRecordBySlug(urlSegments[0]);
    if (record) {
      return <TrackView artist={record.artistName} track={record.title} videoId={record.videoId} searchParams={resolvedSearchParams} />;
    }
    // Fallback: format slug as readable title
    return <TrackView artist="" track={urlSegments[0]} searchParams={resolvedSearchParams} />;
  } else if (urlSegments.length === 2) {
    return <TrackView artist={urlSegments[0]} track={urlSegments[1]} searchParams={resolvedSearchParams} />;
  }

  redirect('/');
}
