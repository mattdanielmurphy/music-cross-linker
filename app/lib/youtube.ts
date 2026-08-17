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

  try {
    const ytInitialDataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (ytInitialDataMatch) {
      const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
      const contents =
        ytInitialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

      for (const section of contents) {
        const itemSection = section.itemSectionRenderer?.contents || [];
        for (const item of itemSection) {
          const video = item.videoRenderer;
          if (video && video.videoId) {
            const titleRuns = video.title?.runs?.map((r: any) => r.text).join('') || video.title?.simpleText || 'YouTube Video';
            const channel = video.ownerText?.runs?.map((r: any) => r.text).join('') || video.shortBylineText?.runs?.map((r: any) => r.text).join('') || video.longBylineText?.runs?.map((r: any) => r.text).join('');
            candidates.push({
              id: video.videoId,
              title: titleRuns,
              channel: channel || undefined,
              thumbnail: video.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
            });
          }
          if (candidates.length >= limit) break;
        }
        if (candidates.length >= limit) break;
      }
    }
  } catch (e) {
    console.error('Failed to parse ytInitialData, falling back to regex', e);
  }

  if (candidates.length === 0) {
    const videoIdMatches = Array.from(html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g));
    for (const match of videoIdMatches) {
      const id = match[1];
      const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      candidates.push({ id, title: 'YouTube Video', thumbnail });
      if (candidates.length >= limit) break;
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
