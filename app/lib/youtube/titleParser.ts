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
    /\((lyric video|visualizer|full album|full album stream|hq|hd|4k|1080p|lyrics|audio|explicit|clean|deluxe edition)\)/gi,
    /\(remastered.*?\)/gi,
    /\(\d{4} remaster\)/gi,
    /\[official (video|music video|audio|lyric video|hd video)\]/gi,
    /\[(lyric video|visualizer|full album|full album stream|hq|hd|4k|1080p|lyrics|audio|explicit|clean|deluxe edition)\]/gi,
    /\[remastered.*?\]/gi,
    /\[\d{4} remaster\]/gi,
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
