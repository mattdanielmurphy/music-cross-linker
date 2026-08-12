<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MANDATORY: Read AG_CONTEXT.md before doing ANY work in this repo

Before writing or proposing any code in this project, read `music-cross-linker/AG_CONTEXT.md` in full. It contains hard constraints (e.g. banned APIs/approaches) that are not obvious from the code alone and are NOT optional suggestions.

# 🛑 SPOTIFY: NEVER use the official Spotify Web API 🛑

The Spotify Web API (`api.spotify.com`, `/v1/search`, client-credentials OAuth, etc.) requires a paid/Premium-gated developer setup for the endpoints we'd need. **We will never use it in this project, full stop — do not suggest it, do not write code that calls it.** Also do not fall back to scraping DuckDuckGo/Google for `open.spotify.com` links — that was a legacy hack, already replaced.

Spotify search/lookup in this project goes through **`spotapi-service`** (a self-hosted FastAPI service on the VPS using the `spotapi` Python package — no API key, no Premium account, free). It's called from `searchSpotifyViaSpotapi()` in `app/lib/urlResolver.ts` via `SPOTAPI_URL`. If Spotify matching has a bug, fix it in `spotapi-service/main.py` / the `spotapi` package — never by pivoting to the official Web API.
