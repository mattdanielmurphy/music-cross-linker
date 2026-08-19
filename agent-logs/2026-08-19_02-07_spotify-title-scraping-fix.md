# Spotify Title Scraping & Metadata Parsing Fix

## Problem
When resolving external links (such as Apple Music links like `https://music.apple.com/ca/album/belladonna/1844719636`), Spotify cross-matching or scraping stored the unparsed OpenGraph/page `<title>` (e.g. `Belladonna - Album by Daniel Lanois | Spotify`) directly as the candidate title in `match_candidates`. This contaminated `ctx.canonicalTitle` and resulted in the page displaying `Belladonna - Album by Daniel Lanois | Spotify` as the main title header and share title rather than `Belladonna` (artist `Daniel Lanois`).

## Root Cause
1. `fetchSpotifyMetadata` extracted raw `og:title` without parsing out Spotify's `- Album by <Artist> | Spotify`, `- song and lyrics by <Artist> | Spotify`, `- Single by ...`, `- EP by ...`, or `- Compilation by ...` formats.
2. JSON-LD structured data (`@type: MusicAlbum` or `MusicRecording`) on Spotify pages was ignored in favor of the raw title tag.
3. `canonicalTitle` retrieval in `resolveEntity` did not sanitize candidate titles before promoting them to `ctx.canonicalTitle`.
4. `fetchOdesliByUrl` lacked a direct Spotify scraper fallback for instantaneous first-touch resolution of direct Spotify links.
5. Existing database rows in `match_candidates` held uncleaned strings from prior scrapes.

## Changes Made
1. **Spotify Title Parser (`app/lib/youtube/titleParser.ts`)**:
   - Implemented `parseSpotifyTitle(raw)` to cleanly extract `title`, `artist`, and entity `type` (`album`, `single`, `ep`, `compilation`, `track`).
   - Integrated `parseSpotifyTitle` into `cleanYouTubeTitle`, `parseYouTubeTitle`, and `parseMusicTitle` so any platform noise (`| Spotify`, `- Album by ...`, etc.) is cleaned across all render paths.
2. **Metadata Scraper (`app/lib/urlResolver.ts`)**:
   - Updated `fetchSpotifyMetadata` to use a bot User-Agent (`facebookexternalhit/1.1`) to ensure full SSR OpenGraph and JSON-LD payloads.
   - Added JSON-LD schema parsing (`data.name`, `data.byArtist`) with fallback to `parseSpotifyTitle` and `cleanYouTubeTitle`.
   - Sanitized candidate title/artist before inserting into `match_candidates` in `resolveSpotifyPlatform`.
   - Sanitized `canonicalTitle` and `canonicalArtist` in `resolveEntity`.
   - Updated candidate query sorting to `ORDER BY confidence DESC NULLS LAST, rank ASC`.
3. **Odesli Direct Spotify Fallback (`app/lib/odesli.ts`)**:
   - Added direct Spotify metadata extraction in `fetchOdesliByUrl` for instantaneous URL resolution when given Spotify URLs.
4. **UI Components (`PlatformButton.tsx`, `MatchCard.tsx`)**:
   - Replaced ad-hoc `.split(' - Album by ')` string slices with `cleanYouTubeTitle` to guarantee uniform display.
5. **Database Cleanup**:
   - Executed update migration on Postgres `match_candidates` table to strip legacy dirty titles from previous resolutions.
6. **Unit Tests (`app/lib/youtube/titleParser.test.ts`)**:
   - Added test suite for Spotify album, single, EP, compilation, and track title parsing (all 23 tests passing).
