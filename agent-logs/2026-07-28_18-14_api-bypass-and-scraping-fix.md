## Goal
The user encountered a strict block from Spotify requiring a Premium account to even enable the Web API for developer applications (a change made in early 2026). The goal was to implement a completely free workaround for fetching track metadata from both Spotify and Apple Music URLs without needing API keys, developer accounts, or premium subscriptions.

## User Feedback & Decisions
- User was furious that they were blocked from checking the "Web API" box on Spotify's developer dashboard because they didn't have a premium account.
- Decision: Pivot away from using official authenticated APIs entirely to guarantee a 100% free, zero-config experience.

## Changes Made
- Rewrote the catch-all dynamic route `app/[...url]/page.tsx` via `flash_lite` subagents to:
  - **Spotify**: Fetch the public HTML of the track page and scrape the `<title>` tag which reliably contains `Artist - Track Name | Spotify`.
  - **Apple Music**: Extract the album ID from the URL, automatically detect the region code (e.g. `ca`, `us`), and pass it to the 100% free, unauthenticated iTunes Search API (`itunes.apple.com/lookup?id=...&country=...`).
  - **Destination UI**: Updated the destination `/artist/track` page to construct Spotify/Apple Music search URLs (`https://open.spotify.com/search/...`) instead of requiring the exact native track IDs. This works seamlessly and requires zero API calls to generate.
- Updated Next.js 15+ async `params` access syntax which was causing server crashes.

## What Worked
- The Spotify HTML title scrape works flawlessly for extracting artist and title.
- The iTunes album lookup (`entity=song` or just generic album ID lookup) with the explicit `country` code works perfectly to get metadata.
- All dependencies on Spotify Developer Dashboard and Client Credentials have been removed.

## What Didn't Work / Known Issues
- Initial attempts to scrape Apple Music failed because it is a Svelte-based SPA that injects the page title via client-side Javascript, meaning the raw HTML only contained a generic `<title>Apple Music - Web Player</title>`.
- Using `Odesli` (Songlink) API returned 400 Bad Request errors when trying to pass the full URL directly.

## Architecture Notes
- Next.js dynamic routing normalizes double slashes `//` to `/` in `params.url`, requiring reconstruction.
- Apple Music URLs often have the format `/ca/album/name/album_id?i=track_id`. The iTunes API lookup will fail for the `track_id` if the `country` parameter is not provided. Prioritizing the `album_id` is a much more robust way to get the artist/title metadata than trying to match the exact track ID.
