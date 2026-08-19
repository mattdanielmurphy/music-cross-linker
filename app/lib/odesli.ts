import { fetchSpotifyMetadata } from './urlResolver';

export interface OdesliResult {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  appleUrl?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
  type?: 'track' | 'album';
  originalUrl?: string;
}

export async function fetchOdesliByUrl(sourceUrl: string): Promise<OdesliResult | null> {
  // 1. Direct Apple Music lookup with Country Code extraction
  if (sourceUrl.includes('music.apple.com')) {
    try {
      let urlStr = decodeURIComponent(sourceUrl);
      urlStr = urlStr.replace(/^(https?:\/\/)+/, '').replace(/^(https?:\/+)/, '');
      urlStr = 'https://' + urlStr;
      const url = new URL(urlStr);
      const pathParts = url.pathname.split('/');
      
      // Extract country code (e.g. 'ca') and entity ID
      const country = pathParts[1] && pathParts[1].length === 2 ? pathParts[1] : 'us';
      const id = pathParts.find((part) => /^\d+$/.test(part) || part.startsWith('id'))?.replace('id', '');

      if (id) {
        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        const item = lookup?.results?.[0];
        if (item && item.artistName) {
          return {
            title: item.collectionName || item.trackName,
            artistName: item.artistName,
            thumbnailUrl: item.artworkUrl100,
            type: item.wrapperType === 'collection' || item.collectionType ? 'album' : 'track',
            appleUrl: item.collectionViewUrl || item.trackViewUrl,
            originalUrl: sourceUrl,
          };
        }
      }
    } catch (e) {
      console.error('Apple Music lookup error:', e);
    }
  }

  // 2. Direct Spotify lookup
  if (sourceUrl.includes('spotify.com')) {
    try {
      const meta = await fetchSpotifyMetadata(sourceUrl);
      if (meta && meta.title) {
        const isAlbum = sourceUrl.includes('/album/');
        return {
          title: meta.title,
          artistName: meta.artist || undefined,
          thumbnailUrl: meta.thumbnail_url || undefined,
          type: isAlbum ? 'album' : 'track',
          spotifyUrl: sourceUrl,
          originalUrl: sourceUrl,
        };
      }
    } catch (e) {
      console.error('Spotify metadata lookup error:', e);
    }
  }

  // 2. Odesli (Songlink) API
  try {
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(sourceUrl)}`
    );

    if (res.ok) {
      const data = await res.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      let appleUrl = data.linksByPlatform?.appleMusic?.url || data.linksByPlatform?.itunes?.url;
      let spotifyUrl = data.linksByPlatform?.spotify?.url;
      let youtubeUrl = data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url;

      if (appleUrl && appleUrl.includes('geo.music.apple.com')) {
        appleUrl = appleUrl.replace('geo.music.apple.com', 'music.apple.com');
      }

      return {
        title: entity?.title,
        artistName: entity?.artistName,
        thumbnailUrl: entity?.thumbnailUrl,
        type: entity?.type === 'album' ? 'album' : 'track',
        appleUrl,
        spotifyUrl,
        youtubeUrl,
        originalUrl: sourceUrl,
      };
    }
  } catch (e) {
    console.error('Odesli API lookup failed:', e);
  }

  // 3. Fallback for YouTube URLs
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?/\s]{11})/;
  const match = sourceUrl.match(youtubeRegex);
  if (match && match[1]) {
    const videoId = match[1];
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title,
          artistName: data.author_name,
          thumbnailUrl: data.thumbnail_url,
          type: 'track',
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
          originalUrl: sourceUrl,
        };
      }
    } catch (e) {
      console.error('YouTube oEmbed fallback error:', e);
    }
  }

  return null;
}
