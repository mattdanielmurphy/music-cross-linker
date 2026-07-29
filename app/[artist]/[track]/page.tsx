import { notFound } from 'next/navigation';
import { getTopVideoId } from '../../lib/youtube';

export default async function TrackPage({ params, searchParams }: { params: Promise<{ artist: string; track: string }>; searchParams: Promise<{ a?: string; t?: string }> }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const { a, t } = resolvedSearchParams;
  if (!a || !t) return notFound();
  
  const videoId = await getTopVideoId(a, t);
  const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(a + ' ' + t)}`;
  const appleSearch = `https://music.apple.com/search?term=${encodeURIComponent(a + ' ' + t)}`;
  
  return (
    <div className="track-container">
      <h1>{t} by {a}</h1>
      {videoId && (
        <div className="player-wrapper">
          <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=0`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      )}
      <div className="link-buttons">
        <a href={spotifySearch} className="btn-spotify">Listen on Spotify</a>
        <a href={appleSearch} className="btn-apple">Listen on Apple Music</a>
      </div>
    </div>
  );
}
