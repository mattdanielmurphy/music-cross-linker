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
    try {
      const searchType = type === 'album' ? 'album' : 'track';
      const query = `site:open.spotify.com/${searchType} ${artist} ${title}`;
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }
      );
      const html = await res.text();
      const regex = new RegExp(`open\\.spotify\\.com\\/${searchType}\\/([a-zA-Z0-9]+)`);
      const match = html.match(regex);
      if (match && match[1]) {
        spotifyUrl = `https://open.spotify.com/${searchType}/${match[1]}`;
      }
    } catch (e) {
      console.error('Failed to resolve direct Spotify link via search lookup:', e);
    }
  }

  if (!spotifyUrl) {
    spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(
      artist + ' ' + title
    )}`;
  }

  return { appleUrl, spotifyUrl };
}

