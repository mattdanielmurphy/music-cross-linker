'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Renders instantly with a spinner while the slow media-link resolution
 * (Odesli + oEmbed lookups) happens in the background via /api/resolve-link.
 * Once resolved, redirects the browser to the canonical slug — this is what
 * keeps the initial page load fast even for links the app hasn't seen before.
 */
export default function ResolvingRedirect({
  lookupUrl,
  videoId,
}: {
  lookupUrl: string;
  videoId: string | null;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/resolve-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookupUrl, videoId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.slug) {
          router.replace(`/${data.slug}`);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lookupUrl, videoId, router]);

  if (failed) {
    return (
      <div className="main-content">
        <div className="track-card">
          <p>Couldn&apos;t find a match for that link.</p>
          <a href="/" className="btn-link">Go home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="track-card">
        <div className="player-wrapper">
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', aspectRatio: '16/9' }}
            />
          ) : (
            <div className="player-wrapper-skeleton">
              <span className="spinner youtube" aria-hidden="true" />
            </div>
          )}
        </div>
        <p style={{ textAlign: 'center', opacity: 0.7, marginTop: '12px' }}>
          {videoId ? 'Finding cross-platform matches…' : 'Looking up this link…'}
        </p>
      </div>
    </div>
  );
}
