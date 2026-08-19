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

export function cleanYouTubeTitle(raw: string): string {
  let cleaned = decodeHtmlEntities(raw);
  cleaned = normalizeBrackets(cleaned);
  cleaned = stripNoiseTags(cleaned);
  cleaned = repairUnmatchedBrackets(cleaned);
  return cleaned.replace(/^[-|:,]\s*/, '').replace(/\s*[-|:,]$/, '').trim();
}

export function parseYouTubeTitle(rawTitle: string, channelName?: string): { artist: string | null; title: string } {
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
