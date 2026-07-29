export async function getTopVideoId(artist: string, title: string): Promise<string | null> {
  const query = encodeURIComponent(`${artist} ${title} official audio`);
  const res = await fetch(`https://www.youtube.com/results?search_query=${query}`);
  const html = await res.text();
  const match = html.match(/"videoId":"(.*?)"/);
  return match ? match[1] : null;
}
