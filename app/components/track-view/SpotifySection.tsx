import { resolveSpotifyPlatform, EntityContext } from '../../lib/urlResolver';
import PlatformButton from './PlatformButton';

export default async function SpotifySection({ ctx, sourceUrl }: { ctx: EntityContext; sourceUrl?: string }) {
  const result = await resolveSpotifyPlatform(ctx, sourceUrl);
  const isExplicitSource = !!sourceUrl?.includes('spotify.com');

  return (
    <PlatformButton
      platform="spotify"
      className="spotify"
      noMatchLabel="No confident match — Search Spotify"
      url={result.url}
      candidates={result.candidates}
      matchedBy={result.matchedBy}
      entityId={ctx.entityId}
      isExplicitSource={isExplicitSource}
      initialQuery={ctx.searchTerm}
      uncertain={result.uncertain}
    />
  );
}
