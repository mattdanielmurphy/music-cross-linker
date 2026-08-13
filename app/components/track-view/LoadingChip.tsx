const SolidSpotifyIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#1db954" stroke="none">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.414a.5.5 0 0 1-.707 0C14.73 15.27 13.35 14.8 12 14.8c-1.35 0-2.73.47-3.879 1.614a.5.5 0 0 1-.707-.707C8.75 14.33 10.35 13.8 12 13.8c1.65 0 3.25.53 4.586 1.907a.5.5 0 0 1 0 .707zM17.5 13.2c-1.6-1-4-1.5-6.5-1.5-2.5 0-4.9.5-6.5 1.5a.5.5 0 0 1-.7-0.7c1.8-1.1 4.5-1.8 7.2-1.8s5.4.7 7.2 1.8a.5.5 0 0 1-.7 0.7zM18 10.4c-2-1.2-5-1.8-8-1.8-3 0-6 .6-8 1.8a.5.5 0 0 1-.6-.8c2.3-1.4 5.7-2.1 8.6-2.1 2.9 0 6.3.7 8.6 2.1a.5.5 0 0 1-.6.8z" />
  </svg>
);

const SolidAppleIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#fc3c44" stroke="none">
    <path d="M18.71 19.5c-.83 1.24-1.76 2.5-3.15 2.5-1.37 0-1.82-.82-3.38-.82-1.57 0-2.07.82-3.38.82-1.47 0-2.48-1.34-3.57-2.88-1.26-1.83-2.2-4.22-2.2-6.57 0-3.5 2.1-5.36 4.35-5.36 1.34 0 2.45.9 3.39.9.94 0 2.37-1.14 4.07-1.14 1.45 0 2.76.62 3.65 1.63-2.92 1.58-2.6 5.17.07 6.64-.32.95-.78 2.06-1.35 2.9zm-3.56-14.5c.82-1 1.36-2.38 1.21-3.76-1.17.05-2.6.78-3.44 1.76-.75.87-1.37 2.27-1.19 3.61 1.3.1 2.6-.61 3.42-1.61z" />
  </svg>
);

const ICONS: Record<string, any> = {
  spotify: SolidSpotifyIcon,
  apple_music: SolidAppleIcon,
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
