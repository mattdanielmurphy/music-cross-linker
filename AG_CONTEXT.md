# AG Context

# 🛑🛑🛑 READ THIS FIRST — NON-NEGOTIABLE 🛑🛑🛑
# =============================================
# THE SPOTIFY WEB API (api.spotify.com, /v1/search, client credentials, etc.)
# IS A PAID/PREMIUM-GATED FEATURE. IT IS NOT FREE. WE WILL NOT USE IT.
# DO NOT propose it. DO NOT write code that calls it. DO NOT scrape
# DuckDuckGo or Google for open.spotify.com links either — that's a legacy
# hack we've already replaced.
#
# THE REAL, CURRENT SOLUTION IS `spotapi-service` (spotapi-service/main.py),
# a FastAPI service running on the VPS, reached via `SPOTAPI_URL` from
# `app/lib/urlResolver.ts` (`searchSpotifyViaSpotapi`). It uses the `spotapi`
# Python package to query Spotify's internal/public web client GraphQL
# endpoints for free, no API key, no Premium account required.
#
# If Spotify search isn't working, the fix is in `spotapi-service/main.py`
# and/or the `spotapi` package it depends on — NOT a pivot to the official
# Web API or to scraping search engines.
# =============================================

## What this app does

A URL shortener/redirector for music links (like Song.link / Odesli), but
self-hosted with our own matching logic. You give it a link to a song/album
on YouTube, Spotify, or Apple Music, and it finds the equivalent link on the
other platforms and serves a page with all three ("Track View") at a stable
short URL like `/daniel-lanois/belladonna`.

Two very different flows hit the same catch-all route, `app/[...url]/page.tsx`:

1. **Unrecognized external link** (e.g. someone pastes
   `/https://www.youtube.com/watch?v=XXXX` or `/https://open.spotify.com/track/XXXX`
   after the domain). This is slow to resolve (Odesli + oEmbed lookups), so
   the page renders an instant spinner (`ResolvingRedirect.tsx`) and does the
   resolution via `POST /api/resolve-link`, then client-side redirects to the
   canonical slug once known.
2. **Known slug** (e.g. `/daniel-lanois/belladonna`, looked up in
   `app/lib/slugStore.ts`'s `tmp/slugs.json`, or a raw `/artist/title` /
   `/title` guess). Renders `TrackView.tsx` which streams in each platform's
   match via `Suspense` — the page shell (title, YouTube embed) appears
   first, Spotify/Apple Music buttons stream in as their searches resolve.

## Core resolution pipeline (`app/lib/urlResolver.ts`)

Everything funnels through:

```
resolveEntity(artist, title, country, sourceUrl) → EntityContext
  ├─ resolveApplePlatform(ctx, sourceUrl)   → PlatformResult
  ├─ resolveSpotifyPlatform(ctx, sourceUrl) → PlatformResult
  └─ resolveYoutubePlatform(ctx, sourceUrl) → PlatformResult
```

- **`resolveEntity`**: finds-or-creates a row in `resolved_entities` (the
  canonical "this is the same song/album across platforms" record), either by
  exact `candidate_url` match or by a normalized `artist|title` fingerprint.
  Also loads any already-known matches per platform from `entity_matches`
  into `ctx.cached`, and guesses `isAlbum` — but **only from the source URL
  shape** (`/album/`, `entity=album`, `list=`). This guess is unreliable for
  e.g. YouTube "full album" videos (see Spotify section below) — resolvers
  are expected to be robust to it being wrong.
- Each `resolvePlatform` function follows the same priority order:
  1. If the *source URL itself* is that platform → fetch its real metadata
     directly (e.g. Apple Music via iTunes lookup, Spotify via oEmbed/HTML
     scrape of the given URL, YouTube via oEmbed) and treat it as `explicit`.
  2. Else if `ctx.cached` already has a saved match for that platform → reuse
     it (no network call).
  3. Else, search fresh (see per-platform sections below), save all
     candidates to `match_candidates` for the "Not Right?" picker, and if one
     is confident enough, save it as the auto match in `entity_matches`.
- **Confidence tiers** (`classifyMatch` here and mirrored in
  `spotapi-service/main.py`'s `_classify_match`): `'high'` (exact title +
  matching/unknown artist), `'low'` (plausible but uncertain — shown with a
  ⚠️ warning), `'none'` (never shown).

## Spotify search — `spotapi-service`

**Endpoint config:** `SPOTAPI_URL` env var (currently
`https://vps.mattmurphy.ca`, reaching the VPS FastAPI service via Caddy reverse proxy).

**Service:** `spotapi-service/main.py`, using the `spotapi` PyPI package
(unofficial client for Spotify's own web-player GraphQL API — no API key, no
OAuth, no Premium account).

Endpoints:
- `GET /api/spotify/search-track?q=<query>&title=<title>&artist=<artist>`
  — searches Spotify tracks only, **never returns an album**.
- `GET /api/spotify/search-album?q=<query>&title=<title>&artist=<artist>`
  — searches Spotify albums only, **never returns a track**.
- `GET /api/spotify/health` — liveness check.

Both search endpoints return `{"url": "https://open.spotify.com/<track|album>/<id>", "confidence": "high"|"low"}`
or `{"url": null}` if nothing plausible was found. Matching logic
(`_classify_match` in `main.py`) is a Python port of `classifyMatch` in
`urlResolver.ts` — keep them in sync if you tune one.

**Caller:** `searchSpotifyViaSpotapi()` in `app/lib/urlResolver.ts`. Because
`search-track`/`search-album` are strictly typed and `ctx.isAlbum` is only a
guess, the caller tries the guessed entity type first and — if it doesn't
come back `'high'` confidence — automatically retries with the *other* entity
type before giving up. This matters a lot in practice: a single-word album
title like Yes's *Fragile* has no matching standalone single, so guessing
"track" and stopping there confidently returns a wrong track, when the album
search would've found it immediately. Don't remove this fallback without
understanding why it's there.

**If Spotify matching seems broken:** test the service directly first —
`curl "https://oracle-vps.tail491454.ts.net/api/spotify/search-album?q=Yes%20Fragile&title=Fragile&artist=Yes"`
(swap in `search-track`) — before touching any Node code, to isolate whether
the bug is in `spotapi`/the service, or in how `urlResolver.ts` calls it.

⚠️ **Known tech debt, NOT an exception to the ban above:**
`app/api/entities/[id]/search/route.ts` (the manual re-search box in the
"Not Right?" popup) still scrapes `html.duckduckgo.com` for
`site:open.spotify.com` results instead of calling `spotapi-service`. This is
leftover from before `spotapi-service` existed and is why manual Spotify
search results often show `artist: "spotify"` (DuckDuckGo/oEmbed give a
track title but no reliable artist field). This should be migrated to hit
`spotapi-service`'s search endpoints too — do that rather than leaving the
scrape in place or reintroducing the official Web API to fix it.

## YouTube search

No API key involved anywhere — two different techniques depending on context:

- **`app/lib/youtube.ts` (`getTopVideos`)**: used by `YouTubeSection.tsx` when
  there's no explicit/cached video ID. Scrapes
  `https://www.youtube.com/results?search_query=...` HTML directly (regex over
  the embedded `videoRenderer` JSON blocks — no headless browser). Query is
  `"<artist> <title> full album"` for albums, `"<artist> <title> official audio"`
  for tracks.
- **`resolveYoutubePlatform` in `urlResolver.ts`**: used when populating the
  YouTube entry in `match_candidates`/`entity_matches` (i.e. building the
  cross-link list, not the embed itself). Uses DuckDuckGo's `!ducky`
  bang (`https://duckduckgo.com/?q=!ducky site:youtube.com <query>`), which
  redirects straight to the first result — parses the redirect's `uddg=`
  param out of the HTML rather than fetching DDG's search results page. Then
  validates the result via YouTube's oEmbed endpoint
  (`https://www.youtube.com/oembed?url=...&format=json`) for a title/thumbnail
  and to run `classifyMatch` against it.
- **oEmbed** (`https://www.youtube.com/oembed?url=...&format=json`) is used in
  several places just to get a video's title/author/thumbnail cheaply without
  scraping — no key required, it's a public YouTube endpoint.

Explicit YouTube links (i.e. the source URL is a youtube.com/youtu.be URL with
a video ID) skip all search entirely — see `YouTubeSection.tsx`, which
short-circuits to render the iframe immediately using `explicitVideoId`. This
is the one thing we always know for certain; never make it wait on a search.

## Apple Music search

Plain iTunes Search/Lookup API (`itunes.apple.com/search`,
`itunes.apple.com/lookup`) — public, free, no key needed. Used both for
explicit Apple Music source URLs (extract the numeric ID from the path, hit
`/lookup?id=...&country=...`) and for fresh search
(`/search?term=...&media=music&entity=song,album&country=...`).

## Database

Postgres, via `app/lib/db.ts` (`postgres` package), `DATABASE_URL` env var.
Schema in `migrations/`:

- **`resolved_entities`**: one row per canonical song/album we've ever seen.
  Has a generated `fingerprint` column (`lower(artist|title)`, punctuation
  stripped) used for dedup — **do not rely on querying this generated column
  directly**, its original definition had a case-order bug (see
  `003_fix_fingerprint_column.sql`) and even after the fix, `resolveEntity()`
  in `urlResolver.ts` deliberately recomputes the fingerprint inline in SQL
  rather than trusting the stored column, because we don't have `ALTER`
  privileges on this table in prod to guarantee it's not stale.
- **`match_candidates`**: every candidate URL we've ever found per platform
  per entity (kept for the "Not Right?" picker / audit trail), with
  `confidence`, `rank`, and `source` (`'explicit'`, `'itunes_api'`,
  `'spotapi'`, `'youtube_ducky'`, `'manual_search'`, `'*_fallback'`, etc).
- **`entity_matches`**: the one authoritative match actually served per
  `(entity_id, platform)`, `matched_by` = `'auto'` or `'manual'`. Manual picks
  (via the "Not Right?" UI, `app/api/entities/[id]/match/route.ts`) always
  win over auto matches and are never overwritten by a fresh auto-resolve.

## Slug store

`app/lib/slugStore.ts` — a flat JSON file at `tmp/slugs.json` (NOT the
Postgres DB) mapping short slugs (`artist-slug/title-slug`) to the original
resolved `{ targetUrl, artistName, title, videoId }`. This is what makes
`/daniel-lanois/belladonna`-style short links resolve without redoing the
Odesli/oEmbed lookup every time. Separate concern from `resolved_entities` —
this is purely slug ↔ display-metadata, not platform matching state.

## Song links

Songs are always `/artist/album/track` (rule and slug format in `AGENTS.md` and
`app/lib/slugify.ts`). Those pages are forced to `typeHint: 'track'`: iTunes
`entity=song` and Spotify `search-track` only, in a separate entity whose
`resolved_entities.source_url` is `track:<artist>/<album>/<track>`. Apple song
URLs must keep `?i=<id>`; use `isAlbumUrl()`, never a bare `/album/` check.

## Key files map

- `app/[...url]/page.tsx` — catch-all router: external link vs. known slug.
- `app/components/ResolvingRedirect.tsx` — instant spinner + client-side
  redirect for not-yet-seen external links.
- `app/api/resolve-link/route.ts` — does the slow Odesli/oEmbed work for the
  above, off the initial render.
- `app/components/track-view/TrackView.tsx` — the actual track page shell;
  streams `YouTubeSection`/`SpotifySection`/`AppleSection` via `Suspense`.
- `app/lib/urlResolver.ts` — all cross-platform matching logic (see above).
- `app/lib/odesli.ts` — Odesli/Songlink API wrapper, used only for the
  first-touch "what even is this link" identification, not ongoing matching.
- `app/api/entities/[id]/match/route.ts` — saves a manual "Not Right?" pick.
- `app/api/entities/[id]/search/route.ts` — powers the manual re-search box
  in the "Not Right?" popup.
- `spotapi-service/main.py` — the VPS-hosted Spotify search service (see
  above). Lives in this repo but deploys separately to the VPS.
