import { describe, expect, it } from 'vitest';
import type { GenNode } from '@/services/mindmap/generate/types';
import {
  FAN_RING_STEP,
  ROW_STEP,
  layoutNewNodes,
  resetPlacement,
} from '@/services/mindmap/layout/layout';
import { tidyTree } from '@/services/mindmap/layout/tidyTree';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { MapRecord, NodeRecord } from '@/services/mindmap/schema/types';
import { GRID_SIZE } from '@/services/mindmap/snap/snap';
import { createSpatialIndex } from '@/services/mindmap/spatial/spatialIndex';
import { createMapStore } from '@/services/mindmap/store/mapStore';

const genNode = (genKey: string, parentGenKey: string | null, kind: GenNode['kind']): GenNode => ({
  type: 'node',
  genKey,
  kind,
  label: genKey,
  color: 'sky',
  anchor: null,
  revealAt: null,
  parentGenKey,
});

const existing = (
  id: string,
  x: number,
  y: number,
  extra: Partial<NodeRecord> = {},
): NodeRecord => ({
  ...createNodeRecord({ id, index: `a${id.length}`, x, y }),
  ...extra,
});

const setup = (records: MapRecord[], hideAll = false) => {
  const store = createMapStore(records);
  const spatial = createSpatialIndex(store, () => (hideAll ? () => false : () => true));
  return { store, spatial };
};

const overlaps = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  w = 160,
  h = 64,
): boolean => a.x < b.x + w && b.x < a.x + w && a.y < b.y + h && b.y < a.y + h;

describe('tidyTree', () => {
  it('lays children to the right in TOC order and centres parents on their children', () => {
    const slots = tidyTree([
      { key: 'part', parentKey: null },
      { key: 'ch1', parentKey: 'part' },
      { key: 'ch2', parentKey: 'part' },
      { key: 'epilogue', parentKey: null },
    ]);
    expect(Object.fromEntries(slots)).toEqual({
      part: { depth: 0, row: 0.5 },
      ch1: { depth: 1, row: 0 },
      ch2: { depth: 1, row: 1 },
      epilogue: { depth: 0, row: 2 },
    });
  });

  it('places every key once when parents form a cycle or point at themselves', () => {
    const slots = tidyTree([
      { key: 'a', parentKey: 'b' },
      { key: 'b', parentKey: 'a' },
      { key: 'self', parentKey: 'self' },
    ]);
    expect([...slots.keys()].sort()).toEqual(['a', 'b', 'self']);
    const cells = [...slots.values()].map((slot) => `${slot.depth}:${slot.row}`);
    expect(new Set(cells).size).toBe(3);
  });
});

describe('layoutNewNodes', () => {
  it('stacks a new chapter tree below the lowest record, on the grid', () => {
    const { store, spatial } = setup([
      existing('top', 40, 0),
      existing('low', 300, 500, { deleted: { by: 'user' } }),
    ]);
    const placed = layoutNewNodes(store, spatial, [
      genNode('toc:a', null, 'chapter'),
      genNode('toc:a1', 'toc:a', 'chapter'),
      genNode('toc:a2', 'toc:a', 'chapter'),
    ]);
    const a = placed.get('toc:a')!;
    const a1 = placed.get('toc:a1')!;
    expect(a1.y).toBeGreaterThanOrEqual(500 + 64);
    expect(a.x).toBe(48);
    expect(a1.x).toBeGreaterThan(a.x);
    expect(placed.get('toc:a2')!.y - a1.y).toBe(ROW_STEP);
    for (const point of placed.values()) {
      expect(point.x % GRID_SIZE).toBe(0);
      expect(point.y % GRID_SIZE).toBe(0);
    }
  });

  it('fans new quotes around their chapter and skips occupied cells, hidden ones too', () => {
    const chapter = existing('chapter', 0, 0, { genKey: 'toc:c' });
    const blocker = existing('blocker', FAN_RING_STEP, 0);
    const { store, spatial } = setup([chapter, blocker], true);
    const placed = layoutNewNodes(store, spatial, [
      genNode('note:1', 'toc:c', 'quote'),
      genNode('note:2', 'toc:c', 'quote'),
    ]);
    const first = placed.get('note:1')!;
    const second = placed.get('note:2')!;
    for (const point of [first, second]) {
      expect(overlaps(point, blocker)).toBe(false);
      expect(overlaps(point, chapter)).toBe(false);
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(FAN_RING_STEP * 2);
    }
    expect(overlaps(first, second)).toBe(false);
  });

  it('fans a quote around a chapter placed in the same batch', () => {
    const { store, spatial } = setup([]);
    const placed = layoutNewNodes(store, spatial, [
      genNode('toc:c', null, 'chapter'),
      genNode('note:1', 'toc:c', 'quote'),
    ]);
    const chapter = placed.get('toc:c')!;
    const quote = placed.get('note:1')!;
    expect(overlaps(chapter, quote)).toBe(false);
    expect(Math.hypot(quote.x - chapter.x, quote.y - chapter.y)).toBeLessThanOrEqual(
      FAN_RING_STEP + GRID_SIZE,
    );
  });
});

describe('resetPlacement', () => {
  it('places a chapter below every other record', () => {
    const { store, spatial } = setup([
      existing('chapter', 900, 900, { origin: 'generated', genKey: 'toc:c' }),
      existing('other', 0, 192),
    ]);
    expect(resetPlacement(store, spatial, 'chapter')).toEqual({ x: 0, y: 192 + 64 + 64 });
  });

  it('fans a quote around its chapter as if it were new', () => {
    const chapter = existing('chapter', 0, 0, { origin: 'generated', genKey: 'toc:c' });
    const quote = existing('quote', 2000, 2000, {
      origin: 'generated',
      genKey: 'note:1',
      kind: 'quote',
    });
    const link = createLinkRecord({ id: 'l', index: 'a0', fromId: 'chapter', toId: 'quote' });
    const { store, spatial } = setup([chapter, quote, link]);
    const point = resetPlacement(store, spatial, 'quote')!;
    expect(overlaps(point, chapter)).toBe(false);
    expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(FAN_RING_STEP + GRID_SIZE);
  });

  it('has nothing to place for a missing record or a link', () => {
    const link = createLinkRecord({ id: 'l', index: 'a0', fromId: 'x', toId: 'y' });
    const { store, spatial } = setup([link]);
    expect(resetPlacement(store, spatial, 'missing')).toBeNull();
    expect(resetPlacement(store, spatial, 'l')).toBeNull();
  });
});
