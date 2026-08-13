import { fetch } from 'undici';

export async function resolveArtworkImage(artist: string, title: string, sourceUrl?: string): Promise<string | null> {
  try {
    if (sourceUrl?.includes('apple.com')) {
      const match = sourceUrl.match(/(album|track|song)\/(?:[\w-]+\/)?([\w-]+)(?:\?i=)?(\d+)?/);
      if (match) {
        const id = match[3] || match[2];
        const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
        const data = await res.json() as any;
        if (data.results?.[0]?.artworkUrl100) {
          return data.results[0].artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg');
        }
      }
    }

    if (sourceUrl?.includes('spotify.com')) {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(sourceUrl)}`);
      const data = await res.json() as any;
      return data.thumbnail_url || null;
    }

    const term = artist ? `${artist} ${title}` : title;
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=album,song&limit=1`);
    const data = await res.json() as any;
    if (data.results?.[0]?.artworkUrl100) {
      return data.results[0].artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg');
    }
  } catch (e) {
    console.error('Error resolving artwork:', e);
  }
  return null;
}
