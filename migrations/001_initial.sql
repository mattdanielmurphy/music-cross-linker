-- Canonical entity a link resolves to (dedupes multiple Apple Music URLs to same song)
create table if not exists resolved_entities (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_platform text not null check (source_platform in ('apple_music','spotify','youtube')),
  title text,
  artist text,
  album text,
  fingerprint text generated always as (lower(regexp_replace(coalesce(artist,'')||'|'||coalesce(title,''), '[^a-z0-9|]', '', 'g'))) stored,
  created_at timestamptz default now()
);
create index if not exists resolved_entities_fingerprint_idx on resolved_entities (fingerprint);

-- Auto-generated candidates per platform (from scrape/iTunes/search), always kept for audit + re-picking
create table if not exists match_candidates (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references resolved_entities(id) on delete cascade,
  platform text not null check (platform in ('spotify','apple_music','youtube')),
  candidate_url text not null,
  title text,
  artist text,
  thumbnail_url text,
  confidence numeric,       -- heuristic score from your matcher
  rank int,                 -- position returned by search
  source text not null,     -- 'itunes_api' | 'spotify_scrape' | 'youtube_search'
  created_at timestamptz default now()
);

-- The authoritative match actually served on the shared link
create table if not exists entity_matches (
  entity_id uuid not null references resolved_entities(id) on delete cascade,
  platform text not null check (platform in ('spotify','apple_music','youtube')),
  matched_url text not null,
  matched_by text not null check (matched_by in ('auto','manual')),
  candidate_id uuid references match_candidates(id),  -- null if manually pasted a custom url
  verified_by text,          -- your user id/handle, for "matched by X" display
  verified_at timestamptz,
  updated_at timestamptz default now(),
  primary key (entity_id, platform)
);
