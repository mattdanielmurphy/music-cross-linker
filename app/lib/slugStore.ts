import fs from 'fs';
import path from 'path';
import os from 'os';
import { slugify } from './slugify';

const isVercel = process.env.VERCEL === '1';
const DATA_PATH = isVercel 
  ? path.join(os.tmpdir(), 'slugs.json')
  : path.join(process.cwd(), 'tmp', 'slugs.json');

interface SlugRecord {
  slug: string;
  targetUrl: string;
  artistName: string;
  title: string;
  videoId?: string;
}

function ensureDataFile() {
  if (!fs.existsSync(path.dirname(DATA_PATH))) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  }
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({}));
  }
}

function getStore(): Record<string, SlugRecord> {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, SlugRecord>) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

/** Normalize for loose artist+title matching across sources (case/punctuation-insensitive). */
function fingerprint(artistName: string, title: string): string {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${norm(artistName)}|${norm(title)}`;
}

export function getSlugForUrl(targetUrl: string, title: string, artistName: string, videoId?: string): string {
  const store = getStore();

  const targetSlug = artistName 
    ? `${slugify(artistName)}/${slugify(title)}` 
    : slugify(title);

  const fp = artistName ? fingerprint(artistName, title) : null;

  // Check if targetUrl (or the same underlying artist/title, or the same video)
  // already exists in the store — this is what lets any previously-seen match
  // link (AM, Spotify, YouTube, or a manually typed slug) for an album/track
  // converge on the same cached slug instead of re-resolving from scratch.
  for (const [existingKey, record] of Object.entries(store)) {
    const sameTarget = record.targetUrl === targetUrl;
    const sameVideo = !!videoId && record.videoId === videoId;
    const sameEntity = !!fp && !!record.artistName && fingerprint(record.artistName, record.title) === fp;

    if (sameTarget || sameVideo || sameEntity) {
      // HEAL CACHE: If the stored record had an empty artist but we now have one, overwrite it!
      if (!record.artistName && artistName) {
        delete store[existingKey]; // Remove stale 'belladonna' key
        const updatedRecord: SlugRecord = {
          slug: targetSlug,
          targetUrl,
          artistName,
          title,
          videoId,
        };
        store[targetSlug] = updatedRecord;
        saveStore(store);
        return targetSlug;
      }
      return record.slug;
    }
  }

  let baseSlug = targetSlug;
  let uniqueSlug = baseSlug;
  let counter = 0;

  while (store[uniqueSlug]) {
    if (store[uniqueSlug].targetUrl === targetUrl) {
      return uniqueSlug;
    }
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }

  const newRecord: SlugRecord = {
    slug: uniqueSlug,
    targetUrl,
    artistName,
    title,
    videoId,
  };

  store[uniqueSlug] = newRecord;
  saveStore(store);

  return uniqueSlug;
}

export function getRecordBySlug(slug: string): SlugRecord | null {
  const store = getStore();
  return store[slug] || null;
}

export function findRecordByTargetUrlOrVideo(targetUrl?: string | null, videoId?: string | null): SlugRecord | null {
  const store = getStore();
  if (!targetUrl && !videoId) return null;
  for (const record of Object.values(store)) {
    if (targetUrl && record.targetUrl === targetUrl) return record;
    if (videoId && record.videoId === videoId) return record;
  }
  return null;
}
