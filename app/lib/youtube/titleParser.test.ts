import { describe, it, expect } from 'bun:test';
import {
  decodeHtmlEntities,
  stripNoiseTags,
  repairUnmatchedBrackets,
  parseYouTubeTitle,
  normalizeBrackets,
  cleanYouTubeTitle,
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