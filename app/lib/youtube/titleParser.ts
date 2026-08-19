export function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&#39;': "'",
    '&quot;': '"',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
  };
  return text.replace(/&amp;|&#39;|&quot;|&lt;|&gt;|&nbsp;/g, (m) => entities[m] || m);
}

export function normalizeBrackets(text: string): string {
  return text
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/［/g, '[')
    .replace(/］/g, ']');
}

export function stripNoiseTags(text: string): string {
  const noisePatterns = [
    /\(official (video|music video|audio|lyric video|hd video)\)/gi,
    /\((lyric video|visualizer|full album|full album stream|full album audio|full album playlist|hq|hd|4k|1080p|lyrics|audio|explicit|clean|deluxe edition)\)/gi,
    /\(remastered.*?\)/gi,
    /\(\d{4} remaster\)/gi,
    /\[official (video|music video|audio|lyric video|hd video)\]/gi,
    /\[(lyric video|visualizer|full album|full album stream|full album audio|full album playlist|hq|hd|4k|1080p|lyrics|audio|explicit|clean|deluxe edition)\]/gi,
    /\[remastered.*?\]/gi,
    /\[\d{4} remaster\]/gi,
    /\b(full album|full album stream|full album audio|full album playlist)\b/gi,
    /\(seamless transitions?\)/gi,
    /\bseamless transitions?\b/gi,
  ];

  let result = text;
  let previous: string;
  do {
    previous = result;
    for (const pattern of noisePatterns) {
      result = result.replace(pattern, '');
    }
  } while (result !== previous);

  return result.trim().replace(/\s+/g, ' ');
}

export interface MusicMetadata {
  cleanArtist: string | null;
  cleanTitle: string;
  year: string | null;
  versionTag: string | null;
  isRemaster: boolean;
  isMix: boolean;
  isLive: boolean;
  isOuttake: boolean;
  albumHint: string | null;
}

export function parseMusicMetadata(rawTitle: string, channelName?: string): MusicMetadata {
  const decoded = decodeHtmlEntities(rawTitle || '');
  const normalized = normalizeBrackets(decoded);

  let year: string | null = null;
  const yearMatch = normalized.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  const isRemaster = /\b(remastered?|remaster)\b/i.test(normalized);
  const isMix = /\b(mix|remix|stereo|mono)\b/i.test(normalized);
  const isLive = /\b(live|concert|session|acoustic)\b/i.test(normalized) && !/\b(acoustic tribute)\b/i.test(normalized);
  const isOuttake = /\b(take\s*\d+|demo|outtake|tribute|karaoke|instrumental cover|cover)\b/i.test(normalized);

  let versionTag: string | null = null;
  const versionMatch = normalized.match(/[\(\[](?:[^\)\]]*?\b(remastered?|mix|take\s*\d+|demo|outtake|live|mono|stereo)\b[^\)\]]*?)[\)\]]/i);
  if (versionMatch) {
    versionTag = versionMatch[0].replace(/^[\(\[]|[\)\]]$/g, '').trim();
  }

  let parsed = parseYouTubeTitle(rawTitle, channelName);

  let cleanArtist = parsed.artist;
  if (cleanArtist) {
    cleanArtist = cleanArtist
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .replace(/\s*(Official|Music|Video|Channel)\s*$/i, '')
      .trim();
  }

  let cleanTitle = parsed.title;

  return {
    cleanArtist: cleanArtist || null,
    cleanTitle,
    year,
    versionTag,
    isRemaster,
    isMix,
    isLive,
    isOuttake,
    albumHint: null,
  };
}

export function repairUnmatchedBrackets(text: string): string {
  let openCount = 0;
  let cleaned = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '[') openCount++;
    else if (char === ')' || char === ']') {
      if (openCount > 0) openCount--;
      else continue;
    }
    cleaned += char;
  }
  return cleaned.replace(/[(\[]+$/, '').trim();
}

export function parseSpotifyTitle(raw: string): {
  title: string;
  artist: string | null;
  type: 'album' | 'single' | 'ep' | 'compilation' | 'track' | null;
} {
  let cleaned = decodeHtmlEntities(raw || '').trim();
  cleaned = cleaned.replace(/\s*\|\s*Spotify$/i, '').trim();

  // Pattern 1: "<Title> - (Album|Single|EP|Compilation) by <Artist>"
  const albumTypeMatch = cleaned.match(/^(.*?)\s*[-–—]\s*(album|single|ep|compilation)\s+by\s+(.*)$/i);
  if (albumTypeMatch) {
    const rawType = albumTypeMatch[2].toLowerCase();
    const type = (rawType === 'album' || rawType === 'single' || rawType === 'ep' || rawType === 'compilation')
      ? rawType
      : 'album';
    return {
      title: albumTypeMatch[1].trim(),
      artist: albumTypeMatch[3].trim(),
      type,
    };
  }

  // Pattern 2: "<Title> - song (and lyrics)? by <Artist>" or "<Title> - track by <Artist>"
  const songMatch = cleaned.match(/^(.*?)\s*[-–—]\s*(?:song(?:\s+and\s+lyrics)?|track)\s+by\s+(.*)$/i);
  if (songMatch) {
    return {
      title: songMatch[1].trim(),
      artist: songMatch[2].trim(),
      type: 'track',
    };
  }

  // Pattern 3: "<Title> by <Artist>"
  const byMatch = cleaned.match(/^(.*?)\s+by\s+(.*)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
      type: null,
    };
  }

  return {
    title: cleaned,
    artist: null,
    type: null,
  };
}

export function cleanYouTubeTitle(raw: string): string {
  let cleaned = decodeHtmlEntities(raw || '');
  cleaned = normalizeBrackets(cleaned);
  cleaned = stripNoiseTags(cleaned);
  cleaned = repairUnmatchedBrackets(cleaned);
  if (cleaned.includes('Spotify') || /[-–—]\s*(?:album|single|ep|compilation|song|track)\s+by/i.test(cleaned)) {
    cleaned = parseSpotifyTitle(cleaned).title;
  }
  return cleaned.replace(/^[-|:,]\s*/, '').replace(/\s*[-|:,]$/, '').trim();
}

export function parseYouTubeTitle(rawTitle: string, channelName?: string): { artist: string | null; title: string } {
  if (rawTitle && (rawTitle.includes('Spotify') || /[-–—]\s*(?:album|single|ep|compilation|song|track)\s+by/i.test(rawTitle))) {
    const spotify = parseSpotifyTitle(rawTitle);
    if (spotify.artist && spotify.title) {
      return {
        artist: spotify.artist,
        title: cleanYouTubeTitle(spotify.title),
      };
    }
  }

  const cleaned = cleanYouTubeTitle(rawTitle);
  let artist: string | null = null;
  let title = cleaned;

  if (channelName && channelName.endsWith(' - Topic')) {
    artist = channelName.replace(' - Topic', '');
  }

  const parts = cleaned.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    artist = parts[0];
    title = parts.slice(1).join(' - ');
  } else if (cleaned.includes('"') || cleaned.includes('“')) {
    const match = cleaned.match(/^(.*?)\s*["“](.*?)["”]/);
    if (match) {
      artist = match[1];
      title = match[2];
    }
  }

  return {
    artist: artist ? artist.trim().replace(/^["“'”]|["“'”]$/g, '') : null,
    title: title.trim().replace(/^["“'”]|["“'”]$/g, ''),
  };
}

export async function getChromeAIAvailability(): Promise<'available' | 'unavailable'> {
  if (typeof self === 'undefined') return 'unavailable';
  const globalAny = self as any;
  const LM = globalAny.LanguageModel ?? globalAny.ai?.languageModel;
  if (!LM) return 'unavailable';

  try {
    if (typeof LM.availability === 'function') {
      const status = await LM.availability();
      return status === 'available' ? 'available' : 'unavailable';
    }
    if (typeof LM.capabilities === 'function') {
      const cap = await LM.capabilities();
      return cap.available === 'readily' ? 'available' : 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}

export async function parseYouTubeTitleHybrid(rawTitle: string, channelName?: string): Promise<{ artist: string | null; title: string }> {
  const cleaned = cleanYouTubeTitle(rawTitle);
  if (typeof self !== 'undefined' && (await getChromeAIAvailability()) === 'available') {
    let session: any = null;
    try {
      const globalAny = self as any;
      const LM = globalAny.LanguageModel ?? globalAny.ai?.languageModel;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);

      session = await LM.create({
        systemPrompt: 'Extract artist and title from YouTube video title. Return JSON object with keys "artist" and "title".',
        responseConstraint: {
          type: 'object',
          properties: {
            artist: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['title'],
        },
      });

      const resultText = await session.prompt(cleaned, { signal: controller.signal });
      clearTimeout(timeout);
      const parsed = JSON.parse(resultText);
      if (parsed && typeof parsed.title === 'string') {
        return {
          artist: parsed.artist || (channelName && channelName.endsWith(' - Topic') ? channelName.replace(' - Topic', '') : null),
          title: parsed.title,
        };
      }
    } catch (e) {
      console.warn('AI Parsing failed, falling back to regex:', e);
    } finally {
      if (session && typeof session.destroy === 'function') {
        session.destroy();
      }
    }
  }

  return parseYouTubeTitle(rawTitle, channelName);
}

/** Extract year (4-digit) from a string, return { text, year } */
export function extractYear(s: string): { text: string; year: string | null } {
  const m = s.match(/\s*[\(\[\-]?\s*(\d{4})\s*[\)\]]?\s*$/);
  if (m && parseInt(m[1]) >= 1900 && parseInt(m[1]) <= 2100) {
    return { text: s.slice(0, m.index).trim(), year: m[1] };
  }
  return { text: s, year: null };
}

/** Strip noise (feat., remaster, official, etc.) but NOT year (handled separately) */
export function cleanSegment(s: string): string {
  return s
    .replace(/\s*(feat\.?.*|ft\.?.*|remaster(ed)?|official.*|audio.*|video.*|lyrics?)\s*$/i, '')
    .replace(/["\u201C\u201D'\[\]]/g, '')
    .trim();
}

/**
 * Format a slug component (e.g. 'daniel-lanois', 'alive-2007') into title case.
 */
export function formatSlug(slug: string): string {
  return decodeURIComponent(slug)
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Try to split a music title into { primary, secondary, year }.
 * Handles: "Artist - Title", "Artist: Title", "Title | Artist",
 *          'Artist "Title" (Year)', "Artist — Title", "Artist ~ Title"
 * Returns null if no recognisable pattern found.
 */
export function parseMusicTitle(title: string): { primary: string; secondary: string; year: string | null } | null {
  if (title && (title.includes('Spotify') || /[-–—]\s*(?:album|single|ep|compilation|song|track)\s+by/i.test(title))) {
    const spotify = parseSpotifyTitle(title);
    if (spotify.artist && spotify.title) {
      return {
        primary: spotify.artist,
        secondary: spotify.title,
        year: null,
      };
    }
  }

  const seps = [' - ', ' \u2013 ', ' \u2014 ', ' | ', ': ', ' ~ '];
  for (const sep of seps) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      const rawLeft = title.slice(0, idx);
      const rawRight = title.slice(idx + sep.length);
      // Extract year from whichever side has it
      const { text: rightClean, year: rightYear } = extractYear(rawRight);
      const { text: leftClean, year: leftYear } = extractYear(rawLeft);
      const year = rightYear || leftYear || null;
      const left = cleanSegment(leftClean);
      const right = cleanSegment(rightClean);
      if (left && right) return { primary: left, secondary: right, year };
    }
  }
  // Pattern: Artist "Title" (Year) or Artist "Title"
  const quotedMatch = title.match(/^(.+?)\s+["\u201C](.+?)["\u201D](.*)$/);
  if (quotedMatch) {
    const { year: remainderYear } = extractYear(quotedMatch[3] || '');
    const { text: rightClean, year: titleYear } = extractYear(quotedMatch[2]);
    const year = remainderYear || titleYear || null;
    return { primary: cleanSegment(quotedMatch[1]), secondary: cleanSegment(rightClean), year };
  }
  return null;
}

/**
 * Builds the page and share title in the format "Artist - Album/Track | Multilink"
 */
export function buildPageTitle(artist?: string | null, track?: string | null): string {
  const cleanTrack = track ? cleanYouTubeTitle(track) : '';
  const cleanArt = artist ? cleanYouTubeTitle(artist) : '';
  const hasArtist = Boolean(cleanArt && cleanArt.toLowerCase() !== 'unknown artist');

  if (hasArtist && cleanTrack) {
    return `${cleanArt} - ${cleanTrack} | Multilink`;
  }
  if (cleanTrack) {
    return `${cleanTrack} | Multilink`;
  }
  if (hasArtist) {
    return `${cleanArt} | Multilink`;
  }
  return 'Multilink - Universal Music Links';
}

/**
 * Builds the page description for OpenGraph/Twitter sharing.
 */
export function buildPageDescription(artist?: string | null, track?: string | null): string {
  const cleanTrack = track ? cleanYouTubeTitle(track) : '';
  const cleanArt = artist ? cleanYouTubeTitle(artist) : '';
  const hasArtist = Boolean(cleanArt && cleanArt.toLowerCase() !== 'unknown artist');

  if (hasArtist && cleanTrack) {
    return `Listen to ${cleanTrack} by ${cleanArt} on YouTube, Spotify, and Apple Music.`;
  }
  if (cleanTrack) {
    return `Listen to ${cleanTrack} on YouTube, Spotify, and Apple Music.`;
  }
  return 'Search and cross-link tracks across YouTube, Spotify, and Apple Music.';
}

/**
 * Extracts an 11-character YouTube video ID from various YouTube URL formats.
 */
export function extractVideoId(str?: string | null): string | null {
  if (!str) return null;
  const m =
    str.match(/[?&]v=([\w-]{11})/) ||
    str.match(/youtu\.be\/([\w-]{11})/) ||
    str.match(/\/shorts\/([\w-]{11})/) ||
    str.match(/\/embed\/([\w-]{11})/);
  return m ? m[1] : null;
}
