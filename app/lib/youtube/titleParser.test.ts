import { describe, it, expect } from 'bun:test';
import {
  decodeHtmlEntities,
  stripNoiseTags,
  repairUnmatchedBrackets,
  parseYouTubeTitle,
  normalizeBrackets,
  cleanYouTubeTitle,
  buildPageTitle,
  buildPageDescription,
  formatSlug,
  parseMusicTitle,
  extractVideoId,
  parseSpotifyTitle,
} from './titleParser';

describe('YouTube title parsing', () => {
  it('decodes HTML entities', () => {
    expect(decodeHtmlEntities('Led Zeppelin &amp; Friends')).toBe(
      'Led Zeppelin & Friends'
    );
  });

  it('strips noise tags', () => {
    expect(
      stripNoiseTags('Led Zeppelin - Physical Graffiti (Full Album) [Official Video]')
    ).toBe('Led Zeppelin - Physical Graffiti');
  });

  it('repairs unmatched parens', () => {
    expect(repairUnmatchedBrackets('Led Zeppelin - Physical Graffiti (')).toBe(
      'Led Zeppelin - Physical Graffiti'
    );
  });

  it('handles user reported problem case (Physical Graffiti with trailing (Full Album) [Official Video])', () => {
    const { artist, title } = parseYouTubeTitle(
      'Led Zeppelin - Physical Graffiti (Full Album) [Official Video]'
    );
    expect(artist).toBe('Led Zeppelin');
    expect(title).toBe('Physical Graffiti');
  });

  it('verifies Physical Graffiti ( parsing issue', () => {
    const { artist, title } = parseYouTubeTitle(
      'Led Zeppelin - Physical Graffiti (Full Album) [Official Video]'
    );
    expect(artist).toBe('Led Zeppelin');
    expect(title).toBe('Physical Graffiti');
  });

  it('splits spaced hyphens', () => {
    const { artist, title } = parseYouTubeTitle(
      'Led Zeppelin - Physical Graffiti'
    );
    expect(artist).toBe('Led Zeppelin');
    expect(title).toBe('Physical Graffiti');
  });

  it('preserves hyphenated artist name', () => {
    const { artist, title } = parseYouTubeTitle('AC-DC - Highway to Hell');
    expect(artist).toBe('AC-DC');
    expect(title).toBe('Highway to Hell');
  });

  it('normalizes CJK brackets', () => {
    const cleaned = cleanYouTubeTitle('【Official Video】 Pink Floyd - Time');
    expect(cleaned).toBe('Pink Floyd - Time');
  });

  it('parses topic channel', () => {
    const { artist, title } = parseYouTubeTitle(
      'Physical Graffiti',
      'Led Zeppelin - Topic'
    );
    expect(artist).toBe('Led Zeppelin');
    expect(title).toBe('Physical Graffiti');
  });

  it('cleans seamless transitions and full album', () => {
    expect(
      cleanYouTubeTitle('Ravedeath 1972 (Seamless transitions) Full album')
    ).toBe('Ravedeath 1972');
  });

  it('parses Tim Hecker - Ravedeath 1972 (Seamless transitions) Full album', () => {
    const { artist, title } = parseYouTubeTitle(
      'Tim Hecker - Ravedeath 1972 (Seamless transitions) Full album'
    );
    expect(artist).toBe('Tim Hecker');
    expect(title).toBe('Ravedeath 1972');
  });

  it('removes unparenthesized Full album', () => {
    expect(cleanYouTubeTitle('Artist - Title Full album')).toBe(
      'Artist - Title'
    );
  });
});

describe('Page Title & Share Metadata Formatting', () => {
  it('formats artist and track title as "Artist - Title | Multilink"', () => {
    expect(buildPageTitle('Daniel Lanois', 'Belladonna')).toBe(
      'Daniel Lanois - Belladonna | Multilink'
    );
    expect(buildPageTitle('Daft Punk', 'Alive 2007')).toBe(
      'Daft Punk - Alive 2007 | Multilink'
    );
    expect(buildPageTitle('Pink Floyd', 'Dark Side of the Moon')).toBe(
      'Pink Floyd - Dark Side of the Moon | Multilink'
    );
  });

  it('strips noise tags from title before building page title', () => {
    expect(
      buildPageTitle('Led Zeppelin', 'Physical Graffiti (Full Album) [Official Video]')
    ).toBe('Led Zeppelin - Physical Graffiti | Multilink');
  });

  it('handles single item / missing artist as "Title | Multilink"', () => {
    expect(buildPageTitle(null, 'Belladonna')).toBe('Belladonna | Multilink');
    expect(buildPageTitle('', 'Alive 2007')).toBe('Alive 2007 | Multilink');
    expect(buildPageTitle('Unknown Artist', 'Belladonna')).toBe(
      'Belladonna | Multilink'
    );
  });

  it('formats page description for single item and artist-track', () => {
    expect(buildPageDescription('Daniel Lanois', 'Belladonna')).toBe(
      'Listen to Belladonna by Daniel Lanois on YouTube, Spotify, and Apple Music.'
    );
    expect(buildPageDescription(null, 'Belladonna')).toBe(
      'Listen to Belladonna on YouTube, Spotify, and Apple Music.'
    );
  });

  it('formats slug components into capitalized words', () => {
    expect(formatSlug('daniel-lanois')).toBe('Daniel Lanois');
    expect(formatSlug('alive-2007')).toBe('Alive 2007');
    expect(formatSlug('dark-side-of-the-moon')).toBe('Dark Side Of The Moon');
  });

  it('parses music title formats and extracts year', () => {
    expect(parseMusicTitle('Pink Floyd - Time')).toEqual({
      primary: 'Pink Floyd',
      secondary: 'Time',
      year: null,
    });
    expect(parseMusicTitle('Tim Hecker - Ravedeath 1972 (2011)')).toEqual({
      primary: 'Tim Hecker',
      secondary: 'Ravedeath 1972',
      year: '2011',
    });
    expect(parseMusicTitle('Artist "Song Title" (1999)')).toEqual({
      primary: 'Artist',
      secondary: 'Song Title',
      year: '1999',
    });
  });

  it('extracts YouTube video IDs from various URL formats', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('Spotify title parsing & cleaning', () => {
  it('parses Spotify album titles into clean title and artist', () => {
    expect(parseSpotifyTitle('Belladonna - Album by Daniel Lanois | Spotify')).toEqual({
      title: 'Belladonna',
      artist: 'Daniel Lanois',
      type: 'album',
    });
    expect(parseSpotifyTitle('Selected Ambient Works 85-92 - Album by Aphex Twin | Spotify')).toEqual({
      title: 'Selected Ambient Works 85-92',
      artist: 'Aphex Twin',
      type: 'album',
    });
    expect(parseSpotifyTitle('1 (Remastered) - Compilation by The Beatles | Spotify')).toEqual({
      title: '1 (Remastered)',
      artist: 'The Beatles',
      type: 'compilation',
    });
    expect(parseSpotifyTitle('Stay - Single by The Kid LAROI, Justin Bieber | Spotify')).toEqual({
      title: 'Stay',
      artist: 'The Kid LAROI, Justin Bieber',
      type: 'single',
    });
  });

  it('parses Spotify song titles into clean title and artist', () => {
    expect(parseSpotifyTitle('Never Gonna Give You Up - song and lyrics by Rick Astley | Spotify')).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      type: 'track',
    });
    expect(parseSpotifyTitle('Shape of You - song by Ed Sheeran | Spotify')).toEqual({
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      type: 'track',
    });
  });

  it('cleans Spotify title string with cleanYouTubeTitle', () => {
    expect(cleanYouTubeTitle('Belladonna - Album by Daniel Lanois | Spotify')).toBe('Belladonna');
    expect(cleanYouTubeTitle('Never Gonna Give You Up - song and lyrics by Rick Astley | Spotify')).toBe(
      'Never Gonna Give You Up'
    );
    expect(cleanYouTubeTitle('Rock - Album by Tiny Tim | Spotify')).toBe('Rock');
  });

  it('parses Spotify titles via parseMusicTitle', () => {
    expect(parseMusicTitle('Belladonna - Album by Daniel Lanois | Spotify')).toEqual({
      primary: 'Daniel Lanois',
      secondary: 'Belladonna',
      year: null,
    });
  });
});

describe('Music Metadata & Remaster Parsing', () => {
  it('parses In my life (Remastered 2009) with channel The Beatles - Topic', () => {
    const { parseMusicMetadata } = require('./titleParser');
    const meta = parseMusicMetadata('In my life (Remastered 2009)', 'The Beatles - Topic');
    expect(meta.cleanArtist).toBe('The Beatles');
    expect(meta.cleanTitle).toBe('In my life');
    expect(meta.year).toBe('2009');
    expect(meta.isRemaster).toBe(true);
    expect(meta.isOuttake).toBe(false);
  });

  it('detects outtakes and demos properly', () => {
    const { parseMusicMetadata } = require('./titleParser');
    const meta = parseMusicMetadata('In My Life (Take 1 / Anthologized)');
    expect(meta.isOuttake).toBe(true);
  });
});