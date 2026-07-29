import { notFound } from 'next/navigation';
import { getTopVideos } from '../../lib/youtube';
import { getPlatformLinks } from '../../lib/urlResolver';

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ artist: string; track: string }>;
  searchParams: Promise<{ type?: 'track' | 'album' }>;
}) {
  const { artist, track } = await params;
  const { type = 'track' } = await searchParams;

  const formatSlug = (slug: string) =>
    decodeURIComponent(slug)
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  const a = formatSlug(artist);
  const t = formatSlug(track);

  if (!a || !t) return notFound();

  const videos = await getTopVideos(a, t, type, 5);
  const videoId = videos.length > 0 ? videos[0].id : null;
  const { appleUrl, spotifyUrl } = await getPlatformLinks(a, t, type);

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

        {videos.length > 0 && (
          <div className="candidates-section" style={{ marginTop: '1.5rem', textAlign: 'left' }}>
            <h3 style={{ fontSize: '0.95rem', opacity: 0.8, marginBottom: '0.5rem' }}>Top YouTube Results ({videos.length})</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {videos.map((vid, idx) => (
                <li key={vid.id} style={{ fontSize: '0.85rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <a href={`https://www.youtube.com/watch?v=${vid.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', gap: '0.5rem' }}>
                    <span style={{ opacity: 0.5 }}>#{idx + 1}</span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vid.title}</span>
                  </a>
                </li>
              ))}
            </ul>
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
