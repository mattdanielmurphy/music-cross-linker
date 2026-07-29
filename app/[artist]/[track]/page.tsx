import { notFound } from 'next/navigation';
import { getTopVideoId } from '../../lib/youtube';
import { getPlatformLinks } from '../../lib/urlResolver';

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ artist: string; track: string }>;
  searchParams: Promise<{ a?: string; t?: string; type?: 'track' | 'album'; src?: string }>;
}) {
  const { artist, track } = await params;
  const { a, t, type = 'track', src } = await searchParams;
  if (!a || !t) return notFound();

  const videoId = await getTopVideoId(a, t);
  const { appleUrl, spotifyUrl } = await getPlatformLinks(a, t, type, src);

  const isAlbum = type === 'album';

  return (
    <main className="main-content">
      <div className="track-card glass">
        <div className="track-header">
          <span className="badge">{isAlbum ? 'Album Link' : 'Track Link'}</span>
          <h1 className="track-title gradient-text">{t}</h1>
          <p className="track-artist">by {a}</p>
        </div>

        {videoId && (
          <div className="player-wrapper">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
              title={`${t} by ${a}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen={true}
              suppressHydrationWarning={true}
            />
          </div>
        )}

        <div className="link-buttons">
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-spotify"
          >
            {isAlbum ? 'Listen to Album on Spotify' : 'Listen on Spotify'}
          </a>
          <a
            href={appleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-apple"
          >
            {isAlbum ? 'Listen to Album on Apple Music' : 'Listen on Apple Music'}
          </a>
        </div>
      </div>
    </main>
  );
}
