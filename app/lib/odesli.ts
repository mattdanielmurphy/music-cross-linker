export interface OdesliResult {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  appleUrl?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
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
    
    const appleUrl = data.linksByPlatform?.appleMusic?.url || data.linksByPlatform?.itunes?.url;
    const spotifyUrl = data.linksByPlatform?.spotify?.url;
    const youtubeUrl = data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url;

    return {
      title: entity?.title,
      artistName: entity?.artistName,
      thumbnailUrl: entity?.thumbnailUrl,
      appleUrl,
      spotifyUrl,
      youtubeUrl,
    };
  } catch (e) {
    console.error('Odesli API lookup failed:', e);
    return null;
  }
}
