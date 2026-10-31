import { cache } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getRecordBySlug, findRecordByTargetUrlOrVideo } from '../lib/slugStore';
import TrackView from '../components/track-view/TrackView';
import ResolvingRedirect from '../components/ResolvingRedirect';
import {
  formatSlug,
  parseMusicTitle,
  buildPageTitle,
  buildPageDescription,
  extractVideoId,
} from '../lib/youtube/titleParser';
import { lookupSong, resolveBestMediaMetadata } from '../lib/urlResolver';
import { normalizeSegment, slugify } from '../lib/slugify';

const MUSIC_HOSTS = ['youtube.com', 'youtu.be', 'music.apple.com', 'spotify.com', 'soundcloud.com'];

/**
 * /artist/album/track and the older /track/artist/title both always mean a song.
 * Returns its true names when iTunes knows it, else names rebuilt from the slugs.
 */
const resolveSongPath = cache(async (segments: string[]) => {
  const isLegacy = segments.length === 3 && segments[0] === 'track';
  if (segments.length !== 3 || segments[0] === 'album') return null;

  const [artistSlug, albumSlug, trackSlug] = (isLegacy ? [segments[1], '', segments[2]] : segments).map(normalizeSegment);
  const song = await lookupSong(artistSlug, albumSlug || null, trackSlug);
  return {
    slugKey: `${artistSlug}/${albumSlug}/${trackSlug}`,
    artist: song?.artist || formatSlug(artistSlug),
    title: song?.title || formatSlug(trackSlug),
    albumSlug: song?.album ? slugify(song.album) : albumSlug,
  };
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ url: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const urlSegments = resolvedParams.url || [];

  const rawJoined = urlSegments.join('/');
  const isExternalUrl =
    urlSegments[0] === 'https:' ||
    urlSegments[0] === 'http:' ||
    MUSIC_HOSTS.some((h) => rawJoined.includes(h));

  if (isExternalUrl) {
    const videoIdFromParams = typeof resolvedSearchParams.v === 'string' ? resolvedSearchParams.v : null;
    const videoIdFromPath = extractVideoId(decodeURIComponent(rawJoined));
    const videoId = videoIdFromParams || videoIdFromPath;

    let canonicalUrl: string | null = null;
    try {
      let cleaned = decodeURIComponent(rawJoined).replace(/^(https?:\/*)+/i, 'https://');
      if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
      const u = new URL(cleaned);
      if (resolvedSearchParams) {
        for (const [k, v] of Object.entries(resolvedSearchParams)) {
          if (v !== undefined) {
            u.searchParams.append(k, Array.isArray(v) ? v[0] : (v as string));
          }
        }
      }
      canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : u.toString();
    } catch {
      if (videoId) canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    const record = findRecordByTargetUrlOrVideo(canonicalUrl, videoId);
    let artist = record?.artistName || null;
    let track = record?.title || null;
    const pageTitle = buildPageTitle(artist, track);
    const pageDescription = buildPageDescription(artist, track);

    const { imageUrl, imageWidth, imageHeight, videoId: resolvedVideoId } =
      await resolveBestMediaMetadata(artist, track, videoId || record?.videoId, canonicalUrl);

    return {
      title: { absolute: pageTitle },
      description: pageDescription,
      openGraph: {
        title: pageTitle,
        description: pageDescription,
        siteName: 'Multilink',
        type: 'music.song',
        images: imageUrl
          ? [
              {
                url: imageUrl,
                width: imageWidth,
                height: imageHeight,
                alt: pageTitle,
              },
            ]
          : undefined,
        videos: resolvedVideoId
          ? [
              {
                url: `https://www.youtube.com/embed/${resolvedVideoId}`,
                secureUrl: `https://www.youtube.com/embed/${resolvedVideoId}`,
                type: 'text/html',
                width: 1280,
                height: 720,
              },
            ]
          : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: pageTitle,
        description: pageDescription,
        images: imageUrl ? [imageUrl] : undefined,
      },
    };
  }

  const songPath = await resolveSongPath(urlSegments);
  const slugKey = songPath?.slugKey || urlSegments.join('/');
  const record = getRecordBySlug(slugKey);

  let artist: string | null = null;
  let track: string | null = null;
  let fallbackVideoId: string | null = record?.videoId || null;

  if (record) {
    artist = record.artistName;
    track = record.title;
  } else if (songPath) {
    artist = songPath.artist;
    track = songPath.title;
  } else if (urlSegments.length === 3 && urlSegments[0] === 'album') {
    artist = formatSlug(urlSegments[1]);
    track = formatSlug(urlSegments[2]);
  } else if (urlSegments.length === 2) {
    artist = formatSlug(urlSegments[0]);
    track = formatSlug(urlSegments[1]);
  } else if (urlSegments.length === 1) {
    const raw = urlSegments[0];
    const parsed = parseMusicTitle(raw);
    if (parsed) {
      artist = parsed.primary;
      track = parsed.secondary;
    } else {
      const isSlugLike = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw);
      track = isSlugLike ? formatSlug(raw) : raw;
    }
  }

  const pageTitle = buildPageTitle(artist, track);
  const pageDescription = buildPageDescription(artist, track);

  const { imageUrl, imageWidth, imageHeight, videoId: resolvedVideoId } =
    await resolveBestMediaMetadata(artist, track, fallbackVideoId, record?.targetUrl);

  return {
    title: { absolute: pageTitle },
    description: pageDescription,
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      siteName: 'Multilink',
      type: 'music.song',
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: imageWidth,
              height: imageHeight,
              alt: pageTitle,
            },
          ]
        : undefined,
      videos: resolvedVideoId
        ? [
            {
              url: `https://www.youtube.com/embed/${resolvedVideoId}`,
              secureUrl: `https://www.youtube.com/embed/${resolvedVideoId}`,
              type: 'text/html',
              width: 1280,
              height: 720,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: pageDescription,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
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
  const songPath = await resolveSongPath(urlSegments);
  const slugKey = songPath?.slugKey || urlSegments.join('/');
  const record = getRecordBySlug(slugKey);

  const videoIdFromQuery = typeof resolvedSearchParams.v === 'string' ? resolvedSearchParams.v : null;

  if (songPath) {
    return (
      <TrackView
        artist={record?.artistName || songPath.artist}
        track={record?.title || songPath.title}
        album={songPath.albumSlug}
        videoId={videoIdFromQuery || record?.videoId}
        sourceUrl={record?.targetUrl}
        searchParams={{ ...resolvedSearchParams, type: 'track' }}
      />
    );
  }

  if (record) {
    return (
      <TrackView 
        artist={record.artistName} 
        track={record.title} 
        videoId={videoIdFromQuery || record.videoId} 
        sourceUrl={record.targetUrl} 
        searchParams={resolvedSearchParams} 
      />
    );
  }

  if (urlSegments.length === 1) {
    return <TrackView artist="" track={urlSegments[0]} searchParams={resolvedSearchParams} />;
  } else if (urlSegments.length === 2) {
    return <TrackView artist={urlSegments[0]} track={urlSegments[1]} searchParams={resolvedSearchParams} />;
  } else if (urlSegments.length === 3 && urlSegments[0] === 'album') {
    const typeHint = 'album';
    return (
      <TrackView 
        artist={urlSegments[1]} 
        track={urlSegments[2]} 
        searchParams={{ ...resolvedSearchParams, type: typeHint }} 
      />
    );
  }

  redirect('/');
}
