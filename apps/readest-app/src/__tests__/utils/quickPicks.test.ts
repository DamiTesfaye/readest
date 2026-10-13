import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUICK_PICKS,
  QUICK_PICK_DRAG_TYPE,
  QUICK_PICK_SLOT_COUNT,
  getQuickPickIconSrc,
  normalizeQuickPicks,
  placeQuickPick,
} from '@/utils/quickPicks';

describe('placeQuickPick', () => {
  it('fills an empty slot', () => {
    expect(placeQuickPick(['library', 'margins', null], 'tts', 2)).toEqual([
      'library',
      'margins',
      'tts',
    ]);
  });

  it('replaces the occupant of a slot', () => {
    expect(placeQuickPick(['library', 'margins', null], 'mindmap', 0)).toEqual([
      'mindmap',
      'margins',
      null,
    ]);
  });

  it('moves Contents out of the fourth slot like any other pick', () => {
    expect(placeQuickPick(['library', 'margins', null, 'contents'], 'contents', 2)).toEqual([
      'library',
      'margins',
      'contents',
      null,
    ]);
  });

  it('swaps when the pick already sits in another slot', () => {
    expect(placeQuickPick(['library', 'margins', null], 'library', 1)).toEqual([
      'margins',
      'library',
      null,
    ]);
    expect(placeQuickPick(['library', 'margins', null], 'library', 2)).toEqual([
      null,
      'margins',
      'library',
    ]);
  });

  it('returns a new array and leaves the input untouched', () => {
    const slots = ['library', 'margins', null] as const;
    const next = placeQuickPick([...slots], 'tts', 2);
    expect(slots).toEqual(['library', 'margins', null]);
    expect(next).not.toBe(slots);
  });
});

describe('normalizeQuickPicks', () => {
  it('defaults to Library, Margins, one open slot and Contents in the fourth', () => {
    expect(QUICK_PICK_SLOT_COUNT).toBe(4);
    expect(DEFAULT_QUICK_PICKS).toEqual(['library', 'margins', null, 'contents']);
    expect(normalizeQuickPicks(undefined)).toEqual(DEFAULT_QUICK_PICKS);
  });

  it('keeps a valid stored pick', () => {
    expect(normalizeQuickPicks(['tts', null, 'ruler', null])).toEqual(['tts', null, 'ruler', null]);
  });

  it('drops unknown and duplicate ids', () => {
    expect(normalizeQuickPicks(['gallery', 'tts', 'tts', 'ruler'])).toEqual([
      null,
      'tts',
      null,
      'ruler',
    ]);
    expect(normalizeQuickPicks('library')).toEqual(DEFAULT_QUICK_PICKS);
  });

  it('gives older three slot picks Contents in the new fourth slot', () => {
    expect(normalizeQuickPicks(['library', 'margins', null])).toEqual([
      'library',
      'margins',
      null,
      'contents',
    ]);
    expect(normalizeQuickPicks(['tts'])).toEqual(['tts', null, null, 'contents']);
  });

  it('does not duplicate Contents when an older pick already holds it', () => {
    expect(normalizeQuickPicks(['contents', 'tts', null])).toEqual(['contents', 'tts', null, null]);
  });

  it('respects a removed Contents once four slots are stored', () => {
    expect(normalizeQuickPicks(['library', 'margins', null, null])).toEqual([
      'library',
      'margins',
      null,
      null,
    ]);
  });
});

describe('getQuickPickIconSrc', () => {
  it('picks the coloured or muted icon for each action', () => {
    expect(getQuickPickIconSrc('library', true)).toBe('/images/toolbar/library.svg');
    expect(getQuickPickIconSrc('library', false)).toBe('/images/toolbar/library-muted.svg');
    expect(getQuickPickIconSrc('contents', true)).toBe('/images/toolbar/book-toc.svg');
    expect(getQuickPickIconSrc('contents', false)).toBe('/images/toolbar/book-toc-muted.svg');
    expect(getQuickPickIconSrc('margins', true)).toBe('/images/spark/margins.svg');
    expect(getQuickPickIconSrc('ruler', false)).toBe('/images/toolbar/reading-ruler-muted.svg');
    expect(getQuickPickIconSrc('theme-fonts', true)).toBe('/images/theme-fonts/paper-large.svg');
    expect(getQuickPickIconSrc('theme-fonts', false)).toBe('/images/theme-fonts/muted-large.svg');
  });
});

it('uses a private drag type so foreign drops are ignored', () => {
  expect(QUICK_PICK_DRAG_TYPE).toBe('application/x-ample-quick-pick');
});
