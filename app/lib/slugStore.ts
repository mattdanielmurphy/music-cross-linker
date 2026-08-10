import fs from 'fs';
import path from 'path';
import { slugify } from './slugify';

const DATA_PATH = path.join(process.cwd(), 'tmp', 'slugs.json');

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
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

function saveStore(store: Record<string, SlugRecord>) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

export function getSlugForUrl(targetUrl: string, title: string, artistName: string, videoId?: string): string {
  const store = getStore();

  // Check if URL or videoId (if exists) already has a slug
  for (const record of Object.values(store)) {
    if (record.targetUrl === targetUrl || (videoId && record.videoId === videoId)) {
      return record.slug;
    }
  }

  let baseSlug = slugify(title);
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
