export default function Home() {
  return (
    <main className="main-content">
      <div className="track-card">
        <header className="track-header">
          <h1 className="track-title accent-text">Music Cross Linker</h1>
          <p className="track-artist">Convert and share music links seamlessly.</p>
        </header>
        <form className="search-form">
          <div className="input-group">
            <input 
              type="text" 
              placeholder="Paste URL..." 
              className="input-field"
              required 
            />
          </div>
          <button type="submit" className="btn-submit">Find Music</button>
        </form>
      </div>
    </main>
  );
}
