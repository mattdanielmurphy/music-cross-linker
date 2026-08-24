# 🎵 Music Cross Linker

<div align="center">

**Self-hosted, 100% free music link aggregator and redirector.**  
Transform any YouTube, Spotify, or Apple Music link into a universal, dynamically-themed shareable landing page with zero paid API keys.

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-fbf0df?style=flat-square&logo=bun)](https://bun.sh/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Spotify_Service-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)

[Features](#-key-features) • [Architecture](#-architecture--resolution-pipeline) • [Getting Started](#-getting-started) • [API Reference](#-api-reference) • [Database Schema](#-database--storage)

</div>

---

## 📖 Overview

Sharing music links across different platforms is notoriously frustrating. A friend on Apple Music cannot easily open a Spotify URL, and YouTube links lack one-tap integration with streaming libraries. Existing tools like Songlink / Odesli solve this, but rely on paid API tiers or rate-limited third-party services.

**Music Cross Linker** is a high-performance, self-hosted alternative that resolves track and album cross-links across **YouTube**, **Spotify**, and **Apple Music** completely free, without any paid developer accounts or official Spotify Web API keys.

### 🌟 Key Highlights

- **100% Free & Keyless**: Solves cross-platform matching without commercial Spotify Web API keys or paid quotas.
- **Instant Streaming SSR**: Powered by React 19 Server Components and `<Suspense>`. Page shells and YouTube players render immediately while Spotify and Apple Music matches stream in concurrently.
- **Adaptive Album Art Theming**: Extracts dominant colors and vibrant accents directly from album artwork using a custom, pure-JavaScript color engine (zero native binary dependencies for serverless resilience).
- **Consensus & Confidence Scoring**: Distinguishes between tracks and albums automatically with multi-platform consensus promotion and confidence indicators.
- **Community-Correction UI**: Built-in "Not Right?" candidate picker allows users to search and lock in correct platform matches permanently in PostgreSQL.
- **Privacy-Enhanced Embeds**: YouTube embeds run through `youtube-nocookie.com` with tracking protection and minimal distractions.
- **Rich Social Previews**: Generates dynamic OpenGraph and Twitter cards with high-resolution artwork (up to 1200×1200) and embedded video players for iMessage, Discord, Slack, and social feeds.

---

## 🚀 Architecture & Resolution Pipeline

```
                              User Request
          (/artist/title  OR  /https://open.spotify.com/...)
                                   │
                                   ▼
                       Next.js App Router Catch-All
                         app/[...url]/page.tsx
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
        [External Raw URL]                      [Known Slug / Route]
    ResolvingRedirect (instant)                 TrackView (SSR Shell)
                │                                     │
      POST /api/resolve-link              ┌───────────┼───────────┐
     (Odesli + oEmbed lookup)             ▼           ▼           ▼
                │                    YouTube       Spotify    Apple Music
                ▼                    Section       Section      Section
        Client redirect to              │             │            │
       canonical short slug             ▼             ▼            ▼
                             (Privacy Embed)   (spotapi-service) (iTunes API)
                                        \             |           /
                                         ▼            ▼          ▼
                                        PostgreSQL (resolved_entities)
                                        Dynamic Theme Engine (palette.ts)
```

### Resolution Strategy

1. **Explicit Identification**: If an incoming link is already a recognized platform URL, its metadata is parsed directly (iTunes lookup for Apple Music, oEmbed for YouTube, page scrapers for Spotify).
2. **Database Cache**: If the song or album was previously resolved, cached platform matches from `entity_matches` are reused instantly with zero network overhead.
3. **Multi-Source Matching**:
   - **Spotify**: Queried through our dedicated `spotapi-service` (Python FastAPI service interacting with Spotify's internal GraphQL endpoints). Never queries the paid official Spotify Web API.
   - **Apple Music**: Queried via the public, unauthenticated iTunes Search & Lookup API (`itunes.apple.com/search`).
   - **YouTube**: Resolved using DuckDuckGo `!ducky` bang lookups, title normalization, and YouTube oEmbed validation.
4. **Consensus Promotion**: If an item is initially guessed as a track, but multiple platforms return matching full albums, the entity is automatically promoted to an album.

---

## 🎨 Dynamic Art Palette & Theming Engine

The theming engine (`app/lib/palette.ts`) dynamically skins each song and album page to reflect its artwork:

- **Zero-Native Pure JS Decoders**: Built with `jpeg-js` and `pngjs` instead of native binaries like `sharp`, preventing serverless `dlopen` crashes on Vercel and AWS Lambda.
- **Letterbox & Pillarbox Border Detection**: Analyzes edge pixels to strip away black/neutral filler bars on 16:9 thumbnails before color sampling.
- **Gross Color Rejection**: Filters out murky olive tones, mud browns, and sludge hues (e.g. Pantone 448 C) in favor of rich, pleasant colors.
- **Dual-Hue Extraction**: Selects a balanced base ambient color and an accent hue, enforcing WCAG/APCA contrast ratios for crystal-clear typography.

---

## 📁 Repository Structure

```
music-cross-linker/
├── app/
│   ├── [...url]/             # Dynamic catch-all router for slugs & external URLs
│   ├── api/
│   │   ├── entities/         # Candidate search & manual match overrides
│   │   ├── palette/          # On-the-fly artwork palette extraction endpoint
│   │   ├── resolve-link/     # Initial Odesli/oEmbed resolution worker
│   │   ├── search-youtube/   # Search autocomplete for YouTube tracks
│   │   └── theme-config/     # Dynamic theme lock-in & configuration
│   ├── components/
│   │   ├── track-view/       # TrackView, YouTubeSection, SpotifySection, AppleSection,
│   │   │                     # PlatformButton, CandidateList, DynamicThemeProvider
│   │   ├── ResolvingRedirect.tsx # Instant spinner for raw external URLs
│   │   └── LinkButtons.tsx   # Platform button container
│   ├── lib/
│   │   ├── db.ts             # PostgreSQL client connection (postgres.js)
│   │   ├── palette.ts        # Pure JS color extraction, contrast, & gradient engine
│   │   ├── slugStore.ts      # Fast JSON slug-to-track lookup store
│   │   ├── urlResolver.ts    # Core multi-platform resolution pipeline
│   │   └── youtube/          # YouTube title parser, regex cleaner, & metadata
│   ├── globals.css           # Vanilla CSS design system (glassmorphism & tokens)
│   ├── layout.tsx            # Root layout & responsive viewport
│   └── page.tsx              # Home landing page with live search
├── migrations/               # PostgreSQL schema migrations (001 - 005)
├── spotapi-service/          # Standalone FastAPI Spotify search microservice
│   └── main.py               # Spotify GraphQL web-client interface (via spotapi)
├── AG_CONTEXT.md             # Durable engineering notes & operational rules
├── package.json              # Next.js 16 dependencies & scripts
└── tsconfig.json             # TypeScript configuration
```

---

## 🛠️ Getting Started

### Prerequisites

- **Bun** (recommended) or Node.js 20+
- **PostgreSQL** database (local or hosted, e.g. Neon, Supabase, Railway)
- **Python 3.10+** (if running the Spotify microservice locally)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/mattdanielmurphy/music-cross-linker.git
cd music-cross-linker

# Install frontend dependencies with Bun
bun install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# PostgreSQL connection string (required)
DATABASE_URL=postgresql://postgres:password@localhost:5432/music_cross_linker?sslmode=require

# Base URL of the spotapi-service (defaults to hosted VPS or local instance)
SPOTAPI_URL=http://127.0.0.1:8000
```

### 3. Run Database Migrations

Apply the migration SQL scripts in `/migrations` in sequential order:

```bash
psql $DATABASE_URL -f migrations/001_initial.sql
psql $DATABASE_URL -f migrations/002_allow_unknown_platform.sql
psql $DATABASE_URL -f migrations/003_fix_fingerprint_column.sql
psql $DATABASE_URL -f migrations/004_add_uncertain_manual_match.sql
psql $DATABASE_URL -f migrations/005_match_candidates_unique_idx.sql
```

### 4. (Optional) Run `spotapi-service` Locally

If you are running the Spotify resolver service locally:

```bash
cd spotapi-service
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn spotapi
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Start the Development Server

```bash
bun dev
```

Open [http://localhost:3011](http://localhost:3011) in your browser.

---

## 🔌 API Reference

### Internal API Routes

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/resolve-link` | `POST` | Resolves an unknown raw external URL into a canonical slug. |
| `/api/palette` | `GET` | Extracts color palette, contrast typography, and CSS gradients for an image URL. |
| `/api/search-youtube` | `GET` | Searches YouTube for top video candidates matching a text query. |
| `/api/entities/:id/search` | `GET` | Fetches fresh platform candidates for the "Not Right?" picker. |
| `/api/entities/:id/match` | `POST` | Saves a user's manual match override to PostgreSQL. |
| `/api/theme-config` | `GET / POST` | Reads and updates live theme customization tokens. |

### `spotapi-service` Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/spotify/search-track` | `GET` | Searches tracks strictly (returns Spotify track URL + confidence). |
| `/api/spotify/search-album` | `GET` | Searches albums strictly (never returns single tracks). |
| `/api/spotify/search-candidates`| `GET` | Fetches multi-candidate search results with titles, artists, and artwork. |
| `/api/spotify/health` | `GET` | Service liveness probe. |

---

## 🗄️ Database & Storage

### PostgreSQL Tables

- **`resolved_entities`**: Canonical registry of unique songs and albums, indexed by artist and title fingerprint.
- **`match_candidates`**: Audit trail and candidate pool for all discovered URLs per platform, confidence ratings, and source tags.
- **`entity_matches`**: The authoritative active link served for each platform. Manual user corrections (`matched_by = 'manual'`) take precedence and are protected from automatic overwrites.

### Slug Store (`tmp/slugs.json`)

High-speed mapping from clean URLs (`/artist-slug/title-slug`) to initial display metadata (`artistName`, `title`, `videoId`, `targetUrl`), ensuring instantaneous resolution without redundant initial API hits.

---

## 🛡️ Spotify Architecture Note

> [!IMPORTANT]
> **No Spotify Web API Keys Required**: The official Spotify Web API (`api.spotify.com`) is developer-gated and requires paid access. This project avoids paid API limits by utilizing `spotapi-service`, an open microservice interfacing directly with public GraphQL search endpoints. Do not replace this with official OAuth credentials or HTML scraping hacks.

---

## 📄 License

MIT © [Matthew Daniel Murphy](https://github.com/mattdanielmurphy)
