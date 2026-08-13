export interface YouTubeVideoCandidate {
  id: string;
  title: string;
  channel?: string;
  thumbnail?: string;
}

export async function searchYouTubeVideos(
  query: string,
  limit = 10
): Promise<YouTubeVideoCandidate[]> {
  const encodedQuery = encodeURIComponent(query);
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodedQuery}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();

  const candidates: YouTubeVideoCandidate[] = [];
  const seenIds = new Set<string>();

  // Extract all videoRenderer JSON blocks or videoId matches
  const videoIdMatches = Array.from(html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g));

  for (const match of videoIdMatches) {
    const id = match[1];
    if (seenIds.has(id)) continue;

    // Find the slice of HTML around this videoId to get title and channel name
    const idx = match.index || 0;
    const block = html.slice(idx, idx + 2500);

    const titleMatch = block.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"(.*?)"/);
    const channelMatch = block.match(/"longBylineText":[\s\S]*?"text":"(.*?)"/);

    const videoTitle = titleMatch ? titleMatch[1].replace(/\\"/g, '"').replace(/\\u0026/g, '&') : 'YouTube Video';
    const channel = channelMatch ? channelMatch[1] : undefined;
    const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    seenIds.add(id);
    candidates.push({ id, title: videoTitle, channel, thumbnail });

    if (candidates.length >= limit) break;
  }

  return candidates;
}

export async function getTopVideos(
  artist: string,
  title: string,
  type: 'track' | 'album' = 'track',
  limit = 5
): Promise<YouTubeVideoCandidate[]> {
  const isAlbum = type === 'album';
  const queryText = isAlbum
    ? (artist ? `${artist} ${title} full album` : `${title} full album`)
    : (artist ? `${artist} ${title} official audio` : `${title} official audio`);
  return searchYouTubeVideos(queryText, limit);
}

export async function getTopVideoId(
  artist: string,
  title: string,
  type: 'track' | 'album' = 'track'
): Promise<string | null> {
  const videos = await getTopVideos(artist, title, type, 1);
  return videos.length > 0 ? videos[0].id : null;
}
