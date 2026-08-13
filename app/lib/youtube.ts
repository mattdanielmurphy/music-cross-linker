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

  const videoMatches = Array.from(
    html.matchAll(/"videoRenderer"\s*:\s*(\{[\s\S]*?\})(?=,\s*"videoRenderer"|,\s*"compactVideoRenderer"|,\s*"continuationItemRenderer"|\]\}\}\}\})/g)
  );

  for (const match of videoMatches) {
    const block = match[1];
    const videoIdMatch = block.match(/"videoId"\s*:\s*"(.*?)"/);
    const titleMatch = block.match(
      /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"(.*?)"/
    );
    const channelMatch = block.match(/"longBylineText":[\s\S]*?"text":"(.*?)"/);

    if (videoIdMatch && videoIdMatch[1]) {
      const id = videoIdMatch[1];
      const videoTitle = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : 'YouTube Video';
      const channel = channelMatch ? channelMatch[1] : undefined;
      const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({ id, title: videoTitle, channel, thumbnail });
      }
    }
  }

  return candidates.slice(0, limit);
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
