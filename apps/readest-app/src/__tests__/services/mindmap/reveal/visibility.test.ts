import { describe, expect, it } from 'vitest';
import type { SectionFragment, SectionItem } from '@/libs/document';
import { createBookLocator } from '@/services/mindmap/generate/anchors';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import {
  CLUSTER_SIZE,
  type RevealInput,
  chapterAt,
  computeReveal,
  readingFloor,
  visibleFilter,
} from '@/services/mindmap/reveal/visibility';
import type { MapRecord, NodeRecord } from '@/services/mindmap/schema/types';
import { isShown } from '@/services/mindmap/spatial/spatialIndex';

const node = (
  id: string,
  revealAt: number | null,
  extra: Partial<NodeRecord> = {},
): NodeRecord => ({
  ...createNodeRecord({ id, index: 'a0', x: 0, y: 0 }),
  revealAt,
  ...extra,
});

const records: MapRecord[] = [
  node('early', 0.1),
  node('seen', 0.3),
  node('fresh', 0.45),
  node('ahead', 0.7, { x: 320, y: 160 }),
  node('later', 0.9, { x: 640, y: 480 }),
  node('mine', null),
  node('sectioned', 0.8, { parentId: 'sec', x: 1000, y: 0 }),
  node('gone', 0.95, { deleted: { by: 'gen' } }),
  node('goneEarly', 0.1, { deleted: { by: 'user' } }),
  createLinkRecord({ id: 'link', index: 'a1', fromId: 'early', toId: 'ahead' }),
];

const input = (overrides: Partial<RevealInput> = {}): RevealInput => ({
  records,
  spoiler: 'grow',
  progress: 0.5,
  lastSeenProgress: 0.4,
  chapterStarts: [0, 0.25, 0.5, 0.75],
  ...overrides,
});

describe('computeReveal', () => {
  it('hides records revealed past the reading progress in grow mode', () => {
    const state = computeReveal(input());
    expect([...state.hidden].sort()).toEqual(['ahead', 'later', 'sectioned']);
  });

  it('keeps records with no reveal point visible', () => {
    expect(computeReveal(input({ progress: 0 })).hidden.has('mine')).toBe(false);
  });

  it('hides a link when either end is hidden', () => {
    const state = computeReveal(input());
    const lookup = (id: string) => records.find((record) => record.id === id);
    expect(isShown(lookup('link'), visibleFilter(state.hidden), lookup)).toBe(false);
  });

  it('counts live records only, never tombstones or links', () => {
    const state = computeReveal(input());
    expect({ revealed: state.revealed, total: state.total }).toEqual({ revealed: 4, total: 7 });
  });

  it('counts records revealed since the reader last looked as new', () => {
    expect(computeReveal(input()).newIds).toEqual(['fresh']);
    expect(computeReveal(input({ progress: 0.95 })).newIds).toEqual([
      'fresh',
      'ahead',
      'later',
      'sectioned',
    ]);
  });

  it('shows one fog cluster per section or for the loose map in grow mode', () => {
    const state = computeReveal(input());
    expect(state.clusters.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: '', count: 2 },
      { key: 'sec', count: 1 },
    ]);
    const loose = state.clusters[0]!;
    expect(loose).toMatchObject({ ...CLUSTER_SIZE });
    expect(loose.x % 16).toBe(0);
    expect(loose.y % 16).toBe(0);
    expect(state.redacted).toEqual([]);
  });

  it('keeps each hidden record shape in fogged mode, labelled by its chapter', () => {
    const state = computeReveal(input({ spoiler: 'fogged' }));
    expect(state.clusters).toEqual([]);
    expect(state.redacted.find((fog) => fog.id === 'ahead')).toEqual({
      id: 'ahead',
      x: 320,
      y: 160,
      w: 160,
      h: 64,
      chapter: 3,
    });
  });

  it('shows everything for the whole book', () => {
    const state = computeReveal(input({ spoiler: 'whole' }));
    expect(state.hidden.size).toBe(0);
    expect(state.clusters).toEqual([]);
    expect(state.revealed).toBe(state.total);
  });
});

describe('chapterAt', () => {
  it('numbers the chapter the reader is in, from one', () => {
    expect(chapterAt([0.1, 0.3, 0.6], 0.35)).toBe(2);
    expect(chapterAt([0.1, 0.3, 0.6], 0.05)).toBeNull();
    expect(chapterAt([], 0.5)).toBeNull();
  });
});

describe('readingFloor', () => {
  const section = (id: string, cfi: string, size: number, fragments: SectionFragment[] = []) =>
    ({
      id,
      cfi,
      size,
      linear: 'yes',
      fragments,
      createDocument: async () => document,
    }) as SectionItem;
  const locator = createBookLocator({
    sections: [
      section('title.xhtml', 'epubcfi(/6/2)', 1000),
      section('ch1.xhtml', 'epubcfi(/6/4)', 3000, [
        { id: 'b', href: 'ch1.xhtml#b', cfi: 'epubcfi(/6/4!/4/10)', size: 1500, linear: 'yes' },
      ]),
      section('ch2.xhtml', 'epubcfi(/6/6)', 4000),
    ],
    splitTOCHref: (href) => href.split('#'),
  });

  it('reads the located point at the start of the visible range, not the end of the spread', () => {
    const lastSpreadOfChapter1 = { fraction: 0.55, location: 'epubcfi(/6/4!/4/20,/1:0,/3:5)' };
    expect(readingFloor(locator, lastSpreadOfChapter1)).toBe(0.3125);
  });

  it('stays at the section start until the visible range passes a heading inside the file', () => {
    expect(readingFloor(locator, { fraction: 0.3, location: 'epubcfi(/6/4!/4/6,/1:0,/1:9)' })).toBe(
      0.125,
    );
  });

  it('reaches the next chapter on its first page', () => {
    expect(readingFloor(locator, { fraction: 0.6, location: 'epubcfi(/6/6!/4/2,/1:0,/1:9)' })).toBe(
      0.5,
    );
  });

  it('falls back to the fraction without a locator or a location', () => {
    expect(readingFloor(null, { fraction: 0.4, location: 'epubcfi(/6/4!/4/2)' })).toBe(0.4);
    expect(readingFloor(locator, { fraction: 0.4, location: '' })).toBe(0.4);
    expect(readingFloor(locator, null)).toBe(0);
  });
});
