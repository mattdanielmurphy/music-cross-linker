export async function getTopVideoId(artist: string, title: string, type: 'track' | 'album' = 'track'): Promise<string | null> {
  const isAlbum = type === 'album';
  const queryText = isAlbum
    ? `${artist} ${title} full album`
    : `${artist} ${title} official audio`;
  const query = encodeURIComponent(queryText);
  const res = await fetch(`https://www.youtube.com/results?search_query=${query}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();

  const titleLower = title.toLowerCase().trim();
  const artistLower = artist.toLowerCase().trim();

  // Parse videoRenderer items from ytInitialData
  const items: Array<{ id: string; videoTitle: string }> = [];
  const videoMatches = Array.from(html.matchAll(/"videoRenderer":\s*({[\s\S]*?})(?=,\s*"videoRenderer"|\]\}\}\}\})/g));
  
  for (const match of videoMatches) {
    const block = match[1];
    const videoIdMatch = block.match(/"videoId"\s*:\s*"(.*?)"/);
    const titleMatch = block.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"(.*?)"/);
    if (videoIdMatch && videoIdMatch[1]) {
      items.push({
        id: videoIdMatch[1],
        videoTitle: titleMatch ? titleMatch[1].toLowerCase() : ''
      });
    }
  }

  if (isAlbum) {
    // 1. Look for video explicitly matching album title AND containing "full album" or "album"
    for (const item of items) {
      const containsAlbumTitle = item.videoTitle.includes(titleLower);
      const containsAlbumKeyword = item.videoTitle.includes('full album') || item.videoTitle.includes('album');
      if (containsAlbumTitle && containsAlbumKeyword) {
        return item.id;
      }
    }

    // 2. Look for any result containing the target album title while excluding single-track descriptors
    for (const item of items) {
      const containsAlbumTitle = item.videoTitle.includes(titleLower);
      const isSingleTrack = item.videoTitle.includes('official audio') ||
                            item.videoTitle.includes('official video') ||
                            item.videoTitle.includes('music video') ||
                            item.videoTitle.includes('lyric video');
      if (containsAlbumTitle && !isSingleTrack) {
        return item.id;
      }
    }
  }

  // Fallback for track or if no strict album filter matched:
  // Match item containing the title
  for (const item of items) {
    if (item.videoTitle.includes(titleLower)) {
      return item.id;
    }
  }

  return items.length > 0 ? items[0].id : null;
}
