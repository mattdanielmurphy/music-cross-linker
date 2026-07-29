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

  // Try to parse videoRenderer blocks to inspect titles
  const videoMatches = Array.from(html.matchAll(/"videoRenderer":\s*({[\s\S]*?})(?=,\s*"videoRenderer"|\]\}\}\}\})/g));
  
  for (const match of videoMatches) {
    try {
      const block = match[1];
      const videoIdMatch = block.match(/"videoId"\s*:\s*"(.*?)"/);
      const titleMatch = block.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"(.*?)"/);
      
      if (videoIdMatch && videoIdMatch[1]) {
        const videoId = videoIdMatch[1];
        const videoTitle = titleMatch ? titleMatch[1].toLowerCase() : '';
        
        if (isAlbum) {
          // Exclude single track indicators if possible or prefer full album matches
          if (videoTitle.includes('full album') || videoTitle.includes('album') || !videoTitle.includes('official video')) {
            return videoId;
          }
        } else {
          return videoId;
        }
      }
    } catch (e) {
      // ignore item parse errors
    }
  }

  // Fallback direct match if structured parse yields nothing
  const match = html.match(/"videoId":"(.*?)"/);
  return match ? match[1] : null;
}
