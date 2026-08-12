import { redirect } from 'next/navigation';
import { getRecordBySlug } from '../lib/slugStore';
import TrackView from '../components/track-view/TrackView';
import ResolvingRedirect from '../components/ResolvingRedirect';

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

  const rawJoined = urlSegments.join('/');
  const isExternalUrl = urlSegments[0] === 'https:' || urlSegments[0] === 'http:' ||
    MUSIC_HOSTS.some(h => rawJoined.includes(h));

  if (isExternalUrl) {
    const videoIdFromParams = typeof resolvedSearchParams.v === 'string' ? resolvedSearchParams.v : null;
    const videoIdFromPath = extractVideoId(decodeURIComponent(rawJoined));
    const videoId = videoIdFromParams || videoIdFromPath;

    let canonicalUrl: string | null = null;
    try {
      let cleaned = decodeURIComponent(rawJoined).replace(/^(https?:\/*)+/i, 'https://');
      if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
      const u = new URL(cleaned);
      
      // Re-attach Next.js parsed search parameters (essential for Apple Music 'i' param)
      if (resolvedSearchParams) {
        for (const [k, v] of Object.entries(resolvedSearchParams)) {
          if (v !== undefined) {
            u.searchParams.append(k, Array.isArray(v) ? v[0] : (v as string));
          }
        }
      }

      if (videoId) {
        canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      } else {
        canonicalUrl = u.toString();
      }
    } catch {
      if (videoId) {
        canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (!canonicalUrl && !videoId) {
      redirect('/');
    }

    const lookupUrl = canonicalUrl || `https://www.youtube.com/watch?v=${videoId}`;

    // Render instantly and resolve the slow lookups (Odesli, oEmbed) client-side
    // via /api/resolve-link, then redirect once resolved — this is what keeps
    // the initial load fast for links the app hasn't seen before.
    return <ResolvingRedirect lookupUrl={lookupUrl} videoId={videoId} />;
  }

  // Check store record for 1-segment or 2-segment routes (e.g. 'daniel-lanois/belladonna')
  const slugKey = urlSegments.join('/');
  const record = getRecordBySlug(slugKey);

  if (record) {
    return (
      <TrackView 
        artist={record.artistName} 
        track={record.title} 
        videoId={record.videoId} 
        sourceUrl={record.targetUrl} 
        searchParams={resolvedSearchParams} 
      />
    );
  }

  if (urlSegments.length === 1) {
    return <TrackView artist="" track={urlSegments[0]} searchParams={resolvedSearchParams} />;
  } else if (urlSegments.length === 2) {
    return <TrackView artist={urlSegments[0]} track={urlSegments[1]} searchParams={resolvedSearchParams} />;
  }

  redirect('/');
}
