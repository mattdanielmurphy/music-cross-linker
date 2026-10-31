import { describe, expect, test } from 'bun:test';
import { buildTrackPath, coreTitle, coreTitleSlug, cleanAppleUrl, isAlbumUrl, normalizeSegment, slugify } from './slugify';

describe('slugify', () => {
  test.each([
    ['Karma Police', 'karma-police'],
    ["Don't Stop Me Now", 'dont-stop-me-now'],
    ['Beyoncé', 'beyonce'],
    ['Sigur Rós', 'sigur-ros'],
    ['AC/DC', 'ac-dc'],
    ['R.E.M.', 'r-e-m'],
    ['Simon & Garfunkel', 'simon-and-garfunkel'],
    ['What’s Going On (2003 Remaster)', 'whats-going-on-2003-remaster'],
    ['坂本龍一', '坂本龍一'],
  ])('%s', (input: string, expected: string) => expect(slugify(input)).toBe(expected));
});

test('segments normalize from encoded or raw input', () => {
  expect(normalizeSegment('OK%20Computer')).toBe('ok-computer');
  expect(normalizeSegment('AC%2FDC')).toBe('ac-dc');
  expect(normalizeSegment('Beyonc%C3%A9')).toBe('beyonce');
  expect(normalizeSegment('100%')).toBe('100');
});

test('buildTrackPath uses single when album is unknown', () => {
  expect(buildTrackPath('Kate Bush', 'Hounds of Love', 'Hounds of Love')).toBe('kate-bush/hounds-of-love/hounds-of-love');
  expect(buildTrackPath('Kate Bush', null, 'Cloudbusting')).toBe('kate-bush/single/cloudbusting');
});

test('Apple song links are not albums and keep their track id', () => {
  const song = 'https://music.apple.com/ca/album/karma-police/1097861387?i=1097861824&uo=4';
  expect(cleanAppleUrl(song)).toBe('https://music.apple.com/ca/album/karma-police/1097861387?i=1097861824');
  expect(isAlbumUrl(cleanAppleUrl(song))).toBe(false);
  expect(isAlbumUrl('https://music.apple.com/ca/album/ok-computer/1097861387?uo=4')).toBe(true);
});

test('coreTitle removes features and remaster tails but keeps real titles', () => {
  expect(coreTitle('Loving Is Easy Feat Benny Sings')).toBe('Loving Is Easy');
  expect(coreTitle('Loving Is Easy (feat. Benny Sings)')).toBe('Loving Is Easy');
  expect(coreTitle('Here Comes the Sun - Remastered 2009')).toBe('Here Comes the Sun');
  expect(coreTitle('Featuring Nobody')).toBe('Featuring Nobody');
  expect(coreTitle('Lift Off')).toBe('Lift Off');
  expect(coreTitleSlug('we-will-rock-you-remastered-2011')).toBe('we-will-rock-you');
  expect(coreTitleSlug('get-lucky-feat-pharrell-williams')).toBe('get-lucky');
});
