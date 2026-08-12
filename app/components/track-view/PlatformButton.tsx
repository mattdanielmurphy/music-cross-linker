'use client';
import { useState } from 'react';
import { IconBrandSpotify, IconBrandApple, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import CandidateList from './CandidateList';

const ICONS: Record<string, any> = {
  spotify: IconBrandSpotify,
  apple_music: IconBrandApple,
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
      <a href={currentUrl} className={`btn-link ${className}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '8px 12px', minHeight: '64px' }}>
        <Icon size={28} style={{ flexShrink: 0 }} />
        {isNoMatch(active) ? (
          <span>{noMatchLabel}</span>
        ) : (
          <>
            {active.thumbnail_url && <img src={active.thumbnail_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold' }}>{cleanTitle(active.title)}</div>
              <div style={{ fontWeight: 'normal' }}>{active.artist}</div>
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
      {entityId && !isExplicitSource && !isNoMatch(active) && (
        <CandidateList platform={platform} candidates={candidates} entityId={entityId} currentUrl={currentUrl} onUpdateMatch={handleUpdateMatch} initialQuery={initialQuery} />
      )}
    </div>
  );
}
