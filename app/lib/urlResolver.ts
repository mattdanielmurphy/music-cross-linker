import sql from './db';
import * as cheerio from 'cheerio';
import { cleanYouTubeTitle, parseYouTubeTitle, parseSpotifyTitle } from './youtube/titleParser';
import { getTopVideos } from './youtube';
import { cleanAppleUrl, coreTitle, coreTitleSlug, isAlternateVersion, isAlbumUrl, slugify, NO_ALBUM_SLUG } from './slugify';

// ---------------------------------------------------------------------------
// Shared match confidence classification.
//
// We never want to confidently show a match that's clearly wrong (e.g. Queen's
// "We Will Rock You" for Tiny Tim's album "Rock"), but a same-artist / close
// title match is still useful even if it's not exact — it should just be
// flagged as possibly wrong rather than hidden or shown as gospel.
//
// 'high' = title matches exactly (normalized) and artist matches (or no
//          artist was given to check against)
// 'low'  = plausible but not exact (different edition, unconfirmed artist,
//          same artist but different title, etc.) — show it, flag it
// 'none' = no meaningful relationship — never show
// ---------------------------------------------------------------------------

type Confidence = 'high' | 'low' | 'none';
export type Platform = 'apple_music' | 'spotify' | 'youtube';

function normalizeForMatch(s: string | null | undefined): string {
  if (!s) return '';
  return coreTitle(s)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ') // strip parenthetical/bracketed content
    .replace(/(?<=\d)\s*[\-–—]\s*(?=\d)/g, '-') // preserve hyphenated number ranges e.g. 85-92
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/i, '');
}

/** Mirrors the Postgres generated `fingerprint` column on resolved_entities:
 *  lower(regexp_replace(artist||'|'||title, '[^a-z0-9|]', '', 'g')) */
function fingerprintFor(artist: string | null | undefined, title: string | null | undefined): string {
  const raw = `${artist || ''}|${title || ''}`.toLowerCase();
  return raw.replace(/[^a-z0-9|]/g, '');
}

/** Simple bigram Dice coefficient — cheap stand-in for fuzzy string similarity. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) || 0) + 1);
    }
    return set;
  };
  const mapA = bigrams(a);
  const mapB = bigrams(b);
  let matches = 0;
  for (const [bg, countA] of mapA) {
    const countB = mapB.get(bg) || 0;
    matches += Math.min(countA, countB);
  }
  const total = Array.from(mapA.values()).reduce((s, c) => s + c, 0) + Array.from(mapB.values()).reduce((s, c) => s + c, 0);
  return total === 0 ? 0 : (2 * matches) / total;
}

interface TargetMetadata {
  cleanArtist?: string | null;
  cleanTitle?: string | null;
  year?: string | null;
  versionTag?: string | null;
  isRemaster?: boolean;
  isMix?: boolean;
  isLive?: boolean;
  isOuttake?: boolean;
}

export function scoreCandidateMatch(
  candTitle: string | null | undefined,
  candArtist: string | null | undefined,
  candAlbum: string | null | undefined,
  target: TargetMetadata,
  releaseDate?: string | null
): number {
  let score = 0;
  const name = normalizeForMatch(candTitle);
  const candArt = normalizeForMatch(candArtist);
  const candAlb = normalizeForMatch(candAlbum);
  const targetTitle = normalizeForMatch(target.cleanTitle);
  const targetArtist = normalizeForMatch(target.cleanArtist);

  if (targetTitle && name === targetTitle) score += 100;
  else if (targetTitle && name.includes(targetTitle)) score += 50;

  if (targetArtist && (candArt.includes(targetArtist) || targetArtist.includes(candArt))) score += 80;

  // Year matching
  const candYearMatch = (candTitle || '' + ' ' + (candAlbum || '') + ' ' + (releaseDate || '')).match(/\b(19\d\d|20\d\d)\b/);
  const candYear = candYearMatch ? candYearMatch[1] : null;

  if (target.year && candYear) {
    if (target.year === candYear) score += 80;
    else score -= 60;
  }

  // Version tag alignment
  const isCandRemaster = /\b(remastered?|remaster)\b/i.test(candTitle || '') || /\b(remastered?|remaster)\b/i.test(candAlbum || '');
  if (target.isRemaster && isCandRemaster) score += 40;

  const isCandOuttake = /\b(take\s*\d+|demo|outtake|tribute|karaoke|cover)\b/i.test(candTitle || '');
  if (!target.isOuttake && isCandOuttake) score -= 80;

  // Compilation / Greatest Hits deprioritization
  const isCompilation = /\b(greatest hits|the best of|essential|singles|1962-1966|1967-1970|anthology|compilation)\b/i.test(candAlbum || '') || /\b(greatest hits|the best of|essential|singles|1962-1966|1967-1970|anthology|compilation)\b/i.test(candTitle || '');
  if (isCompilation) score -= 30;

  return score;
}

function classifyMatch(
  candidateTitle: string | null | undefined,
  candidateArtist: string | null | undefined,
  title: string | null | undefined,
  artist: string | null | undefined,
  isAlbum?: boolean
): Confidence {
  const normTitle = normalizeForMatch(title);
  const normArtist = normalizeForMatch(artist);
  const name = normalizeForMatch(candidateTitle);
  const candArtist = normalizeForMatch(candidateArtist);

  const titleExact = !!normTitle && name === normTitle;
  const titleIsSingleWord = !!normTitle && normTitle.split(' ').length === 1;

  let titleWordMatch = false;
  if (normTitle && !titleIsSingleWord) {
    const re = new RegExp(`\\b${normTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    titleWordMatch = re.test(name);
  } else if (normTitle && titleIsSingleWord) {
    titleWordMatch = name.includes(normTitle);
  }

  const artistUnknown = !normArtist;
  const artistInTitle =
    !!normArtist &&
    new RegExp(`\\b${normArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(name);
  const artistMatch =
    !!normArtist &&
    ((candArtist.length > 0 && (candArtist.includes(normArtist) || normArtist.includes(candArtist))) || artistInTitle);

  if (isAlbum) {
    const isFullAlbum = /\b(full album|full concert|album|full set|complete album)\b/i.test(candidateTitle || '');
    const isSingleTrack = /\b(official audio|official video|official lyric|single|clip)\b/i.test(candidateTitle || '') && !isFullAlbum;
    
    if (isFullAlbum && (artistMatch || artistUnknown) && (titleWordMatch || titleExact || artistInTitle)) {
      return 'high';
    }
    if (isSingleTrack) {
      return 'none';
    }
    if (artistMatch && (titleWordMatch || titleExact)) {
      return 'high';
    }
  }

  const sim = similarity(`${normArtist} ${normTitle}`.trim(), `${name} ${candArtist}`.trim());

  if (titleExact && (artistMatch || artistUnknown)) return 'high';
  if ((titleExact || titleWordMatch) && artistMatch) return 'low';
  if (titleExact && !artistUnknown && !artistMatch) return 'low';
  if (artistMatch && sim > 0.35) return 'low';

  return 'none';
}

function confidenceToNumeric(c: Confidence): number | null {
  if (c === 'high') return 1;
  if (c === 'low') return 0.5;
  return null;
}

export async function fetchSpotifyMetadata(url: string) {
  try {
    const html = await fetch(url, { 
      headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' } 
    }).then(r => r.text());
    const $ = cheerio.load(html);
    const rawTitle = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text() || null;
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const thumbnail_url = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || null;

    let title: string | null = null;
    let artist: string | null = $('meta[name="music:musician_description"]').attr('content') || null;

    // 1. Check LD+JSON for exact structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html();
        if (text) {
          const data = JSON.parse(text);
          if (data.name && !title) title = data.name;
          if (data.byArtist?.name && !artist) artist = data.byArtist.name;
          if (Array.isArray(data.byArtist) && data.byArtist[0]?.name && !artist) {
            artist = data.byArtist.map((a: any) => a.name).join(', ');
          }
        }
      } catch {}
    });

    // 2. Parse raw title if needed
    if (rawTitle) {
      const parsed = parseSpotifyTitle(rawTitle);
      if (!title) title = parsed.title;
      if (!artist && parsed.artist) artist = parsed.artist;
    }

    // 3. Fallback artist from og:description (e.g. "Daniel Lanois · album · 2005 · 13 songs" or "Rick Astley · Whenever You Need Somebody · Song · 1987")
    if (!artist && description) {
      const parts = description.split('·').map(s => s.trim());
      if (parts.length > 1) {
        artist = parts[0];
      }
    }

    const cleanT = title ? cleanYouTubeTitle(title) : (rawTitle ? parseSpotifyTitle(rawTitle).title : null);

    return { 
      title: cleanT || null, 
      artist: artist ? artist.trim() : null, 
      thumbnail_url: thumbnail_url || null 
    };
  } catch (e) {
    return { title: null, artist: null, thumbnail_url: null };
  }
}

async function fetchAppleMusicMetadata(url: string) {
  try {
    let urlStr = decodeURIComponent(url);
    urlStr = urlStr.replace(/^(https?:\/\/)+/, '').replace(/^(https?:\/+)/, '');
    urlStr = 'https://' + urlStr;
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split('/');
    const country = pathParts[1] && pathParts[1].length === 2 ? pathParts[1] : 'us';
    const trackId = parsed.searchParams.get('i');
    const id = trackId || pathParts.find((part) => /^\d+$/.test(part) || part.startsWith('id'))?.replace('id', '');

    if (!id) return { title: null, artist: null, thumbnail_url: null };

    const lookup = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const item = lookup?.results?.[0];
    if (item) {
      return {
        title: (trackId ? item.trackName : item.collectionName) || item.trackName || null,
        artist: item.artistName || null,
        thumbnail_url: item.artworkUrl100 || null,
      };
    }
  } catch (e) {
    console.error('Apple Music metadata lookup failed:', e);
  }
  return { title: null, artist: null, thumbnail_url: null };
}

interface SpotapiResult {
  url: string;
  confidence: Confidence;
  title?: string | null;
  artist?: string | null;
  thumbnail_url?: string | null;
  isServerError?: boolean;
}

async function callSpotapiUnified(
  baseUrl: string,
  query: string,
  isAlbum: boolean,
  title?: string,
  artist?: string
): Promise<SpotapiResult | null> {
  try {
    const params = new URLSearchParams({ q: query, is_album: String(isAlbum) });
    if (title) params.set('title', title);
    if (artist) params.set('artist', artist);
    const searchUrl = `${baseUrl.replace(/\/$/, '')}/api/spotify/search?${params.toString()}`;
    const res = await fetch(searchUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data?.url) return null;
    return {
      url: data.url,
      confidence: (data.confidence as Confidence) || 'low',
      title: data.title || null,
      artist: data.artist || null,
      thumbnail_url: data.thumbnail_url || null,
    };
  } catch (e) {
    return null;
  }
}

async function callSpotapiEntity(
  baseUrl: string,
  endpoint: 'search-track' | 'search-album',
  query: string,
  title?: string,
  artist?: string
): Promise<SpotapiResult | null> {
  try {
    const params = new URLSearchParams({ q: query });
    if (title) params.set('title', title);
    if (artist) params.set('artist', artist);
    const searchUrl = `${baseUrl.replace(/\/$/, '')}/api/spotify/${endpoint}?${params.toString()}`;
    const res = await fetch(searchUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`SpotAPI service returned non-OK status: ${res.status} for ${endpoint}`);
      return { url: '', confidence: 'none', isServerError: true };
    }
    const data = await res.json();
    if (!data?.url) return null;
    return {
      url: data.url,
      confidence: (data.confidence as Confidence) || 'low',
      title: data.title || null,
      artist: data.artist || null,
      thumbnail_url: data.thumbnail_url || null,
    };
  } catch (e) {
    console.error('SpotAPI service fetch failed:', e);
    return { url: '', confidence: 'none', isServerError: true };
  }
}

/**
 * Searches Spotify via spotapi-service (see AG_CONTEXT.md — never the
 * official Spotify Web API).
 *
 * Uses unified single-trip search by default (evaluating both tracks and albums
 * in one GraphQL round-trip), with automatic fallback to typed endpoints.
 */
async function searchSpotifyViaSpotapi(
  query: string,
  isAlbum: boolean,
  title?: string,
  artist?: string
): Promise<SpotapiResult | null> {
  const baseUrl = process.env.SPOTAPI_URL;
  if (!baseUrl) {
    console.error('SPOTAPI_URL is not configured; skipping SpotAPI lookup');
    return null;
  }

  // 1. Fast path: single-trip unified search (tracks + albums in 1 GraphQL call with full metadata)
  const unified = await callSpotapiUnified(baseUrl, query, isAlbum, title, artist);
  if (unified?.url) {
    return unified;
  }

  // 2. Fallback path: separate entity searches
  const primaryEndpoint = isAlbum ? 'search-album' : 'search-track';
  const fallbackEndpoint = isAlbum ? 'search-track' : 'search-album';

  const primary = await callSpotapiEntity(baseUrl, primaryEndpoint, query, title, artist);
  if (primary?.isServerError) {
    return null;
  }
  if (primary?.confidence === 'high') return primary;

  const fallback = await callSpotapiEntity(baseUrl, fallbackEndpoint, query, title, artist);
  if (fallback?.isServerError) {
    return primary && !primary.isServerError ? primary : null;
  }
  if (fallback?.confidence === 'high') return fallback;

  // Neither entity type found a confident match — prefer whichever result we have
  const validPrimary = primary && !primary.isServerError ? primary : null;
  const validFallback = fallback && !fallback.isServerError ? fallback : null;
  return validPrimary || validFallback || null;
}

/**
 * Song ranking: named album first, then the plain song over live/remix takes,
 * then the length most versions share (which sinks extended or edited cuts).
 */
function rankSongs(results: any[], albumSlug: string | null | undefined, wantsVersion = false) {
  const lengths = results.map((r) => r.trackTimeMillis || 0).filter(Boolean).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length / 2)] || 0;
  const key = (r: any) => [
    albumRank(r.collectionName, albumSlug),
    !wantsVersion && isAlternateVersion(r.trackName || '') ? 1 : 0,
    Math.abs((r.trackTimeMillis || typical) - typical),
  ];
  return [...results].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
}

/** iTunes throttles by IP (403s after about 20 calls a minute), so each search is cached for a day. */
async function searchItunesSongs(term: string, country: string) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&country=${country.toLowerCase()}&limit=50`;
  const data = await fetch(url, { next: { revalidate: 86400 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return (data?.results || []).filter((r: any) => r.kind === 'song' && r.trackViewUrl);
}

function isByArtist(r: any, artistSlug: string) {
  return `-${slugify(r.artistName || '')}-`.includes(`-${artistSlug}-`);
}

function hasTitle(r: any, titleSlug: string) {
  return slugify(coreTitle((r.trackName || '').replace(/\s*[(\[].*$/, ''))) === titleSlug;
}

/**
 * The artist's own versions of a song. iTunes sometimes buries a song under
 * title-alikes by others, so a second search walks the named album's tracks.
 */
async function findArtistSongs(artistSlug: string, albumSlug: string | null | undefined, titleSlug: string, country: string) {
  const words = (s: string) => s.replace(/-/g, ' ');
  const matches = (rows: any[]) => rows.filter((r) => isByArtist(r, artistSlug) && hasTitle(r, titleSlug));
  const found = matches(await searchItunesSongs(`${words(artistSlug)} ${words(titleSlug)}`, country));
  if (found.length || !albumSlug || albumSlug === NO_ALBUM_SLUG) return found;
  return matches(await searchItunesSongs(`${words(artistSlug)} ${words(albumSlug)}`, country));
}

export interface SongMatch {
  artist: string;
  album: string | null;
  title: string;
}

/** Lower is better: exact album, then deluxe/remaster editions of it, then any other. */
function albumRank(collectionName: string | null | undefined, albumSlug: string | null | undefined) {
  if (!albumSlug || albumSlug === NO_ALBUM_SLUG) return 0;
  const slug = slugify(collectionName || '');
  if (slug === albumSlug) return 0;
  return slug.startsWith(`${albumSlug}-`) ? 1 : 2;
}

/**
 * Finds the real song behind slugs, songs only (iTunes `entity=song`), so names
 * get their true spelling and punctuation back. The album only ranks results: a
 * wrong album segment still lands on the song. Null when no song has that title.
 */
export async function lookupSong(artistSlug: string, albumSlug: string | null, trackSlug: string, country = 'CA'): Promise<SongMatch | null> {
  const songs = await findArtistSongs(artistSlug, albumSlug, coreTitleSlug(trackSlug), country);

  const best = rankSongs(songs, albumSlug, isAlternateVersion(trackSlug))[0];
  if (!best) return null;
  return { artist: best.artistName, album: best.collectionName || null, title: coreTitle(best.trackName) };
}

export interface CachedMatch {
  url: string;
  matched_by: string | null;
  /** Manual pick explicitly flagged "this isn't right, but it's the closest
   *  available" — never true for matched_by = 'auto'. */
  uncertain?: boolean;
}

export interface EntityContext {
  entityId: string;
  isAlbum: boolean;
  country: string;
  sourcePlatform: 'apple_music' | 'spotify' | 'youtube' | 'unknown';
  cleanArtist: string;
  cleanTitle: string;
  searchTerm: string;
  canonicalTitle?: string | null;
  canonicalArtist?: string | null;
  typeHint?: 'album' | 'track' | null;
  /** Slug of the album a song URL named; prefers that album's version of the song. */
  albumSlug?: string | null;
  /** Matches already known for this entity (from a previous resolution), keyed by platform. */
  cached: Partial<Record<Platform, CachedMatch>>;
}

/**
 * Resolve (or create) the canonical entity for an artist/title pair. This is the
 * single fast, synchronous step every platform resolver depends on — it does one
 * cheap DB round trip and never calls out to iTunes/Spotify/YouTube. Callers can
 * then kick off the three platform resolutions independently/in parallel.
 *
 * Dedup strategy: entities are matched by normalized "artist|title" fingerprint,
 * so re-resolving the same album/track (regardless of which platform link was
 * originally pasted) reuses the same entity and any matches already cached on it.
 */
export async function resolveEntity(
  artist: string,
  title: string,
  country: string,
  sourceUrl?: string,
  typeHint?: 'album' | 'track' | null,
  albumSlug?: string | null
): Promise<EntityContext> {
  const countryCode = country.toUpperCase();
  const cleanArtistRaw = (artist || '').trim();
  const cleanTitleRaw = (title || '').trim();

  let cleanArtist = cleanArtistRaw;
  let cleanTitle = coreTitle(cleanTitleRaw);

  let sourcePlatform: EntityContext['sourcePlatform'] = 'unknown';
  if (sourceUrl?.includes('apple.com')) sourcePlatform = 'apple_music';
  if (sourceUrl?.includes('spotify.com')) sourcePlatform = 'spotify';
  if (sourceUrl?.includes('youtube.com') || sourceUrl?.includes('youtu.be')) sourcePlatform = 'youtube';

  if (sourcePlatform === 'youtube' || /[\(\[\{]/.test(cleanTitle)) {
    const parsed = parseYouTubeTitle(cleanTitle, cleanArtist);
    if (parsed.artist && (!cleanArtist || cleanArtist === 'Unknown Artist')) {
      cleanArtist = parsed.artist;
    }
    cleanTitle = parsed.title || cleanTitle;
  }

  const searchTerm = (cleanArtist && cleanArtist !== 'Unknown Artist')
    ? `${cleanArtist} ${cleanTitle}`
    : cleanTitle;

  let isAlbum = false;
  if (typeHint === 'album') isAlbum = true;
  else if (typeHint === 'track') isAlbum = false;
  else if (sourceUrl?.includes('/album/') || sourceUrl?.includes('entity=album') || sourceUrl?.includes('list=')) {
    isAlbum = true;
  } else if (/(?:^|\s)(?:full\s+album|alive\s+\d{4}|live\s+at\s+)(?:$|\s)/i.test(cleanTitle)) {
    isAlbum = true;
  }

  const fingerprint = fingerprintFor(cleanArtist, cleanTitle);

  let entityId: string | null = null;
  const cached: Partial<Record<Platform, CachedMatch>> = {};

  // A song never shares an entity with a same-named album (or the same title on
  // another album): the fingerprint can't tell those apart, so songs get their
  // own entity keyed by a `track:` source_url and are hidden from fingerprint lookups.
  const trackKey = typeHint === 'track'
    ? `track:${slugify(cleanArtist)}/${albumSlug || ''}/${slugify(cleanTitle)}`
    : null;

  if (trackKey) {
    const byKey = await sql`SELECT id FROM resolved_entities WHERE source_url = ${trackKey} ORDER BY created_at ASC LIMIT 1`;
    if (byKey[0]?.id) entityId = byKey[0].id;
  }

  // 1. Try to find a matching URL directly among previously cached candidates —
  //    handles the case where the exact URL pasted was seen before as a *match*
  //    rather than the original source (e.g. we found this Spotify link while
  //    resolving a YouTube video previously).
  if (!trackKey && sourceUrl) {
    const byUrl = await sql`
      SELECT entity_id FROM match_candidates WHERE candidate_url = ${sourceUrl} LIMIT 1
    `;
    if (byUrl[0]?.entity_id) entityId = byUrl[0].entity_id;
  }

  // 2. Fall back to fingerprint (normalized artist+title) match against existing entities.
  //
  // NOTE: we deliberately do NOT use the stored `fingerprint` generated column
  // here — its expression has a bug (lower() is applied outside regexp_replace,
  // so the character-class filter strips capitalized letters before they're
  // ever lowercased, corrupting almost every real artist/title). We don't have
  // ALTER privileges on this table to fix the column itself, so we recompute
  // the correct fingerprint inline in the query instead.
  if (!trackKey && !entityId && fingerprint) {
    const byFingerprint = await sql`
      SELECT id FROM resolved_entities
      WHERE regexp_replace(lower(coalesce(artist,'')||'|'||coalesce(title,'')), '[^a-z0-9|]', '', 'g') = ${fingerprint}
        AND source_url NOT LIKE 'track:%'
      ORDER BY created_at ASC LIMIT 1
    `;
    if (byFingerprint[0]?.id) entityId = byFingerprint[0].id;
  }

  let canonicalTitle: string | null = null;
  let canonicalArtist: string | null = null;

  if (entityId) {
    if (!typeHint) {
      const albumMatch = await sql`SELECT entity_id FROM match_candidates WHERE entity_id = ${entityId} AND candidate_url LIKE '%/album/%' AND candidate_url NOT LIKE '%?i=%' LIMIT 1`;
      if (albumMatch.length > 0) isAlbum = true;
    }

    const canonical = await sql`SELECT title, artist FROM match_candidates WHERE entity_id = ${entityId} AND title IS NOT NULL AND confidence = 1 ORDER BY rank ASC LIMIT 1`;
    if (canonical[0]) {
      const parsed = parseSpotifyTitle(canonical[0].title);
      canonicalTitle = parsed.title ? cleanYouTubeTitle(parsed.title) : cleanYouTubeTitle(canonical[0].title);
      canonicalArtist = canonical[0].artist || (parsed.artist ? parsed.artist : canonical[0].artist);
    }

    if (!typeHint || trackKey) {
      const matches = await sql`
        SELECT platform, matched_url, matched_by, uncertain FROM entity_matches WHERE entity_id = ${entityId}
      `;
      for (const m of matches) {
        cached[m.platform as Platform] = { url: m.matched_url, matched_by: m.matched_by, uncertain: !!m.uncertain };
      }
    }

    if (!isAlbum) {
      isAlbum = Object.values(cached).some((m) => isAlbumUrl(m.url));
    }
  } else {
    const inserted = await sql`
      INSERT INTO resolved_entities (source_url, source_platform, title, artist)
      VALUES (${trackKey || sourceUrl || ''}, ${sourcePlatform}, ${cleanTitle}, ${cleanArtist})
      RETURNING id
    `;
    entityId = inserted[0].id;
  }

  if (typeHint === 'album') isAlbum = true;
  else if (typeHint === 'track') isAlbum = false;

  return { entityId: entityId as string, isAlbum, country: countryCode, sourcePlatform, cleanArtist, cleanTitle, searchTerm, cached, canonicalTitle, canonicalArtist, typeHint, albumSlug };
}

/** Persist the auto-picked match for a platform, without clobbering a manual override. */
async function saveAutoMatch(entityId: string, platform: Platform, url: string, candidateId?: string | null) {
  await sql`
    INSERT INTO entity_matches (entity_id, platform, matched_url, matched_by, candidate_id, updated_at, uncertain)
    VALUES (${entityId}, ${platform}, ${url}, 'auto', ${candidateId || null}, now(), false)
    ON CONFLICT (entity_id, platform) DO UPDATE
      SET matched_url = EXCLUDED.matched_url, candidate_id = EXCLUDED.candidate_id, updated_at = now(), uncertain = false
      WHERE entity_matches.matched_by <> 'manual'
  `;
}

export type MediaType = 'track' | 'album';

export interface PlatformResult {
  url: string;
  matchedBy: string | null;
  candidates: any[];
  /** True when the current match was manually picked and flagged "this isn't
   *  right, but it's the closest available". */
  uncertain?: boolean;
  entityType?: MediaType;
  artworkUrl?: string | null;
  title?: string | null;
  artist?: string | null;
}

export function reconcileEntityType(
  initialType: MediaType,
  explicitType: boolean,
  matches: Array<{ platform: Platform; confidence?: Confidence | number | null; entityType?: MediaType; url?: string }>
): MediaType {
  if (explicitType) return initialType;

  const validMatches = matches.filter(m => m.url && m.entityType && !m.url.includes('/search'));
  const albumMatches = validMatches.filter(m => m.entityType === 'album');

  // Promote to album if both Spotify and Apple Music matches are albums,
  // or if all available high-confidence matches agree on album
  if (albumMatches.length >= 2 || (validMatches.length === 1 && albumMatches.length === 1)) {
    return 'album';
  }

  return initialType;
}

export async function resolveApplePlatform(ctx: EntityContext, sourceUrl?: string): Promise<PlatformResult> {
  const { entityId, cleanTitle, cleanArtist, searchTerm, country, cached } = ctx;

  if (ctx.sourcePlatform === 'apple_music' && sourceUrl) {
    const meta = await fetchAppleMusicMetadata(sourceUrl);
    const existing = await sql`SELECT id FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' AND candidate_url = ${sourceUrl} LIMIT 1`;
    let candidateId = existing[0]?.id;
    if (!candidateId) {
      const inserted = await sql`
        INSERT INTO match_candidates (entity_id, platform, candidate_url, title, artist, thumbnail_url, rank, source, confidence)
        VALUES (${entityId}, 'apple_music', ${sourceUrl}, ${meta.title}, ${meta.artist}, ${meta.thumbnail_url}, 1, 'explicit', 1)
        ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
          SET title = EXCLUDED.title, artist = EXCLUDED.artist, thumbnail_url = EXCLUDED.thumbnail_url, rank = 1, source = 'explicit', confidence = 1
        RETURNING id
      `;
      candidateId = inserted[0].id;
    } else {
      await sql`
        UPDATE match_candidates SET confidence = 1, source = 'explicit' WHERE id = ${candidateId}
      `;
    }
    await sql`
      INSERT INTO entity_matches (entity_id, platform, matched_url, matched_by, candidate_id, updated_at, uncertain)
      VALUES (${entityId}, 'apple_music', ${sourceUrl}, 'auto', ${candidateId || null}, now(), false)
      ON CONFLICT (entity_id, platform) DO UPDATE
        SET matched_url = EXCLUDED.matched_url, matched_by = 'auto', candidate_id = EXCLUDED.candidate_id, updated_at = now(), uncertain = false
    `;
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' ORDER BY confidence DESC NULLS LAST, rank ASC`;
    const isAlbum = isAlbumUrl(sourceUrl);
    return {
      url: sourceUrl,
      matchedBy: 'explicit',
      candidates,
      uncertain: false,
      entityType: isAlbum ? 'album' : 'track',
      artworkUrl: meta.thumbnail_url || null,
      title: meta.title || null,
      artist: meta.artist || null,
    };
  }

  // Older auto matches for a song could be a same-titled song by another artist.
  let staleSongMatch = false;
  if (ctx.typeHint === 'track' && cached.apple_music?.matched_by === 'auto') {
    const row = await sql`SELECT artist FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' AND candidate_url = ${cached.apple_music.url} LIMIT 1`;
    staleSongMatch = !isByArtist({ artistName: row[0]?.artist }, slugify(cleanArtist));
  }

  // Cache hit — reuse the previously auto/manually matched link for this entity.
  if (cached.apple_music && !staleSongMatch) {
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' ORDER BY confidence DESC NULLS LAST, rank ASC`;
    const active = candidates.find((c: any) => c.candidate_url === cached.apple_music?.url) || candidates[0];
    const isAlbum = isAlbumUrl(active?.candidate_url);
    return {
      url: cached.apple_music.url,
      matchedBy: cached.apple_music.matched_by,
      candidates,
      uncertain: cached.apple_music.url === sourceUrl || cached.apple_music.matched_by === 'explicit' ? false : cached.apple_music.uncertain,
      entityType: isAlbum ? 'album' : 'track',
      artworkUrl: active?.thumbnail_url || null,
      title: active?.title || null,
      artist: active?.artist || null,
    };
  }

  let appleUrl = `https://music.apple.com/${country.toLowerCase()}/search?term=${encodeURIComponent(searchTerm)}`;
  const songOnly = ctx.typeHint === 'track';
  // Songs only accept the artist's own recordings: a same-titled song by someone else is a wrong link.
  const itunesSearch = songOnly
    ? { results: rankSongs(await findArtistSongs(slugify(cleanArtist), ctx.albumSlug, coreTitleSlug(slugify(cleanTitle)), country), ctx.albumSlug, isAlternateVersion(cleanTitle)).slice(0, 5) }
    : await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song,album&country=${country.toLowerCase()}&limit=5`)
      .then(r => r.json()).catch(() => null);

  let bestConfidence: Confidence = 'none';
  let bestCandidateId: string | null = null;
  let bestEntityType: MediaType = 'track';
  let bestArtworkUrl: string | null = null;
  let bestTitle: string | null = null;
  let bestArtist: string | null = null;

  if (itunesSearch?.results) {
    let rank = 1;
    for (const r of itunesSearch.results) {
      const rawUrl = r.trackViewUrl || r.collectionViewUrl;
      const candidateUrl = rawUrl ? cleanAppleUrl(rawUrl) : null;
      if (candidateUrl) {
        const isAlbumMatch = r.wrapperType === 'collection' || r.collectionType === 'Album' || (isAlbumUrl(candidateUrl) && r.kind !== 'song');
        const candTitle = r.trackName || r.collectionName;
        const confidence = classifyMatch(candTitle, r.artistName, cleanTitle, cleanArtist);
        const artworkUrl = r.artworkUrl100 ? r.artworkUrl100.replace(/\d+x\d+bb/, '1200x1200bb') : null;

        const insertedRow = await sql`
          INSERT INTO match_candidates (entity_id, platform, candidate_url, title, artist, thumbnail_url, rank, source, confidence)
          VALUES (${entityId}, 'apple_music', ${candidateUrl}, ${candTitle}, ${r.artistName}, ${r.artworkUrl100}, ${rank}, 'itunes_api', ${confidenceToNumeric(confidence)})
          ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
            SET title = EXCLUDED.title, artist = EXCLUDED.artist, thumbnail_url = EXCLUDED.thumbnail_url, rank = EXCLUDED.rank, source = EXCLUDED.source, confidence = EXCLUDED.confidence
          RETURNING id
        `;
        if (confidence === 'high' && bestConfidence !== 'high') {
          appleUrl = candidateUrl;
          bestConfidence = 'high';
          bestCandidateId = insertedRow[0].id;
          bestEntityType = isAlbumMatch ? 'album' : 'track';
          bestArtworkUrl = artworkUrl;
          bestTitle = candTitle;
          bestArtist = r.artistName;
        } else if (confidence === 'low' && bestConfidence === 'none') {
          appleUrl = candidateUrl;
          bestConfidence = 'low';
          bestCandidateId = insertedRow[0].id;
          bestEntityType = isAlbumMatch ? 'album' : 'track';
          bestArtworkUrl = artworkUrl;
          bestTitle = candTitle;
          bestArtist = r.artistName;
        }
        rank++;
      }
    }
  }

  if (bestConfidence === 'none') {
    await sql`
      INSERT INTO match_candidates (entity_id, platform, candidate_url, rank, source, confidence)
      VALUES (${entityId}, 'apple_music', ${appleUrl}, 0, 'apple_fallback', null)
      ON CONFLICT (entity_id, platform, candidate_url) DO NOTHING
    `;
  } else {
    await saveAutoMatch(entityId, 'apple_music', appleUrl, bestCandidateId);
  }

  const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' ORDER BY confidence DESC NULLS LAST, rank ASC`;
  return {
    url: appleUrl,
    matchedBy: bestConfidence === 'none' ? null : 'auto',
    candidates,
    entityType: bestEntityType,
    artworkUrl: bestArtworkUrl,
    title: bestTitle,
    artist: bestArtist,
  };
}

export async function resolveSpotifyPlatform(ctx: EntityContext, sourceUrl?: string): Promise<PlatformResult> {
  const { entityId, cleanTitle, cleanArtist, searchTerm, isAlbum: ctxIsAlbum, cached } = ctx;
  let isAlbum = ctxIsAlbum;

  if (ctx.sourcePlatform === 'spotify' && sourceUrl) {
    if (sourceUrl.includes('/album/')) isAlbum = true;
    const rawMeta = await fetchSpotifyMetadata(sourceUrl);
    const parsed = parseSpotifyTitle(rawMeta.title || '');
    const meta = {
      title: parsed.title ? cleanYouTubeTitle(parsed.title) : rawMeta.title,
      artist: rawMeta.artist || parsed.artist || null,
      thumbnail_url: rawMeta.thumbnail_url,
    };
    const existing = await sql`SELECT id FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' AND candidate_url = ${sourceUrl} LIMIT 1`;
    let candidateId = existing[0]?.id;
    if (!candidateId) {
      const inserted = await sql`
        INSERT INTO match_candidates (entity_id, platform, candidate_url, title, artist, thumbnail_url, rank, source, confidence)
        VALUES (${entityId}, 'spotify', ${sourceUrl}, ${meta.title}, ${meta.artist}, ${meta.thumbnail_url}, 1, 'explicit', 1)
        ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
          SET title = EXCLUDED.title, artist = EXCLUDED.artist, thumbnail_url = EXCLUDED.thumbnail_url, rank = 1, source = 'explicit', confidence = 1
        RETURNING id
      `;
      candidateId = inserted[0].id;
    } else {
      await sql`
        UPDATE match_candidates SET confidence = 1, source = 'explicit' WHERE id = ${candidateId}
      `;
    }
    await sql`
      INSERT INTO entity_matches (entity_id, platform, matched_url, matched_by, candidate_id, updated_at, uncertain)
      VALUES (${entityId}, 'spotify', ${sourceUrl}, 'auto', ${candidateId || null}, now(), false)
      ON CONFLICT (entity_id, platform) DO UPDATE
        SET matched_url = EXCLUDED.matched_url, matched_by = 'auto', candidate_id = EXCLUDED.candidate_id, updated_at = now(), uncertain = false
    `;
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' ORDER BY confidence DESC NULLS LAST, rank ASC`;
    return {
      url: sourceUrl,
      matchedBy: 'explicit',
      candidates,
      uncertain: false,
      entityType: isAlbum ? 'album' : 'track',
      artworkUrl: meta.thumbnail_url || null,
      title: meta.title || null,
      artist: meta.artist || null,
    };
  }

  if (cached.spotify) {
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' ORDER BY confidence DESC NULLS LAST, rank ASC`;
    const active = candidates.find((c: any) => c.candidate_url === cached.spotify?.url) || candidates[0];
    const isCachedAlbum = active?.candidate_url?.includes('/album/');
    return {
      url: cached.spotify.url,
      matchedBy: cached.spotify.matched_by,
      candidates,
      uncertain: cached.spotify.url === sourceUrl || cached.spotify.matched_by === 'explicit' ? false : cached.spotify.uncertain,
      entityType: isCachedAlbum ? 'album' : 'track',
      artworkUrl: active?.thumbnail_url || null,
      title: active?.title || null,
      artist: active?.artist || null,
    };
  }

  const baseUrl = process.env.SPOTAPI_URL;
  const trackResult = ctx.typeHint === 'track' && baseUrl
    ? await callSpotapiEntity(baseUrl, 'search-track', searchTerm, cleanTitle, cleanArtist)
    : null;
  const result = ctx.typeHint === 'track'
    ? (trackResult?.url ? trackResult : null)
    : await searchSpotifyViaSpotapi(searchTerm, isAlbum, cleanTitle, cleanArtist);
  let spotifyUrl: string;
  let matchedBy: string | null = null;
  let spotifyMeta: { title: string | null; artist: string | null; thumbnail_url: string | null } | null = null;

  if (result) {
    spotifyUrl = result.url;
    if (spotifyUrl.includes('/album/')) isAlbum = true;
    
    // Use metadata returned directly by SpotAPI to avoid ~2s HTML scraping overhead;
    // only fall back to scraping open.spotify.com if SpotAPI didn't return thumbnail
    const rawMeta = (result.title || result.thumbnail_url)
      ? { title: result.title || cleanTitle, artist: result.artist || cleanArtist, thumbnail_url: result.thumbnail_url || null }
      : await fetchSpotifyMetadata(spotifyUrl);
    const parsed = parseSpotifyTitle(rawMeta.title || '');
    spotifyMeta = {
      title: parsed.title ? cleanYouTubeTitle(parsed.title) : rawMeta.title,
      artist: rawMeta.artist || parsed.artist || null,
      thumbnail_url: rawMeta.thumbnail_url,
    };

    const inserted = await sql`
      INSERT INTO match_candidates (entity_id, platform, candidate_url, title, artist, thumbnail_url, rank, source, confidence)
      VALUES (${entityId}, 'spotify', ${spotifyUrl}, ${spotifyMeta.title}, ${spotifyMeta.artist}, ${spotifyMeta.thumbnail_url}, 1, 'spotapi', ${confidenceToNumeric(result.confidence)})
      ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
        SET title = EXCLUDED.title, artist = EXCLUDED.artist, thumbnail_url = EXCLUDED.thumbnail_url, rank = EXCLUDED.rank, source = EXCLUDED.source, confidence = EXCLUDED.confidence
      RETURNING id
    `;
    if (result.confidence !== 'none') {
      await saveAutoMatch(entityId, 'spotify', spotifyUrl, inserted[0].id);
      matchedBy = 'auto';
    }
  } else {
    console.error('Spotify search found no plausible match for:', searchTerm);
    spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(searchTerm)}`;
    await sql`
      INSERT INTO match_candidates (entity_id, platform, candidate_url, rank, source, confidence)
      VALUES (${entityId}, 'spotify', ${spotifyUrl}, 0, 'spotify_fallback', null)
      ON CONFLICT (entity_id, platform, candidate_url) DO NOTHING
    `;
  }

  const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' ORDER BY confidence DESC NULLS LAST, rank ASC`;
  const isAlbumMatch = spotifyUrl.includes('/album/');
  return {
    url: spotifyUrl,
    matchedBy,
    candidates,
    entityType: isAlbumMatch ? 'album' : 'track',
    artworkUrl: spotifyMeta?.thumbnail_url || null,
    title: spotifyMeta?.title || null,
    artist: spotifyMeta?.artist || null,
  };
}

export async function resolveYoutubePlatform(ctx: EntityContext, sourceUrl?: string): Promise<PlatformResult> {
  const { entityId, cleanTitle, cleanArtist, isAlbum, cached } = ctx;

  if (ctx.sourcePlatform === 'youtube' && sourceUrl) {
    const existing = await sql`SELECT id FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' AND candidate_url = ${sourceUrl} LIMIT 1`;
    let candidateId = existing[0]?.id;
    if (!candidateId) {
      const inserted = await sql`
        INSERT INTO match_candidates (entity_id, platform, candidate_url, rank, source, confidence)
        VALUES (${entityId}, 'youtube', ${sourceUrl}, 1, 'explicit', 1)
        ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
          SET rank = 1, source = 'explicit', confidence = 1
        RETURNING id
      `;
      candidateId = inserted[0].id;
    } else {
      await sql`
        UPDATE match_candidates SET confidence = 1, source = 'explicit' WHERE id = ${candidateId}
      `;
    }
    await saveAutoMatch(entityId, 'youtube', sourceUrl, candidateId);
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY confidence DESC NULLS LAST, rank ASC`;
    return { url: sourceUrl, matchedBy: 'explicit', candidates, uncertain: false, entityType: isAlbum ? 'album' : 'track' };
  }

  if (cached.youtube) {
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY confidence DESC NULLS LAST, rank ASC`;
    return { url: cached.youtube.url, matchedBy: cached.youtube.matched_by, candidates, entityType: isAlbum ? 'album' : 'track' };
  }

  // Cross-link YouTube via existing match candidates in DB or fresh YouTube search
  const candidates = await sql`
    SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY confidence DESC NULLS LAST, rank ASC
  `;

  if (candidates.length > 0) {
    const best = candidates[0];
    return { url: best.candidate_url, matchedBy: 'auto', candidates, entityType: isAlbum ? 'album' : 'track' };
  }

  const query = (cleanArtist && cleanArtist !== 'Unknown Artist') ? `${cleanArtist} - ${cleanTitle}` : cleanTitle;
  const videos = await getTopVideos(query, cleanTitle, isAlbum ? 'album' : 'track', 5);
  let bestUrl: string | null = null;

  if (videos.length > 0) {
    bestUrl = `https://www.youtube.com/watch?v=${videos[0].id}`;
    let rank = 1;
    for (const v of videos) {
      const vUrl = `https://www.youtube.com/watch?v=${v.id}`;
      const conf = rank === 1 ? 1 : 0.8;
      await sql`
        INSERT INTO match_candidates (entity_id, platform, candidate_url, title, thumbnail_url, rank, source, confidence)
        VALUES (${entityId}, 'youtube', ${vUrl}, ${v.title || null}, ${v.thumbnail || null}, ${rank}, 'youtube_search', ${conf})
        ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
          SET title = EXCLUDED.title, thumbnail_url = EXCLUDED.thumbnail_url, rank = EXCLUDED.rank, source = EXCLUDED.source, confidence = EXCLUDED.confidence
      `;
      rank++;
    }
    await saveAutoMatch(entityId, 'youtube', bestUrl);
  }

  const updatedCandidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY confidence DESC NULLS LAST, rank ASC`;
  return { url: bestUrl || '', matchedBy: bestUrl ? 'auto' : null, candidates: updatedCandidates, entityType: isAlbum ? 'album' : 'track' };
}

export interface BestMediaMetadata {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  videoId: string | null;
}

/**
 * Finds the highest resolution artwork (Apple Music 1200x1200bb, Spotify 640x640, or YouTube maxresdefault)
 * and YouTube video ID for OpenGraph / Apple Messages preview cards.
 */
export async function resolveBestMediaMetadata(
  artist?: string | null,
  title?: string | null,
  explicitVideoId?: string | null,
  sourceUrl?: string | null
): Promise<BestMediaMetadata> {
  let videoId = explicitVideoId || null;
  if (!videoId && sourceUrl) {
    const m =
      sourceUrl.match(/[?&]v=([\w-]{11})/) ||
      sourceUrl.match(/youtu\.be\/([\w-]{11})/) ||
      sourceUrl.match(/\/shorts\/([\w-]{11})/) ||
      sourceUrl.match(/\/embed\/([\w-]{11})/);
    if (m) videoId = m[1];
  }

  let imageUrl: string | null = null;
  let imageWidth = 1200;
  let imageHeight = 1200;

  try {
    let entityId: string | null = null;

    if (sourceUrl) {
      const byUrl = await sql`
        SELECT entity_id FROM match_candidates WHERE candidate_url = ${sourceUrl} LIMIT 1
      `;
      if (byUrl[0]?.entity_id) entityId = byUrl[0].entity_id;
    }

    if (!entityId && (artist || title)) {
      const fp = fingerprintFor(artist, title);
      const byFp = await sql`
        SELECT id FROM resolved_entities
        WHERE regexp_replace(lower(coalesce(artist,'')||'|'||coalesce(title,'')), '[^a-z0-9|]', '', 'g') = ${fp}
        ORDER BY created_at ASC LIMIT 1
      `;
      if (byFp[0]?.id) entityId = byFp[0].id;
    }

    if (entityId) {
      const candidates = await sql`
        SELECT mc.thumbnail_url, mc.platform, mc.confidence, mc.candidate_url, em.matched_url
        FROM match_candidates mc
        LEFT JOIN entity_matches em ON (em.entity_id = mc.entity_id AND em.platform = mc.platform)
        WHERE mc.entity_id = ${entityId}
        ORDER BY 
          (CASE WHEN em.matched_url = mc.candidate_url THEN 1 ELSE 0 END) DESC,
          mc.confidence DESC,
          (CASE WHEN mc.platform = 'apple_music' THEN 1 WHEN mc.platform = 'spotify' THEN 2 ELSE 3 END) ASC,
          mc.rank ASC
      `;

      if (!videoId) {
        const ytCandidate = candidates.find((c) => c.platform === 'youtube' && c.candidate_url);
        if (ytCandidate?.candidate_url) {
          const match = ytCandidate.candidate_url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
          if (match) videoId = match[1];
        }
      }

      for (const cand of candidates) {
        if (!cand.thumbnail_url) continue;

        if (cand.platform === 'apple_music') {
          imageUrl = cand.thumbnail_url.replace(/\d+x\d+bb/, '1200x1200bb');
          imageWidth = 1200;
          imageHeight = 1200;
          break;
        } else if (cand.platform === 'spotify') {
          imageUrl = cand.thumbnail_url;
          imageWidth = 640;
          imageHeight = 640;
          break;
        } else if (cand.platform === 'youtube' && !imageUrl) {
          const m = cand.candidate_url?.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
          const ytId = m ? m[1] : videoId;
          if (ytId) {
            imageUrl = `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`;
            imageWidth = 1280;
            imageHeight = 720;
          } else {
            imageUrl = cand.thumbnail_url;
            imageWidth = 480;
            imageHeight = 360;
          }
        }
      }
    }

    // Fast inline fallback: if no artwork in DB yet, query iTunes Search for instant 1200px artwork
    if (!imageUrl && (artist || title)) {
      const term = artist && artist !== 'Unknown Artist' ? `${artist} ${title || ''}`.trim() : (title || '').trim();
      if (term) {
        const itunesRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song,album&limit=1`,
          { signal: AbortSignal.timeout(2000) }
        ).then(r => r.json()).catch(() => null);

        if (itunesRes?.results?.[0]?.artworkUrl100) {
          imageUrl = itunesRes.results[0].artworkUrl100.replace(/\d+x\d+bb/, '1200x1200bb');
          imageWidth = 1200;
          imageHeight = 1200;
        }
      }
    }
  } catch (err) {
    console.error('Error in resolveBestMediaMetadata:', err);
  }

  if (!imageUrl && videoId) {
    imageUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    imageWidth = 1280;
    imageHeight = 720;
  }

  return { imageUrl, imageWidth, imageHeight, videoId: videoId || null };
}
