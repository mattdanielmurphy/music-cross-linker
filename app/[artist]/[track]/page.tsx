import { notFound } from 'next/navigation';
import { getTopVideoId } from '../../lib/youtube';

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ artist: string; track: string }>;
  searchParams: Promise<{ a?: string; t?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const { a, t } = resolvedSearchParams;
  if (!a || !t) return notFound();

  const videoId = await getTopVideoId(a, t);
  const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(a + ' ' + t)}`;
  const appleSearch = `https://music.apple.com/search?term=${encodeURIComponent(a + ' ' + t)}`;

  return (
    <main className="main-content">
      <div className="track-card glass">
        <div className="track-header">
          <span className="badge">Track Link</span>
          <h1 className="track-title gradient-text">{t}</h1>
          <p className="track-artist">by {a}</p>
        </div>

        {videoId && (
          <div className="player-wrapper">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <div className="link-buttons">
          <a href={spotifySearch} target="_blank" rel="noopener noreferrer" className="btn btn-spotify">
            Listen on Spotify
          </a>
          <a href={appleSearch} target="_blank" rel="noopener noreferrer" className="btn btn-apple">
            Listen on Apple Music
          </a>
        </div>
      </div>
    </main>
  );
}
