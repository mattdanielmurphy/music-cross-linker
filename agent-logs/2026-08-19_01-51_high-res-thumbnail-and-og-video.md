# High-Resolution Artwork & OpenGraph Video Preview

**Date:** 2026-08-19 01:51  
**Author:** Antigravity / Pair Programming Agent

## Summary
Enhanced `generateMetadata` in `app/[...url]/page.tsx` with dynamic resolution of the highest-resolution available artwork and OpenGraph video tags (`og:video`) for rich link previews in Apple Messages, Twitter/X, Discord, and Slack:
- Prioritizes Apple Music 1200x1200bb square artwork for high-confidence matches.
- Falls back to Spotify 640x640 CDN artwork or YouTube 1280x720 (`maxresdefault.jpg`) thumbnails.
- Emits `openGraph.videos` with YouTube embed URL and dimensions for inline video player compatibility where supported.

## Key Changes
1. **`app/lib/urlResolver.ts`**:
   - Added `resolveBestMediaMetadata(artist, title, explicitVideoId, sourceUrl)` to query authoritative and high-confidence candidate thumbnails, upscaling Apple Music artwork to 1200x1200 and YouTube thumbnails to `maxresdefault.jpg`.
2. **`app/[...url]/page.tsx`**:
   - Hooked `resolveBestMediaMetadata` into `generateMetadata` to populate `openGraph.images`, `openGraph.videos`, and `twitter.images`.
3. **`app/lib/youtube/titleParser.ts`**:
   - Added `extractVideoId` helper with full test coverage in `titleParser.test.ts`.
