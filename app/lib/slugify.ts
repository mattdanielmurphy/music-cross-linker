/**
 * Link slug rules (shared with Glass TV's X-ray — keep them in sync):
 * lowercase, accents removed, apostrophes dropped, "&" becomes "and", and every
 * other run of non-letters/digits becomes one hyphen. Non-Latin letters stay.
 */
export function slugify(text: string) {
  return text
    .toString()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Album segment used in /artist/album/track when a song has no known album. */
export const NO_ALBUM_SLUG = 'single';

export function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Accepts raw or URL-encoded names, so any spelling of a path lands on one slug. */
export function normalizeSegment(segment: string) {
  return slugify(safeDecode(segment));
}

export function buildTrackPath(artist: string, album: string | null | undefined, title: string) {
  return `${slugify(artist)}/${(album && slugify(album)) || NO_ALBUM_SLUG}/${slugify(title)}`;
}

/** Apple song links are /album/<name>/<id>?i=<trackId>: an album path that is really a song. */
export function isAlbumUrl(url: string | null | undefined) {
  return !!url && url.includes('/album/') && !/[?&]i=\d/.test(url);
}

/** Strips tracking params from an Apple URL but keeps ?i=, which identifies the song. */
export function cleanAppleUrl(url: string) {
  const [base, query] = url.split('?');
  const trackId = new URLSearchParams(query || '').get('i');
  return trackId ? `${base}?i=${trackId}` : base;
}

const FEATURE_TAIL = /\s*[(\[]?\b(?:feat\.?|ft\.?|featuring)\s.*$/i;
const VERSION_TAIL = /\s+[-–—]\s+(?:(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?|radio edit|single version|album version|mono|stereo)\s*$/i;
const BARE_REMASTER_TAIL = /\s+(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?$/i;

/** Reduces a song title to the name stores list: no featured artists or remaster/edit tails. */
export function coreTitle(title: string) {
  return title.replace(FEATURE_TAIL, '').replace(VERSION_TAIL, '').replace(BARE_REMASTER_TAIL, '').trim() || title;
}

/** Same as coreTitle, but on a slug such as loving-is-easy-feat-benny-sings. */
export function coreTitleSlug(slug: string) {
  return slugify(coreTitle(slug.replace(/-/g, ' ')));
}

const VERSION_WORDS = /\b(live|remix|mix|acoustic|demo|instrumental|karaoke|edit|rehearsal|session|commentary|version)\b/i;

/** True for alternate takes, so the plain studio song wins when the request names no version. */
export function isAlternateVersion(title: string) {
  return VERSION_WORDS.test(title);
}
