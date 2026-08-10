export async function getPlatformLinks(artist: string, title: string, country: string = 'CA', sourceUrl?: string) {
  const countryCode = country.toUpperCase();
  let isAlbum = false;
  
  // Apple Music
  let appleUrl = `https://music.apple.com/${countryCode.toLowerCase()}/search?term=${encodeURIComponent(artist + ' ' + title)}`;
  
  // 1. Search for album
  const albumSearch = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&media=music&entity=album&country=${countryCode.toLowerCase()}&limit=1`).then(r => r.json()).catch(() => null);
  if (albumSearch?.results?.[0]?.collectionViewUrl?.includes('music.apple.com')) {
    appleUrl = albumSearch.results[0].collectionViewUrl;
    isAlbum = true;
  } else {
    // 2. Fallback to song
    const songSearch = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&media=music&entity=song&country=${countryCode.toLowerCase()}&limit=1`).then(r => r.json()).catch(() => null);
    if (songSearch?.results?.[0]) {
      appleUrl = songSearch.results[0].trackViewUrl || songSearch.results[0].collectionViewUrl;
    }
  }

  // 3. Clean Apple Music URL (strip query parameters)
  if (appleUrl.includes('music.apple.com')) {
    appleUrl = appleUrl.split('?')[0];
  }

  // Spotify
  let spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`;
  if (sourceUrl?.includes('spotify.com')) {
    spotifyUrl = sourceUrl;
  } else {
    const odesli = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(sourceUrl || '')}&userCountry=${countryCode}`).then(r => r.json()).catch(() => null);
    if (odesli?.linksByPlatform?.spotify?.url) spotifyUrl = odesli.linksByPlatform.spotify.url;
  }

  // YouTube
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`;

  return { appleUrl, spotifyUrl, youtubeUrl, isAlbum, country: countryCode };
}
