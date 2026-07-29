export async function getPlatformLinks(
  artist: string,
  title: string,
  type: 'track' | 'album',
  src?: string
) {
  let appleUrl = src && src.includes('music.apple.com') ? src : '';
  let spotifyUrl = src && src.includes('spotify.com') ? src : '';

  if (!appleUrl) {
    try {
      const entity = type === 'album' ? 'album' : 'song';
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          artist + ' ' + title
        )}&entity=${entity}&limit=1`
      );
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        appleUrl =
          data.results[0].trackViewUrl ||
          data.results[0].collectionViewUrl ||
          '';
      }
    } catch (e) {
      console.error('Failed to resolve Apple Music link:', e);
    }
  }

  if (!appleUrl) {
    appleUrl = `https://music.apple.com/search?term=${encodeURIComponent(
      artist + ' ' + title
    )}`;
  }

  if (!spotifyUrl) {
    spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(
      artist + ' ' + title
    )}`;
  }

  return { appleUrl, spotifyUrl };
}
