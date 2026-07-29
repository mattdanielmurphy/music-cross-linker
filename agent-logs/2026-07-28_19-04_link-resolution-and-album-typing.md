## Goal
Address user issues regarding generic search links, missing original input link usage, and incorrect song vs. album typing.

## User Feedback & Decisions
- Direct deep links should be used instead of fallback search URLs wherever possible.
- When an Apple Music or Spotify link is passed in, the original link must be used directly for its platform button.
- Album links (such as `/album/.../268633375?i=268633390`) should check for `?i=` track parameters to accurately determine if it's a song vs. an album.

## Changes Made
- Created `app/lib/urlResolver.ts` to perform iTunes lookups for direct Apple Music track/album URLs and pass through `src` if provided.
- Updated `app/[...url]/page.tsx` to extract track ID (`?i=`) vs album ID and detect media `type` (`album` vs `track`).
- Updated `app/[artist]/[track]/page.tsx` to consume `type` and `src`, rendering badge "Album Link" or "Track Link" and direct button hrefs.

## What Worked
- `bun run build` built without TypeScript or Turbopack errors.
- Disambiguation of album vs. track URLs now correctly sets appropriate badges and labels.
