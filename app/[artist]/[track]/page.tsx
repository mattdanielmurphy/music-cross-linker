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
    <main className="container glass" style={{ marginTop: '2rem' }}>
      <h1>{t} by {a}</h1>
      {videoId && (
        <div className="hero-container">
          <div className="glass-card">
            <div className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl">
              <iframe 
                src={`https://www.youtube.com/embed/${videoId}`} 
                title="YouTube video player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <a href={spotifySearch} className="btn-platform">Listen on Spotify</a>
        <a href={appleSearch} className="btn-platform">Listen on Apple Music</a>
      </div>
    </main>
  );
}
