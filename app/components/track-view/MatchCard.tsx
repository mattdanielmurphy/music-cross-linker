import React from 'react';
import { IconCheck } from '@tabler/icons-react';
import { cleanYouTubeTitle } from '../../lib/youtube/titleParser';

const cleanTitle = (title: string | null | undefined) => (title ? cleanYouTubeTitle(title) : '');

export default function MatchCard({ candidate, onSelect, isSelected }: any) {
  return (
    <div 
      className={`match-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(candidate)}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        padding: '10px 12px', 
        border: isSelected ? '1px solid var(--accent-color)' : '1px solid var(--card-border)', 
        borderRadius: 'var(--radius-md)', 
        cursor: 'pointer', 
        marginBottom: '8px', 
        background: isSelected ? 'var(--card-item-selected-bg)' : 'var(--card-item-bg)',
        transition: 'all 0.15s ease'
      }}
    >
      {candidate.thumbnail_url && (
        <img src={candidate.thumbnail_url} alt={candidate.title} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{cleanTitle(candidate.title) || 'Unknown Title'}</div>
        <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>{candidate.artist || candidate.platform}</div>
      </div>
      {isSelected && <IconCheck size={18} color="#1db954" />}
    </div>
  );
}
