import { resolveApplePlatform, EntityContext } from '../../lib/urlResolver';
import PlatformButton from './PlatformButton';

export default async function AppleSection({ ctx, sourceUrl }: { ctx: EntityContext; sourceUrl?: string }) {
  const result = await resolveApplePlatform(ctx, sourceUrl);
  const isExplicitSource = !!sourceUrl?.includes('apple.com');

  return (
    <PlatformButton
      platform="apple_music"
      className="apple"
      noMatchLabel="No confident match — Search Apple Music"
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
