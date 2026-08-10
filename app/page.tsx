export default function Home() {
  return (
    <main className="main-content">
      <div className="glass track-card">
        <header className="track-header">
          <h1 className="track-title gradient-text">Music Cross Linker</h1>
          <p className="track-artist">Convert and share music links seamlessly across Apple Music, Spotify, and YouTube.</p>
        </header>
        <form className="search-form">
          <div className="input-group">
            <input 
              type="text" 
              placeholder="Paste URL or search artist/song..." 
              className="input-field"
              required 
            />
          </div>
          <button type="submit" className="btn btn-submit">Find Music</button>
        </form>
      </div>
    </main>
  );
}
