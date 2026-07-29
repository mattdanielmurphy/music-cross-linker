export default function Page() {
  return (
    <main className="container" style={{ marginTop: '4rem' }}>
      <div className="glass" style={{ textAlign: 'center', padding: '4rem' }}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '3rem' }}>Music Cross Linker</h1>
        <form action="/[artist]/[track]" method="GET" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px', margin: '0 auto' }}>
          <input type="text" name="a" placeholder="Artist" required style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'white' }} />
          <input type="text" name="t" placeholder="Track" required style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'white' }} />
          <button type="submit" style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer' }}>Search Links</button>
        </form>
      </div>
    </main>
  );
}
