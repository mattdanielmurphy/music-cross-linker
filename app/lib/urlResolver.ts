export async function getPlatformLinks(artist: string, title: string, country: string = 'CA', sourceUrl?: string) {
  const countryCode = country.toUpperCase();
  let isAlbum = false;
  
  // Use title only for searches — artist from YouTube channel names is unreliable
  // If artist is provided and non-empty, include it; otherwise just title
  const searchTerm = (artist && artist.trim()) ? `${artist.trim()} ${title}` : title;

  // Apple Music — fallback search URL includes query term
  let appleUrl = `https://music.apple.com/${countryCode.toLowerCase()}/search?term=${encodeURIComponent(title)}`;
  
  // 1. Search for album
  const albumSearch = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=album&country=${countryCode.toLowerCase()}&limit=1`).then(r => r.json()).catch(() => null);
  if (albumSearch?.results?.[0]?.collectionViewUrl?.includes('music.apple.com')) {
    appleUrl = albumSearch.results[0].collectionViewUrl.split('?')[0];
    isAlbum = true;
  } else {
    // 2. Fallback to song
    const songSearch = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song&country=${countryCode.toLowerCase()}&limit=1`).then(r => r.json()).catch(() => null);
    if (songSearch?.results?.[0]) {
      const rawUrl = songSearch.results[0].trackViewUrl || songSearch.results[0].collectionViewUrl;
      appleUrl = rawUrl ? rawUrl.split('?')[0] : appleUrl;
    }
  }

  // Spotify — fallback search URL uses title only
  let spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(title)}`;
  if (sourceUrl?.includes('spotify.com')) {
    spotifyUrl = sourceUrl;
  } else {
    const odesli = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(sourceUrl || '')}&userCountry=${countryCode}`).then(r => r.json()).catch(() => null);
    if (odesli?.linksByPlatform?.spotify?.url) spotifyUrl = odesli.linksByPlatform.spotify.url;
  }

  // YouTube search — use title only
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`;

  return { appleUrl, spotifyUrl, youtubeUrl, isAlbum, country: countryCode };
}
