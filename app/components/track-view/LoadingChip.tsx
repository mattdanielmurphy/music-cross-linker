import { SiSpotify, SiApple } from 'react-icons/si';

const ICONS: Record<string, any> = {
  spotify: SiSpotify,
  apple_music: SiApple,
};

const CLASSES: Record<string, string> = {
  spotify: 'spotify',
  apple_music: 'apple',
};

/**
 * Loading placeholder shown in place of a PlatformButton while its match is
 * still being resolved. Renders in the same shape/styling as the real button
 * (icon + platform color) so the button appears instantly and just shows a
 * spinner where the match info will go, instead of popping in late.
 */
export default function LoadingChip({ platform }: { platform?: 'spotify' | 'apple_music' }) {
  const Icon = platform ? ICONS[platform] : null;
  const className = platform ? CLASSES[platform] : '';

  return (
    <div
      className={`btn-link ${className}`}
      style={{ opacity: 0.7, cursor: 'default' }}
    >
      {Icon ? <Icon size={28} style={{ flexShrink: 0 }} /> : <span className="spinner" aria-hidden="true" />}
      <span>Searching{platform ? '…' : ' for a match…'}</span>
    </div>
  );
}
