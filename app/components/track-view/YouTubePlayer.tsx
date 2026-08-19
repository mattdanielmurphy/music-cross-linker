'use client';
import React, { useState } from 'react';
import CandidateList from './CandidateList';
import { useDynamicTheme } from './DynamicThemeProvider';

interface YouTubePlayerProps {
  initialVideoId: string;
  artist: string;
  title: string;
  entityId: string;
  isExplicitSource: boolean;
  candidates: any[];
  currentUrl: string;
  searchTerm: string;
}

export default function YouTubePlayer({
  initialVideoId,
  artist,
  title,
  entityId,
  isExplicitSource,
  candidates,
  currentUrl: initialCurrentUrl,
  searchTerm,
}: YouTubePlayerProps) {
  const [currentVideoId, setCurrentVideoId] = useState(initialVideoId);
  const [currentUrl, setCurrentUrl] = useState(initialCurrentUrl);
  const { loadPaletteFromArtwork } = useDynamicTheme();

  const handleUpdateMatch = (_platform: string, newUrl: string, _auto: boolean, candidate: any) => {
    const videoIdMatch = newUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
    if (videoIdMatch) {
      setCurrentVideoId(videoIdMatch[1]);
      setCurrentUrl(newUrl);
    }
    if (candidate?.thumbnail_url) {
      loadPaletteFromArtwork(candidate.thumbnail_url);
    } else if (videoIdMatch) {
      loadPaletteFromArtwork(`https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`);
    }
  };

  return (
    <>
      <div className="player-wrapper">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=0&rel=0&modestbranding=1&iv_load_policy=3`}
          title={`${title} by ${artist}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          suppressHydrationWarning={true}
        />
      </div>
      {entityId && !isExplicitSource && (
        <CandidateList
          platform="youtube"
          candidates={candidates}
          entityId={entityId}
          currentUrl={currentUrl}
          initialQuery={searchTerm}
          onUpdateMatch={handleUpdateMatch}
        />
      )}
    </>
  );
}
