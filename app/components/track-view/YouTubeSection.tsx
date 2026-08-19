import { resolveYoutubePlatform, EntityContext } from '../../lib/urlResolver';
import { getTopVideos } from '../../lib/youtube';
import YouTubePlayer from './YouTubePlayer';

export default async function YouTubeSection({
  ctx,
  artist,
  title,
  explicitVideoId,
  sourceUrl,
}: {
  ctx: EntityContext;
  artist: string;
  title: string;
  explicitVideoId?: string;
  sourceUrl?: string;
}) {
  const isExplicitSource = !!sourceUrl?.includes('youtube.com') || !!sourceUrl?.includes('youtu.be');

  if (explicitVideoId) {
    return (
      <div className="player-wrapper">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${explicitVideoId}?autoplay=0&rel=0&modestbranding=1&iv_load_policy=3`}
          title={`${title} by ${artist}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          suppressHydrationWarning={true}
        />
      </div>
    );
  }

  let videoId = '';
  const crossLink = await resolveYoutubePlatform(ctx, sourceUrl);
  if (crossLink?.url) {
    videoId = crossLink.url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] || '';
  }

  if (!videoId) {
    const videos = await getTopVideos(artist || title, title, ctx.isAlbum ? 'album' : 'track', 5);
    videoId = videos[0]?.id || '';
  }

  if (!videoId) return null;

  return (
    <YouTubePlayer
      initialVideoId={videoId}
      artist={artist}
      title={title}
      entityId={ctx.entityId}
      isExplicitSource={isExplicitSource}
      candidates={crossLink?.candidates || []}
      currentUrl={crossLink?.url || `https://www.youtube.com/watch?v=${videoId}`}
      searchTerm={ctx.searchTerm}
    />
  );
}
