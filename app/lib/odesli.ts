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
  try {
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(sourceUrl)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    
    const entityId = data.entityUniqueId;
    const entity = data.entitiesByUniqueId?.[entityId];
    
    let appleUrl = data.linksByPlatform?.appleMusic?.url || data.linksByPlatform?.itunes?.url;
    let spotifyUrl = data.linksByPlatform?.spotify?.url;
    let youtubeUrl = data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url;

    // Clean up geo.music.apple.com links if needed
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
  } catch (e) {
    console.error('Odesli API lookup failed:', e);
    return null;
  }
}
