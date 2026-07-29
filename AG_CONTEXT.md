# AG Context

## Architecture & Resolver Logic
- **Apple Music Resolution**: Uses iTunes lookup API with fallback to `entity=song` lookup on parent album ID (`albumIdMatch`) when direct track ID lookup returns empty result sets.
- **Spotify Resolution**: Spotify restricted Web API access (`/v1/search`) to developer accounts with active Spotify Premium subscriptions. To resolve direct `https://open.spotify.com/track/{id}` or `https://open.spotify.com/album/{id}` links without API keys or Premium accounts, `app/lib/urlResolver.ts` uses server-side search lookup (`site:open.spotify.com/...`).
- **Fallback**: If server-side scraping fails, falls back gracefully to `https://open.spotify.com/search/...`.
- **Odesli Integration**: Integrated Odesli API (Songlink) for 100% accurate music entity resolution and cross-platform mapping.
