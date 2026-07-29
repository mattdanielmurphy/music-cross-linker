export default function Home() {
  return (
    <main className="hero-container flex min-h-screen flex-col items-center justify-center">
      <div className="glass-card w-full max-w-md text-center">
        <h1 className="text-4xl font-bold mb-6">Music Cross Linker</h1>
        <form className="flex flex-col gap-4">
          <input 
            type="text" 
            placeholder="Paste artist or track name..." 
            className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="submit" className="btn-primary">Search Music</button>
        </form>
      </div>
    </main>
  );
}
