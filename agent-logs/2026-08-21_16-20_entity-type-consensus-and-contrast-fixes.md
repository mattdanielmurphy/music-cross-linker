# Entity Type Consensus, Dark Baseline Theme, and Text Contrast Fixes

**Date**: 2026-08-21 16:20  
**Context**: Fixing issues where multi-platform album matches defaulted to track mode, initial loads rendered stark white backgrounds, and artist typography rendered white-on-white.

## Root Cause
1. **Entity Type Resolution**: Initial URL slug resolution guessed `type=track`. When Apple Music (via iTunes API) and Spotify (via `spotapi-service`) streaming resolvers returned high-confidence album matches, the entity type stayed stuck in track mode because client and server components did not reconcile matches dynamically.
2. **White Background on Light Mode / Uninitialized Theme**: `globals.css` contained a `@media (prefers-color-scheme: light)` block setting `:root { --bg-color: #ffffff; }`. When `initialPalette` was null (or before client palette loaded), the background fell back to pure white.
3. **White-on-White Typography**: `.track-artist` had a hardcoded light text fallback (`rgba(255, 255, 255, 0.88)`), causing near-invisible text on light/white backgrounds.

## Solution & Architecture
1. **Dark Baseline Design System**:
   - Updated `globals.css` so `:root` and light-mode media queries retain a sleek dark media player background (`#08090a`), eliminating pure-white flashes entirely.
   - Updated `.track-artist` and `.track-title` typography to use dynamic variables (`var(--c-text-artist, ...)` and `var(--c-text-title, ...)`) with shadow fallbacks.
2. **Entity Type Consensus**:
   - Added `MediaType` (`'track' | 'album'`) and `reconcileEntityType` consensus logic in `app/lib/urlResolver.ts`.
   - Updated `resolveApplePlatform` and `resolveSpotifyPlatform` to extract and return `entityType`, `artworkUrl`, and title/artist metadata.
   - Enhanced `resolveBestMediaMetadata` with instant inline iTunes lookup fallback to ensure 1200px artwork and palette extraction on SSR even before candidate rows exist in the DB.
3. **Dynamic Theme & Type Reconciliation Provider**:
   - Updated `DynamicThemeProvider.tsx` to accept `initialType`, default fallback CSS variables, and provide `reportPlatformMatch`.
   - `DynamicThemeProvider` monitors incoming platform matches from `PlatformButton` / streaming sections, automatically reconciles `reconciledType` to `'album'` when matches agree, and triggers color extraction from high-resolution album artwork.
   - Updated `TypeBadge.tsx` to read `reconciledType` dynamically while preserving explicit URL query parameter overrides (`?type=...`).

## Verification
- Validated TypeScript types and Next.js Turbopack compilation via `bun run build` (0 errors, all routes built cleanly).
