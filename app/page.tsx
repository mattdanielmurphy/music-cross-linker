"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { YouTubeVideoCandidate } from "./lib/youtube";

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<YouTubeVideoCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const isUrl = (s: string) =>
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    /youtube\.com|spotify\.com|apple\.com|youtu\.be/i.test(s);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    if (isUrl(trimmed)) {
      router.push("/" + encodeURIComponent(trimmed));
    } else {
      setLoading(true);
      setResults(null);
      try {
        const res = await fetch(`/api/search-youtube?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <main className="main-content">
      <div className="track-card">
        <header className="track-header">
          <h1 className="track-title accent-text">Music Cross Linker</h1>
          <p className="track-artist">Convert and share music links seamlessly.</p>
        </header>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="text"
              placeholder="Paste song URL or search for a song..."
              className="input-field"
              required
            />
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "Searching..." : "Find"}
          </button>
        </form>

        {loading && <div className="search-loading">Searching YouTube...</div>}

        {results && (
          <div className="search-results-grid">
            {results.map((video) => (
              <div
                key={video.id}
                className="video-card"
                onClick={() => router.push(`/https://www.youtube.com/watch?v=${video.id}`)}
              >
                {video.thumbnail && (
                  <img src={video.thumbnail} alt={video.title} className="video-thumbnail" />
                )}
                <div className="video-info">
                  <div className="video-title">{video.title}</div>
                  {video.channel && <div className="video-channel">{video.channel}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
