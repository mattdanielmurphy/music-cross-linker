export async function getTrack(id: string) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
  return response.json();
}
