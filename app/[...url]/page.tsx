import { redirect } from 'next/navigation';
import { slugify } from '../lib/slugify';

export default async function CatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ url: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  let url = resolvedParams.url.map(decodeURIComponent).join('/');
  if (url.startsWith('https:/') && !url.startsWith('https://')) {
    url = url.replace('https:/', 'https://');
  }

  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => queryString.append(key, v));
    } else if (value) {
      queryString.append(key, value);
    }
  }
  const qs = queryString.toString();
  if (qs) {
    url += '?' + qs;
  }

  let artist = '';
  let title = '';
  let type: 'track' | 'album' = 'track';

  try {
    if (url.includes('music.apple.com')) {
      const countryMatch = url.match(/music\.apple\.com\/([a-z]{2})\//);
      const country = countryMatch ? countryMatch[1] : 'us';

      const trackIdMatch = url.match(/\?i=(\d+)/) || url.match(/&i=(\d+)/);
      const albumIdMatch = url.match(/\/album\/[^/]+\/(\d+)/) || url.match(/\/id(\d+)/);

      if (trackIdMatch) {
        type = 'track';
        const res = await fetch(
          `https://itunes.apple.com/lookup?id=${trackIdMatch[1]}&country=${country}`
        );
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          artist = data.results[0].artistName;
          title = data.results[0].trackName || data.results[0].collectionName;
        }
      }

      if (!artist && albumIdMatch) {
        type = trackIdMatch ? 'track' : 'album';
        // Try looking up the album with entity=song to find the track if the direct track lookup failed
        const res = await fetch(
          `https://itunes.apple.com/lookup?id=${albumIdMatch[1]}&country=${country}&entity=song`
        );
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          artist = data.results[0].artistName;
          
          // If we had a specific trackIdMatch, try to find it within the album results
          if (trackIdMatch) {
            const trackResult = data.results.find((r: any) => r.trackId?.toString() === trackIdMatch[1]);
            if (trackResult) {
              title = trackResult.trackName;
            } else {
              title = data.results[0].collectionName;
            }
          } else {
            title = data.results[0].collectionName;
          }
        }
      }
    } else if (url.includes('open.spotify.com')) {
      if (url.includes('/album/')) {
        type = 'album';
      } else {
        type = 'track';
      }
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const titleMatch =
        html.match(/<title>(.*?)\| Spotify<\/title>/) ||
        html.match(/<title>(.*?) \| Spotify<\/title>/);
      if (titleMatch) {
        const parts = titleMatch[1].split(' - ');
        if (parts.length >= 2) {
          artist = parts[0].trim();
          title = parts.slice(1).join(' ').trim();
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (artist && title) {
    redirect(
      `/${slugify(artist)}/${slugify(title)}?type=${type}`
    );
  }
  return <div>Could not resolve track. URL: {url}</div>;
}
