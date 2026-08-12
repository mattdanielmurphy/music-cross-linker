import { resolveYoutubePlatform, EntityContext } from '../../lib/urlResolver';
import { getTopVideos } from '../../lib/youtube';
import CandidateList from './CandidateList';

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

  // If the source link itself gave us an explicit video ID, that's the one
  // thing we know for sure — render it immediately and skip any cross-link
  // search/candidate lookup entirely (there's nothing to disambiguate, and no
  // CandidateList is shown for an explicit source anyway).
  if (explicitVideoId) {
    return (
      <div className="player-wrapper">
        <iframe
          src={`https://www.youtube.com/embed/${explicitVideoId}?autoplay=0`}
          title={`${title} by ${artist}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          suppressHydrationWarning={true}
        />
      </div>
    );
  }

  let videoId = '';

  // resolveYoutubePlatform already short-circuits on a cached entity_matches
  // row (no network call at all in that case), so try it first and only fall
  // back to a fresh YouTube search if we truly have no known video yet.
  const crossLink = await resolveYoutubePlatform(ctx, sourceUrl);
  if (crossLink) {
    videoId = crossLink.url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1] || '';
  }

  if (!videoId) {
    const videos = await getTopVideos(artist || title, title, ctx.isAlbum ? 'album' : 'track', 5);
    videoId = videos[0]?.id || '';
  }

  if (!videoId) return null;

  return (
    <><div className="player-wrapper">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
        title={`${title} by ${artist}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        suppressHydrationWarning={true}
      />
		</div>
      {ctx.entityId && !isExplicitSource && crossLink && (
        <CandidateList
          platform="youtube"
          candidates={crossLink.candidates}
          entityId={ctx.entityId}
          currentUrl={crossLink.url}
          initialQuery={ctx.searchTerm}
        />
      )}
		</>
  );
}
