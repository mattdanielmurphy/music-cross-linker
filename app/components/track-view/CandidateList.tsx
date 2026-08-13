'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconSearch } from '@tabler/icons-react';
import MatchCard from './MatchCard';

/**
 * The "Not Right?" picker. Shows a single list of candidates, styled
 * identically whether they came from our own auto-match search or from the
 * user re-searching: it starts out populated with the system's own
 * candidates (pre-filled query = the search term we actually used), and as
 * soon as the user edits/submits the query, that same list is replaced with
 * fresh results for the new query — there's never two separate lists.
 */
export default function CandidateList({ platform, candidates, entityId, currentUrl, initialQuery, onUpdateMatch, isNoMatch }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<any[]>(candidates || []);
  const [limit, setLimit] = useState(10);
  const [searched, setSearched] = useState(false);
  // "This isn't right, but it's the closest available" — lets a manual pick
  // be recorded honestly instead of implying full confidence.
  const [uncertain, setUncertain] = useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (isOpen && isNoMatch && !searched && initialQuery) {
      runSearch();
    }
  }, [isOpen, isNoMatch, searched, initialQuery]);


  const handleSelect = async (candidate: any) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/entities/${entityId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          matched_url: candidate.candidate_url,
          candidate_id: candidate.id || null,
          verified_by: 'Matt',
          uncertain,
        })
      });
      if (res.ok) {
        if (onUpdateMatch) {
          // Pass the full candidate object, not just the URL — the parent's
          // display (title/artist/thumbnail) needs this since its own
          // `candidates` prop is a stale snapshot from the initial server
          // render that won't contain a freshly-searched/picked candidate.
          onUpdateMatch(platform, candidate.candidate_url, true, candidate, uncertain);
        } else {
          router.refresh();
        }
        setIsOpen(false);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const runSearch = async (e?: React.FormEvent, currentLimit: number = limit) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      handleSelect({ candidate_url: trimmed, platform, title: 'Custom URL' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/entities/${entityId}/search?platform=${platform}&query=${encodeURIComponent(trimmed)}&limit=${currentLimit}`);
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        setResults(data.candidates);
      }
      setSearched(true);
      if (currentLimit !== limit) setLimit(currentLimit);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadMore = () => {
    const newLimit = limit + 10;
    setLimit(newLimit);
    runSearch(undefined, newLimit);
  };

  return (
    <div style={{ marginTop: '10px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--text-secondary)', 
          cursor: 'pointer', 
          fontSize: '0.85em', 
          textDecoration: 'underline',
          transition: 'color 0.2s ease'
        }}
        onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
      >
        {isOpen ? 'Close' : isNoMatch ? 'See search results' : 'Not Right?'}
      </button>

      {isOpen && (
        <div style={{ marginTop: '10px', background: 'var(--surface-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '14px', color: 'var(--text-primary)' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9em', fontWeight: 600 }}>Select better match:</h4>

          <form onSubmit={(e) => runSearch(e)} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste URL or search..."
              style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', backgroundColor: 'var(--input-bg)', outline: 'none' }}
            />
            <button type="submit" disabled={loading} style={{ padding: '8px 12px', cursor: 'pointer', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
              {loading ? '...' : <IconSearch size={18} />}
            </button>
          </form>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: '12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={uncertain} onChange={(e) => setUncertain(e.target.checked)} />
            This isn&apos;t right, but it&apos;s the closest available
          </label>

          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
            {results.length === 0 && (
              <p style={{ fontSize: '0.85em', color: '#666' }}>
                {searched ? 'No matches found.' : 'No candidates yet — try searching above.'}
              </p>
            )}

            {results.filter(c => !(typeof c.source === 'string' && c.source.endsWith('_fallback'))).map((c: any) => (
              <MatchCard
                key={c.id || c.candidate_url}
                candidate={c}
                isSelected={c.candidate_url === currentUrl}
                onSelect={handleSelect}
              />
            ))}

            {results.length > 0 && (
              <button
                onClick={loadMore}
                disabled={loading}
                style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}
              >
                {loading ? 'Loading...' : 'Load More Results'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
