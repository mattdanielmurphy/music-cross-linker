import { headers } from 'next/headers';
import { detectCountryFromHeaders } from '../../lib/geo';
import { getPlatformLinks } from '../../lib/urlResolver';
import { getTopVideos } from '../../lib/youtube';
import LinkButtons from '../../components/LinkButtons';

export default async function Page({ params, searchParams }: any) {
  const { artist, track } = await params;
  const formatSlug = (slug: string) =>
    decodeURIComponent(slug)
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  const a = formatSlug(artist);
  const t = formatSlug(track);
  const resolvedSearchParams = await searchParams;
  let country = resolvedSearchParams.country;

  if (!country) {
    const h = await headers();
    country = await detectCountryFromHeaders(h);
  }

  const links = await getPlatformLinks(a, t, country);
  const { appleUrl, spotifyUrl, youtubeUrl, isAlbum } = links;

  let videoId = '';
  if (youtubeUrl) {
    const match = youtubeUrl.match(/(?:v=|\/embed\/|\/watch\?v=|\/youtu\.be\/)([^"&?\/\s]{11})/);
    videoId = match ? match[1] : '';
  }

  if (!videoId) {
    const videos = await getTopVideos(a, t, 'track', 5);
    videoId = videos[0]?.id || '';
  }

  return (
    <div className="main-content">
      <div className="track-card">
        <header className="track-header">
          <div className="badge">{isAlbum ? 'Album Link' : 'Track Link'}</div>
          <h1 className="track-title accent-text">{t}</h1>
          <p className="track-artist">by {a}</p>
        </header>
        
        {videoId && (
          <div className="player-wrapper">
            <iframe 
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
              title={`${t} by ${a}`} 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen 
              suppressHydrationWarning={true}
            />
          </div>
        )}

        <LinkButtons appleUrl={appleUrl} spotifyUrl={spotifyUrl} youtubeUrl={youtubeUrl} country={country} />
      </div>
    </div>
  );
}
