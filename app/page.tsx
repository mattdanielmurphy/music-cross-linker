"use client";

import { useRouter } from "next/navigation";
import { FormEvent } from "react";

export default function Home() {
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const value = formData.get("search") as string;
    const trimmed = value?.trim();
    if (trimmed) {
      router.push("/" + encodeURIComponent(trimmed));
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
              name="search"
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
