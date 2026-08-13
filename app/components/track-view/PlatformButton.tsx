'use client';
import { useState } from 'react';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import CandidateList from './CandidateList';

// Solid Icons
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

const cleanTitle = (title: string | null | undefined) => title?.split(' - Album by ')[0] ?? '';
const isNoMatch = (c: any) => !c || (typeof c.source === 'string' && c.source.endsWith('_fallback'));
const isLowConfidence = (c: any) => c && c.confidence != null && Number(c.confidence) < 1 && !isNoMatch(c);

export default function PlatformButton({
  platform,
  className,
  noMatchLabel,
  url,
  candidates,
  matchedBy,
  entityId,
  isExplicitSource,
  initialQuery,
  uncertain,
}: {
  platform: 'spotify' | 'apple_music';
  className: string;
  noMatchLabel: string;
  url: string;
  candidates: any[];
  matchedBy: string | null;
  entityId: string;
  isExplicitSource: boolean;
  initialQuery?: string;
  uncertain?: boolean;
}) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [currentMatchedBy, setCurrentMatchedBy] = useState(matchedBy);
  const [currentUncertain, setCurrentUncertain] = useState(!!uncertain);
  // Tracks a freshly-picked candidate (from the "Not Right?" list) directly,
  // since it may not exist in the `candidates` prop below — that's just a
  // stale snapshot taken at the initial server render and never refetched.
  const [pickedCandidate, setPickedCandidate] = useState<any>(null);

  const handleUpdateMatch = (_platform: string, newUrl: string, manual: boolean, candidate?: any, isUncertain?: boolean) => {
    setCurrentUrl(newUrl);
    setCurrentMatchedBy(manual ? 'manual' : null);
    setPickedCandidate(candidate || null);
    setCurrentUncertain(!!isUncertain);
  };

  const active = pickedCandidate || candidates.find((c: any) => c.candidate_url === currentUrl) || candidates[0];
  const Icon = ICONS[platform];

  return (
    <div>
      <a href={currentUrl} className={`btn-link ${className}`} target="_blank" rel="noopener noreferrer">
        <Icon />
        {isNoMatch(active) ? (
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{noMatchLabel}</span>
        ) : (
          <>
            {active.thumbnail_url && <img src={active.thumbnail_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanTitle(active.title)}</div>
              <div style={{ fontWeight: 'normal', fontSize: '0.8rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.artist}</div>
            </div>
          </>
        )}
      </a>
      {currentMatchedBy === 'manual' && (
        <div style={{ fontSize: '0.8em', color: 'green', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <IconCheck size={14} /> Matched by Matt
        </div>
      )}
      {currentMatchedBy === 'manual' && currentUncertain && (
        <div style={{ fontSize: '0.8em', color: '#b8860b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <IconAlertTriangle size={14} /> Not quite right — closest available match
        </div>
      )}
      {currentMatchedBy !== 'manual' && isLowConfidence(active) && (
        <div style={{ fontSize: '0.8em', color: '#b8860b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <IconAlertTriangle size={14} /> Uncertain match — might be wrong
        </div>
      )}
      {entityId && !isExplicitSource && (
        <CandidateList platform={platform} candidates={candidates} entityId={entityId} currentUrl={currentUrl} onUpdateMatch={handleUpdateMatch} initialQuery={initialQuery} isNoMatch={isNoMatch(active)} />
      )}
    </div>
  );
}
