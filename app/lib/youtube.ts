export interface YouTubeVideoCandidate {
  id: string;
  title: string;
}

export async function getTopVideos(
  artist: string,
  title: string,
  type: 'track' | 'album' = 'track',
  limit = 5
): Promise<YouTubeVideoCandidate[]> {
  const isAlbum = type === 'album';
  const queryText = isAlbum
    ? `${artist} ${title} full album`
    : `${artist} ${title} official audio`;
  const query = encodeURIComponent(queryText);
  console.log('[YOUTUBE SEARCH QUERY]', { artist, title, type, queryText });
  const res = await fetch(`https://www.youtube.com/results?search_query=${query}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();

  const candidates: YouTubeVideoCandidate[] = [];
  const seenIds = new Set<string>();

  const videoMatches = Array.from(
    html.matchAll(/"videoRenderer":\s*({[\s\S]*?})(?=,\s*"videoRenderer"|\]\}\}\}\})/g)
  );

  for (const match of videoMatches) {
    const block = match[1];
    const videoIdMatch = block.match(/"videoId"\s*:\s*"(.*?)"/);
    const titleMatch = block.match(
      /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"(.*?)"/
    );

    if (videoIdMatch && videoIdMatch[1]) {
      const id = videoIdMatch[1];
      const videoTitle = titleMatch ? titleMatch[1] : 'YouTube Video';
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({ id, title: videoTitle });
      }
    }
  }

  console.log('[YOUTUBE RAW CANDIDATES]', candidates);
  return candidates.slice(0, limit);
}

export async function getTopVideoId(
  artist: string,
  title: string,
  type: 'track' | 'album' = 'track'
): Promise<string | null> {
  const videos = await getTopVideos(artist, title, type, 1);
  return videos.length > 0 ? videos[0].id : null;
}
