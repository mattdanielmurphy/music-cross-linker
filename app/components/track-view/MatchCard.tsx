import React from 'react';
import { IconCheck } from '@tabler/icons-react';

// Strips noisy suffixes some sources leave on the raw title, e.g. Spotify
// oEmbed titles like "Rock - Album by Tiny Tim | Spotify" — same cleanup
// PlatformButton already does for the active match, applied here too so
// candidate cards in the "Not Right?" list look consistent.
const cleanTitle = (title: string | null | undefined) =>
  title?.split(' - Album by ')[0]?.split(' | Spotify')[0] ?? '';

export default function MatchCard({ candidate, onSelect, isSelected }: any) {
  return (
    <div 
      className={`match-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(candidate)}
      style={{ display: 'flex', gap: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', background: isSelected ? '#f0f8ff' : '#fff' }}
    >
      {candidate.thumbnail_url && (
        <img src={candidate.thumbnail_url} alt={candidate.title} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
      )}
      <div style={{ flex: 1, color: '#000' }}>
        <div style={{ fontWeight: 'bold' }}>{cleanTitle(candidate.title) || 'Unknown Title'}</div>
        <div style={{ fontSize: '0.85em', color: '#666' }}>{candidate.artist || candidate.platform}</div>
      </div>
      {isSelected && <IconCheck color="green" />}
    </div>
  );
}
