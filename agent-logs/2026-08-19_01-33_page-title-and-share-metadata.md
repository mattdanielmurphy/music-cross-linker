# Page Title & Share Metadata Formatting

**Date:** 2026-08-19 01:33  
**Author:** Antigravity / Pair Programming Agent

## Summary
Implemented dynamic metadata generation (`generateMetadata`) for `app/[...url]/page.tsx` and updated `app/layout.tsx` metadata to ensure page titles and share cards (OpenGraph and Twitter) follow the format:
- `Artist - Album/Track | Multilink` (e.g. `Daniel Lanois - Belladonna | Multilink`, `Daft Punk - Alive 2007 | Multilink`)
- `Album/Track | Multilink` when artist is omitted or unknown
- `Multilink - Universal Music Links` for the root/home page and fallback states

## Key Changes
1. **`app/lib/youtube/titleParser.ts`**:
   - Added `buildPageTitle(artist, track)` and `buildPageDescription(artist, track)` for consistent formatting across metadata generators.
   - Added `formatSlug`, `extractYear`, `cleanSegment`, and `parseMusicTitle` utilities.
2. **`app/[...url]/page.tsx`**:
   - Exported `generateMetadata({ params, searchParams })` resolving titles dynamically from stored slug records (`slugStore.ts`), route segment decomposition (`/album/artist/track`, `/artist/track`, `/[track]`), or title string parsing.
   - Configured absolute `<title>`, `description`, `openGraph` (title, description, siteName: "Multilink"), and `twitter` (card: "summary", title, description).
3. **`app/layout.tsx`**:
   - Configured default title and title template (`%s | Multilink`) and Multilink site metadata.
4. **`app/lib/slugStore.ts`**:
   - Added `findRecordByTargetUrlOrVideo` helper to look up metadata for external URL routes before client redirection.
5. **`app/lib/youtube/titleParser.test.ts`**:
   - Added unit test suite covering title generation, noise stripping, slug formatting, and music title parsing. All 18 tests passing.
