export default function Home() {
  return (
    <main className="glass">
      <h1>Find Your Music</h1>
      <form>
        <input type="text" placeholder="Search for a song..." required />
        <button type="submit" className="btn btn-submit">Search</button>
      </form>
    </main>
  );
}
