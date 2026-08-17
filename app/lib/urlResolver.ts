import sql from './db';
import * as cheerio from 'cheerio';
import { cleanYouTubeTitle, parseYouTubeTitle } from './youtube/titleParser';

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
  return s
    .toLowerCase()
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

function classifyMatch(
  candidateTitle: string | null | undefined,
  candidateArtist: string | null | undefined,
  title: string | null | undefined,
  artist: string | null | undefined
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
  }

  const artistUnknown = !normArtist;
  // Some sources (e.g. YouTube oEmbed) don't give us a separate artist field at
  // all, so in that case only, also credit a match if the artist name appears
  // in the candidate's title text itself (e.g. "Tiny Tim - Rock"). We don't
  // apply this when a structured artist field IS present (e.g. iTunes/Spotify)
  // since that field is authoritative and a title coincidentally containing
  // the artist's name (e.g. a compilation literally titled "Tiny Tim") would
  // otherwise produce false positives.
  const artistInTitle =
    candArtist.length === 0 &&
    !!normArtist &&
    new RegExp(`\\b${normArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(name);
  const artistMatch =
    !!normArtist &&
    ((candArtist.length > 0 && (candArtist.includes(normArtist) || normArtist.includes(candArtist))) || artistInTitle);

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

async function fetchSpotifyMetadata(url: string) {
  try {
    const html = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
    const $ = cheerio.load(html);
    const title = $('meta[property="og:title"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content') || '';
    const thumbnail_url = $('meta[property="og:image"]').attr('content') || null;

    let artist = null;
    const parts = description.split('·').map(s => s.trim());
    if (parts.length > 1) {
      artist = parts[0];
    }

    return { title, artist, thumbnail_url };
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
    const id = pathParts.find((part) => /^\d+$/.test(part) || part.startsWith('id'))?.replace('id', '');

    if (!id) return { title: null, artist: null, thumbnail_url: null };

    const lookup = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const item = lookup?.results?.[0];
    if (item) {
      return {
        title: item.collectionName || item.trackName || null,
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
  typeHint?: 'album' | 'track' | null
): Promise<EntityContext> {
  const countryCode = country.toUpperCase();
  const cleanArtistRaw = (artist || '').trim();
  const cleanTitleRaw = (title || '').trim();

  let cleanArtist = cleanArtistRaw;
  let cleanTitle = cleanTitleRaw;

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

  // 1. Try to find a matching URL directly among previously cached candidates —
  //    handles the case where the exact URL pasted was seen before as a *match*
  //    rather than the original source (e.g. we found this Spotify link while
  //    resolving a YouTube video previously).
  if (sourceUrl) {
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
  if (!entityId && fingerprint) {
    const byFingerprint = await sql`
      SELECT id FROM resolved_entities
      WHERE regexp_replace(lower(coalesce(artist,'')||'|'||coalesce(title,'')), '[^a-z0-9|]', '', 'g') = ${fingerprint}
      ORDER BY created_at ASC LIMIT 1
    `;
    if (byFingerprint[0]?.id) entityId = byFingerprint[0].id;
  }

  let canonicalTitle: string | null = null;
  let canonicalArtist: string | null = null;

  if (entityId) {
    if (!typeHint) {
      const albumMatch = await sql`SELECT entity_id FROM match_candidates WHERE entity_id = ${entityId} AND candidate_url LIKE '%/album/%' LIMIT 1`;
      if (albumMatch.length > 0) isAlbum = true;
    }

    const canonical = await sql`SELECT title, artist FROM match_candidates WHERE entity_id = ${entityId} AND title IS NOT NULL AND confidence = 1 ORDER BY rank ASC LIMIT 1`;
    if (canonical[0]) {
      canonicalTitle = canonical[0].title;
      canonicalArtist = canonical[0].artist;
    }

    if (!typeHint) {
      const matches = await sql`
        SELECT platform, matched_url, matched_by, uncertain FROM entity_matches WHERE entity_id = ${entityId}
      `;
      for (const m of matches) {
        cached[m.platform as Platform] = { url: m.matched_url, matched_by: m.matched_by, uncertain: !!m.uncertain };
      }
    }

    if (!isAlbum) {
      isAlbum = Object.values(cached).some((m) => m.url?.includes('/album/'));
    }
  } else {
    const inserted = await sql`
      INSERT INTO resolved_entities (source_url, source_platform, title, artist)
      VALUES (${sourceUrl || ''}, ${sourcePlatform}, ${cleanTitle}, ${cleanArtist})
      RETURNING id
    `;
    entityId = inserted[0].id;
  }

  if (typeHint === 'album') isAlbum = true;
  else if (typeHint === 'track') isAlbum = false;

  return { entityId: entityId as string, isAlbum, country: countryCode, sourcePlatform, cleanArtist, cleanTitle, searchTerm, cached, canonicalTitle, canonicalArtist, typeHint };
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

export interface PlatformResult {
  url: string;
  matchedBy: string | null;
  candidates: any[];
  /** True when the current match was manually picked and flagged "this isn't
   *  right, but it's the closest available". */
  uncertain?: boolean;
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
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' ORDER BY rank ASC`;
    return { url: sourceUrl, matchedBy: 'explicit', candidates, uncertain: false };
  }

  // Cache hit — reuse the previously auto/manually matched link for this entity.
  if (cached.apple_music) {
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' ORDER BY rank ASC`;
    return { url: cached.apple_music.url, matchedBy: cached.apple_music.matched_by, candidates, uncertain: cached.apple_music.url === sourceUrl || cached.apple_music.matched_by === 'explicit' ? false : cached.apple_music.uncertain };
  }

  let appleUrl = `https://music.apple.com/${country.toLowerCase()}/search?term=${encodeURIComponent(searchTerm)}`;
  const itunesSearch = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song,album&country=${country.toLowerCase()}&limit=5`)
    .then(r => r.json()).catch(() => null);

  let bestConfidence: Confidence = 'none';
  let bestCandidateId: string | null = null;

  if (itunesSearch?.results) {
    let rank = 1;
    for (const r of itunesSearch.results) {
      const rawUrl = r.trackViewUrl || r.collectionViewUrl;
      const candidateUrl = rawUrl ? rawUrl.split('?')[0] : null;
      if (candidateUrl) {
        const candTitle = r.trackName || r.collectionName;
        const confidence = classifyMatch(candTitle, r.artistName, cleanTitle, cleanArtist);
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
        } else if (confidence === 'low' && bestConfidence === 'none') {
          appleUrl = candidateUrl;
          bestConfidence = 'low';
          bestCandidateId = insertedRow[0].id;
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

  const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'apple_music' ORDER BY rank ASC`;
  return { url: appleUrl, matchedBy: bestConfidence === 'none' ? null : 'auto', candidates };
}

export async function resolveSpotifyPlatform(ctx: EntityContext, sourceUrl?: string): Promise<PlatformResult> {
  const { entityId, cleanTitle, cleanArtist, searchTerm, isAlbum: ctxIsAlbum, cached } = ctx;
  let isAlbum = ctxIsAlbum;

  if (ctx.sourcePlatform === 'spotify' && sourceUrl) {
    if (sourceUrl.includes('/album/')) isAlbum = true;
    const meta = await fetchSpotifyMetadata(sourceUrl);
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
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' ORDER BY rank ASC`;
    return { url: sourceUrl, matchedBy: 'explicit', candidates, uncertain: false };
  }

  if (cached.spotify) {
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' ORDER BY rank ASC`;
    return { url: cached.spotify.url, matchedBy: cached.spotify.matched_by, candidates, uncertain: cached.spotify.url === sourceUrl || cached.spotify.matched_by === 'explicit' ? false : cached.spotify.uncertain };
  }

  const result = await searchSpotifyViaSpotapi(searchTerm, isAlbum, cleanTitle, cleanArtist);
  let spotifyUrl: string;
  let matchedBy: string | null = null;
  if (result) {
    spotifyUrl = result.url;
    if (spotifyUrl.includes('/album/')) isAlbum = true;
    
    // Use metadata returned directly by SpotAPI to avoid ~2s HTML scraping overhead;
    // only fall back to scraping open.spotify.com if SpotAPI didn't return thumbnail
    const meta = (result.title || result.thumbnail_url)
      ? { title: result.title || cleanTitle, artist: result.artist || cleanArtist, thumbnail_url: result.thumbnail_url || null }
      : await fetchSpotifyMetadata(spotifyUrl);

    const inserted = await sql`
      INSERT INTO match_candidates (entity_id, platform, candidate_url, title, artist, thumbnail_url, rank, source, confidence)
      VALUES (${entityId}, 'spotify', ${spotifyUrl}, ${meta.title}, ${meta.artist}, ${meta.thumbnail_url}, 1, 'spotapi', ${confidenceToNumeric(result.confidence)})
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

  const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'spotify' ORDER BY rank ASC`;
  return { url: spotifyUrl, matchedBy, candidates };
}

export async function resolveYoutubePlatform(ctx: EntityContext, sourceUrl?: string): Promise<PlatformResult> {
  const { entityId, cleanTitle, cleanArtist, searchTerm, cached } = ctx;

  if (ctx.sourcePlatform === 'youtube' && sourceUrl) {
    let yTitle = null, yThumbnail = null;
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`).then(r => r.json());
      yTitle = cleanYouTubeTitle(oembed.title);
      yThumbnail = oembed.thumbnail_url;
    } catch (e) {}
    const existing = await sql`SELECT id FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' AND candidate_url = ${sourceUrl} LIMIT 1`;
    let candidateId = existing[0]?.id;
    if (!candidateId) {
      const inserted = await sql`
        INSERT INTO match_candidates (entity_id, platform, candidate_url, title, thumbnail_url, rank, source, confidence)
        VALUES (${entityId}, 'youtube', ${sourceUrl}, ${yTitle}, ${yThumbnail}, 1, 'explicit', 1)
        ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
          SET title = EXCLUDED.title, thumbnail_url = EXCLUDED.thumbnail_url, rank = 1, source = 'explicit', confidence = 1
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
      VALUES (${entityId}, 'youtube', ${sourceUrl}, 'auto', ${candidateId || null}, now(), false)
      ON CONFLICT (entity_id, platform) DO UPDATE
        SET matched_url = EXCLUDED.matched_url, matched_by = 'auto', candidate_id = EXCLUDED.candidate_id, updated_at = now(), uncertain = false
    `;
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY rank ASC`;
    return { url: sourceUrl, matchedBy: 'explicit', candidates, uncertain: false };
  }

  if (cached.youtube) {
    const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY rank ASC`;
    return { url: cached.youtube.url, matchedBy: cached.youtube.matched_by, candidates };
  }

  const query = `site:youtube.com ${searchTerm}`;
  const duckyUrl = `https://duckduckgo.com/?q=${encodeURIComponent(`!ducky ${query}`)}`;
  let youtubeUrl = '';
  let matchedBy: string | null = null;
  try {
    const html = await fetch(duckyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
    const match = html.match(/uddg=([^&']+)/);
    if (match) {
      const candidateUrl = decodeURIComponent(match[1]);
      if (candidateUrl.includes('youtube.com/watch') || candidateUrl.includes('youtu.be/')) {
        let yTitle: string | null = null, yThumbnail: string | null = null;
        try {
          const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(candidateUrl)}&format=json`).then(r => r.json());
          yTitle = cleanYouTubeTitle(oembed.title);
          yThumbnail = oembed.thumbnail_url;
        } catch (e) {}

        const confidence: Confidence = yTitle ? classifyMatch(yTitle, null, cleanTitle, cleanArtist) : 'low';

        const inserted = await sql`
          INSERT INTO match_candidates (entity_id, platform, candidate_url, title, thumbnail_url, rank, source, confidence)
          VALUES (${entityId}, 'youtube', ${candidateUrl}, ${yTitle}, ${yThumbnail}, 1, 'youtube_ducky', ${confidenceToNumeric(confidence)})
          ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE
            SET title = EXCLUDED.title, thumbnail_url = EXCLUDED.thumbnail_url, rank = EXCLUDED.rank, source = EXCLUDED.source, confidence = EXCLUDED.confidence
          RETURNING id
        `;

        if (confidence !== 'none') {
          youtubeUrl = candidateUrl;
          await saveAutoMatch(entityId, 'youtube', youtubeUrl, inserted[0].id);
          matchedBy = 'auto';
        }
      }
    }
    if (!youtubeUrl) throw new Error('No plausible YouTube result');
  } catch (e) {
    youtubeUrl = duckyUrl;
    await sql`
      INSERT INTO match_candidates (entity_id, platform, candidate_url, rank, source, confidence)
      VALUES (${entityId}, 'youtube', ${youtubeUrl}, 0, 'youtube_fallback', null)
      ON CONFLICT (entity_id, platform, candidate_url) DO NOTHING
    `;
  }

  const candidates = await sql`SELECT * FROM match_candidates WHERE entity_id = ${entityId} AND platform = 'youtube' ORDER BY rank ASC`;
  return { url: youtubeUrl, matchedBy, candidates };
}

/**
 * Convenience wrapper that resolves everything in parallel and returns the same
 * shape the old monolithic getPlatformLinks used to. Prefer using resolveEntity +
 * the individual resolve*Platform functions directly when you want independent
 * streaming/loading per platform (see TrackView).
 */
export async function getPlatformLinks(artist: string, title: string, country: string = 'CA', sourceUrl?: string) {
  const ctx = await resolveEntity(artist, title, country, sourceUrl);
  const [apple, spotify, youtube] = await Promise.all([
    resolveApplePlatform(ctx, sourceUrl),
    resolveSpotifyPlatform(ctx, sourceUrl),
    resolveYoutubePlatform(ctx, sourceUrl),
  ]);

  const overrides = await sql`SELECT platform, matched_url, matched_by FROM entity_matches WHERE entity_id = ${ctx.entityId}`;
  let appleUrl = apple.url, appleMatchedBy: string | null = apple.matchedBy;
  let spotifyUrl = spotify.url, spotifyMatchedBy: string | null = spotify.matchedBy;
  let youtubeUrl = youtube.url, youtubeMatchedBy: string | null = youtube.matchedBy;
  for (const override of overrides) {
    if (override.matched_by === 'manual') {
      if (override.platform === 'apple_music') { appleUrl = override.matched_url; appleMatchedBy = override.matched_by; }
      if (override.platform === 'spotify') { spotifyUrl = override.matched_url; spotifyMatchedBy = override.matched_by; }
      if (override.platform === 'youtube') { youtubeUrl = override.matched_url; youtubeMatchedBy = override.matched_by; }
    }
  }

  return {
    appleUrl,
    spotifyUrl,
    youtubeUrl,
    entityId: ctx.entityId,
    isAlbum: ctx.isAlbum,
    country: ctx.country,
    candidates: [...apple.candidates, ...spotify.candidates, ...youtube.candidates],
    matches: {
      apple_music: { url: appleUrl, matched_by: appleMatchedBy },
      spotify: { url: spotifyUrl, matched_by: spotifyMatchedBy },
      youtube: { url: youtubeUrl, matched_by: youtubeMatchedBy },
    },
  };
}
