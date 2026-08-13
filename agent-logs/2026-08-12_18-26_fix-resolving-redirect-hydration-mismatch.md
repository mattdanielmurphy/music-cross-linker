# Fix ResolvingRedirect Hydration Mismatch

## Issue
React hydration mismatch console error in Next.js when rendering `app/components/ResolvingRedirect.tsx` line 64:
Server rendered legacy iframe attributes (such as `webkitallowfullscreen`, `mozallowfullscreen`, `msallowfullscreen`) that differed from client DOM property expectations during hydration.

## Solution
Added `suppressHydrationWarning={true}` to the YouTube `<iframe>` element in `app/components/ResolvingRedirect.tsx`, matching the existing pattern used in `app/components/track-view/YouTubeSection.tsx`.

## Verification
Ran `bun run build` successfully with zero TypeScript or compilation errors.
