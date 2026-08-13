"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function Home() {
  const router = useRouter();

  const [mode, setMode] = useState<"search" | "fields">("search");
  const [urlOrSearch, setUrlOrSearch] = useState("");
  const [artist, setArtist] = useState("");
  const [albumOrTrack, setAlbumOrTrack] = useState("");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode === "fields") {
      if (artist.trim() && albumOrTrack.trim()) {
        router.push("/" + encodeURIComponent(artist.trim()) + "/" + encodeURIComponent(albumOrTrack.trim()));
      }
    } else {
      const trimmed = urlOrSearch.trim();
      if (trimmed) {
        router.push("/" + encodeURIComponent(trimmed));
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
        <div className="tab-container">
          <button 
            type="button" 
            className={`tab ${mode === 'search' ? 'active' : ''}`} 
            onClick={() => setMode('search')}
          >
            Paste Link / Search
          </button>
          <button 
            type="button" 
            className={`tab ${mode === 'fields' ? 'active' : ''}`} 
            onClick={() => setMode('fields')}
          >
            Manual Entry
          </button>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          {mode === "search" ? (
            <div className="input-group">
              <input 
                value={urlOrSearch}
                onChange={(e) => setUrlOrSearch(e.target.value)}
                type="text" 
                placeholder="Paste song or artist URL..." 
                className="input-field"
                required 
              />
            </div>
          ) : (
            <div className="manual-fields">
              <div className="input-group">
                <input 
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  type="text" 
                  placeholder="Artist" 
                  className="input-field"
                  required 
                />
              </div>
              <div className="input-group">
                <input 
                  value={albumOrTrack}
                  onChange={(e) => setAlbumOrTrack(e.target.value)}
                  type="text" 
                  placeholder="Track / Album" 
                  className="input-field"
                  required 
                />
              </div>
            </div>
          )}
          <button type="submit" className="btn-submit">Find Music</button>
        </form>

        
      </div>
    </main>
  );
}
