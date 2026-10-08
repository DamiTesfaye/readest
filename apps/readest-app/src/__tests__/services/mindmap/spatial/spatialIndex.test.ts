import { describe, expect, it } from 'vitest';
import {
  createInkRecord,
  createLinkRecord,
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
} from '@/services/mindmap/records/defaults';
import { encodeInkStroke } from '@/services/mindmap/ink/ink';
import {
  createSpatialIndex,
  hitsRecord,
  recordBounds,
} from '@/services/mindmap/spatial/spatialIndex';
import { createMapStore } from '@/services/mindmap/store/mapStore';

const node = (id: string, x: number, y: number, index = 'a0') =>
  createNodeRecord({ id, index, x, y, w: 100, h: 40 });

describe('spatial index', () => {
  it('finds records overlapping a rectangle', () => {
    const store = createMapStore([node('a', 0, 0), node('b', 500, 500)]);
    const index = createSpatialIndex(store);
    expect(index.search({ x: -10, y: -10, w: 50, h: 50 })).toEqual(['a']);
  });

  it('follows moves, deletes and new records without a rebuild', () => {
    const store = createMapStore([node('a', 0, 0)]);
    const index = createSpatialIndex(store);
    store.update('a', { x: 1000 });
    expect(index.search({ x: 0, y: 0, w: 200, h: 200 })).toEqual([]);
    expect(index.search({ x: 990, y: 0, w: 50, h: 50 })).toEqual(['a']);
    store.put([node('c', 0, 0)]);
    expect(index.search({ x: 0, y: 0, w: 10, h: 10 })).toEqual(['c']);
    store.remove(['c'], 'user');
    expect(index.search({ x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });

  it('stops listening after dispose', () => {
    const store = createMapStore([]);
    const index = createSpatialIndex(store);
    index.dispose();
    store.put([node('a', 0, 0)]);
    expect(index.search({ x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });

  it('hit-tests the topmost record and prefers records over sections', () => {
    const section = createSectionRecord({ id: 's', index: 'a5', x: -100, y: -100, w: 600, h: 600 });
    const store = createMapStore([section, node('low', 0, 0, 'a1'), node('high', 20, 0, 'a2')]);
    const index = createSpatialIndex(store);
    expect(index.hitTest({ x: 30, y: 10 }, 2)).toBe('high');
    expect(index.hitTest({ x: 5, y: 10 }, 2)).toBe('low');
    expect(index.hitTest({ x: 400, y: 400 }, 2)).toBe('s');
    expect(index.hitTest({ x: 5000, y: 5000 }, 2)).toBeNull();
  });

  it('hit-tests links along their path', () => {
    const link = createLinkRecord({
      id: 'l',
      index: 'a3',
      fromId: 'a',
      toId: 'b',
      path: 'straight',
    });
    const store = createMapStore([node('a', 0, 0), node('b', 400, 0), link]);
    const index = createSpatialIndex(store);
    expect(index.hitTest({ x: 250, y: 22 }, 4)).toBe('l');
    expect(index.hitTest({ x: 250, y: 60 }, 4)).toBeNull();
  });

  it('pads ink bounds by half the stroke width', () => {
    const [segment] = encodeInkStroke([
      [0, 0, 0.5],
      [100, 0, 0.5],
    ]);
    const ink = createInkRecord({ id: 'i', index: 'a0', ...segment!, size: 10 });
    expect(recordBounds(ink)).toEqual({ x: -5, y: -5, w: 110, h: 10 });
    expect(hitsRecord(ink, { x: 50, y: 4 }, 0)).toBe(true);
    expect(hitsRecord(ink, { x: 50, y: 7 }, 0)).toBe(false);
  });

  it('hit-tests diamonds by their outline, not their bounding box', () => {
    const diamond = createShapeRecord({
      id: 'd',
      index: 'a0',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      geo: 'diamond',
    });
    expect(hitsRecord(diamond, { x: 50, y: 50 }, 0)).toBe(true);
    expect(hitsRecord(diamond, { x: 5, y: 5 }, 0)).toBe(false);
  });

  it('finds a link whose line crosses a box that holds neither end', () => {
    const link = createLinkRecord({ id: 'l', index: 'a3', fromId: 'a', toId: 'b' });
    const store = createMapStore([node('a', -3000, 0), node('b', 3000, 0), link]);
    const index = createSpatialIndex(store);
    const view = { x: -100, y: -100, w: 200, h: 200 };
    expect(index.search(view)).toEqual([]);
    expect(index.searchLinks(view)).toEqual(['l']);
    expect(index.searchLinks({ x: -100, y: 500, w: 200, h: 200 })).toEqual([]);
  });

  it('finds a curved link by its bulge, not only by its end boxes', () => {
    const link = createLinkRecord({
      id: 'l',
      index: 'a3',
      fromId: 'a',
      toId: 'b',
      fromAnchor: { side: 'bottom', t: 0.5 },
      toAnchor: { side: 'bottom', t: 0.5 },
    });
    const store = createMapStore([node('a', 0, 0), node('b', 400, 0), link]);
    const index = createSpatialIndex(store);
    expect(index.searchLinks({ x: 200, y: 150, w: 10, h: 10 })).toEqual(['l']);
  });

  it('reindexes a link when an end moves, is deleted, comes back or merges in remotely', () => {
    const link = createLinkRecord({ id: 'l', index: 'a3', fromId: 'a', toId: 'b' });
    const store = createMapStore([node('a', 0, 0), node('b', 400, 0), link]);
    const index = createSpatialIndex(store);
    const far = { x: 5000, y: 5000, w: 100, h: 100 };
    store.update('b', { x: 5000, y: 5000 });
    expect(index.searchLinks(far)).toEqual(['l']);
    store.remove(['b'], 'user');
    expect(index.searchLinks(far)).toEqual([]);
    store.update('b', { deleted: null });
    expect(index.searchLinks(far)).toEqual(['l']);
    store.applyRemote({
      added: [],
      changed: [{ id: 'b', field: 'x', from: 5000, to: 0 }],
      discarded: [],
    });
    expect(index.searchLinks(far)).toEqual([]);
    store.update('l', { toId: 'c' });
    store.put([node('c', 5000, 5000)]);
    expect(index.searchLinks(far)).toEqual(['l']);
    store.discard(['c']);
    expect(index.searchLinks(far)).toEqual([]);
  });

  it('hit-tests links through the index, topmost first', () => {
    const low = createLinkRecord({
      id: 'low',
      index: 'a3',
      fromId: 'a',
      toId: 'b',
      path: 'straight',
    });
    const high = createLinkRecord({
      id: 'high',
      index: 'a4',
      fromId: 'a',
      toId: 'b',
      path: 'straight',
    });
    const store = createMapStore([node('a', 0, 0), node('b', 400, 0), high, low]);
    const index = createSpatialIndex(store);
    expect(index.hitTest({ x: 250, y: 20 }, 4)).toBe('high');
    store.remove(['high'], 'user');
    expect(index.hitTest({ x: 250, y: 20 }, 4)).toBe('low');
  });
});
