import { describe, expect, it, vi } from 'vitest';
import {
  cacheKey,
  createPainter,
  drawMargin,
  drawPostBadge,
  marginIdsOfKey,
  POSTS_KEY_PREFIX,
  placementOf,
  type PainterOverlayer,
  type Placement,
  VIEW_KEY_PREFIX,
} from '@/services/margins/painter';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const anchor = { quote: { exact: 'x' } } as unknown as Anchor;
const row = (id: string, o: Partial<LayerRow> = {}): LayerRow => ({
  id,
  fileHash: 'f',
  textId: null,
  anchor,
  kind: 'clip',
  payload: {},
  rev: 1,
  deleted: false,
  updatedAt: 1,
  ...o,
});

const fakeOverlayer = () => {
  const added = new Map<
    string,
    { range: Range; opts: Record<string, unknown>; draw: (...a: never[]) => unknown }
  >();
  const calls = { add: 0, remove: [] as string[] };
  const overlayer: PainterOverlayer = {
    add(key, range, draw, opts) {
      calls.add++;
      added.set(key, { range, opts: opts as Record<string, unknown>, draw });
    },
    remove(key) {
      calls.remove.push(key);
      added.delete(key);
    },
  };
  return { overlayer, added, calls };
};

const doc = document.implementation.createHTMLDocument('t');
doc.body.innerHTML = '<p id="a">one two three four five six seven</p><p id="b">eight nine</p>';
const text = (id: string) => doc.getElementById(id)!.firstChild!;

const rangeAt = (start: number, end: number, top: number, id = 'a') => {
  const r = doc.createRange();
  r.setStart(text(id), start);
  r.setEnd(text(id), end);
  r.getClientRects = () =>
    [{ top, left: 0, right: 10, bottom: top + 10 }] as unknown as DOMRectList;
  return r;
};

const setup = (placements: Record<string, Placement>, tops: Record<string, number> = {}) => {
  const resolve = vi.fn(async (r: LayerRow) => placements[r.id]!);
  const liveRange = vi.fn(async (_s: number, start: number, end: number) =>
    rangeAt(start, Math.max(end, start), tops[`${start}`] ?? start * 20),
  );
  return { painter: createPainter({ resolve, liveRange }), resolve, liveRange };
};

describe('margins painter', () => {
  it('keys with the margins: prefix, clusters a shared line and rings a fuzzy placement', async () => {
    const { painter } = setup(
      {
        a: { kind: 'placed', section: 0, start: 0, end: 3, step: 1 },
        b: { kind: 'placed', section: 0, start: 4, end: 7, step: 2 },
        c: { kind: 'placed', section: 0, start: 8, end: 13, step: 3 },
      },
      { '0': 100, '4': 101, '8': 300 },
    );
    await painter.resolveAll([row('a'), row('b'), row('c')]);
    const { overlayer, added } = fakeOverlayer();
    const keys = await painter.drawSection(0, overlayer, 'full');
    expect(keys.sort()).toEqual(['margins:c', 'margins:cluster:a,b']);
    expect(added.get('margins:cluster:a,b')!.opts).toMatchObject({ count: 2, markers: false });
    expect(added.get('margins:cluster:a,b')!.range.toString()).toBe('one two');
    expect(added.get('margins:c')!.opts).toMatchObject({ count: 1, fuzzy: true });
  });

  it('draws a gap on one character and never draws elsewhere or detached', async () => {
    const { painter } = setup({
      g: { kind: 'gap', section: 0, at: 4 },
      e: { kind: 'elsewhere' },
      d: { kind: 'detached' },
    });
    await painter.resolveAll([row('g'), row('e'), row('d')]);
    const { overlayer, added } = fakeOverlayer();
    expect(await painter.drawSection(0, overlayer, 'full')).toEqual(['margins:g']);
    expect(added.get('margins:g')!.opts).toMatchObject({ gap: true });
    expect(added.get('margins:g')!.range.toString()).toBe('t');
  });

  it('draws markers only in markers, keeping fuzzy rings and dropping gaps', async () => {
    const { painter } = setup({
      a: { kind: 'placed', section: 0, start: 0, end: 3, step: 3 },
      g: { kind: 'gap', section: 0, at: 8 },
    });
    await painter.resolveAll([row('a'), row('g')]);
    const before = new Map(painter.placements());
    const { overlayer, added } = fakeOverlayer();
    expect(await painter.drawSection(0, overlayer, 'markers')).toEqual(['margins:a']);
    expect(added.get('margins:a')!.opts).toMatchObject({ markers: true, fuzzy: true });
    expect(new Map(painter.placements())).toEqual(before);
  });

  it('removes every drawn key and adds none in quiet', async () => {
    const { painter } = setup({
      a: { kind: 'placed', section: 0, start: 0, end: 3, step: 1 },
      g: { kind: 'gap', section: 0, at: 8 },
    });
    await painter.resolveAll([row('a'), row('g')]);
    const before = new Map(painter.placements());
    const { overlayer, calls } = fakeOverlayer();
    const drawn = await painter.drawSection(0, overlayer, 'full');
    calls.add = 0;
    expect(await painter.drawSection(0, overlayer, 'quiet')).toEqual([]);
    expect(calls.add).toBe(0);
    expect(calls.remove.sort()).toEqual(drawn.sort());
    expect(new Map(painter.placements())).toEqual(before);
  });

  it('drops a cached placement after a local write', async () => {
    const { painter, resolve } = setup({
      a: { kind: 'placed', section: 0, start: 0, end: 3, step: 1 },
      l: { kind: 'placed', section: 0, start: 4, end: 7, step: 1 },
    });
    await painter.resolveAll([row('a'), row('l', { rev: null, updatedAt: 5 })]);
    expect(resolve).toHaveBeenCalledTimes(2);
    await painter.resolveAll([row('a'), row('l', { rev: null, updatedAt: 5 })]);
    expect(resolve).toHaveBeenCalledTimes(2);
    await painter.resolveAll([row('a', { updatedAt: 9 }), row('l', { rev: null, updatedAt: 6 })]);
    expect(resolve).toHaveBeenCalledTimes(4);
    expect(cacheKey(row('l', { rev: null, updatedAt: 6 }))).toBe('l@local:6');
    expect(cacheKey(row('a', { rev: 3, updatedAt: 6 }))).not.toBe(cacheKey(row('a', { rev: 3 })));
  });

  it('resolves in batches of at most 20', async () => {
    let inFlight = 0;
    let peak = 0;
    const resolve = vi.fn(async (): Promise<Placement> => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { kind: 'detached' };
    });
    const painter = createPainter({ resolve, liveRange: async () => null });
    const batches = vi.fn();
    await painter.resolveAll(
      Array.from({ length: 45 }, (_, i) => row(`r${i}`)),
      batches,
    );
    expect(resolve).toHaveBeenCalledTimes(45);
    expect(peak).toBe(20);
    expect(batches).toHaveBeenCalledTimes(3);
  });

  it('draws a marker the hit test can find and only the count as text', () => {
    const rects = [
      { left: 0, top: 0, right: 50, bottom: 10, width: 50, height: 10 },
      { left: 0, top: 12, right: 30, bottom: 22, width: 30, height: 10 },
    ] as DOMRect[];
    const full = drawMargin([...rects], { count: 3, fuzzy: true, markers: false });
    expect(full.querySelectorAll('rect')).toHaveLength(2);
    expect(full.textContent).toBe('3');
    expect(full.querySelector('[stroke-dasharray]')).not.toBeNull();
    const marked = [...rects];
    const markers = drawMargin(marked, { count: 1, fuzzy: false, markers: true });
    expect(markers.querySelectorAll('rect')).toHaveLength(0);
    expect(markers.textContent).toBe('');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.left).toBeGreaterThan(20);
  });

  it('maps resolutions to placements and keys back to ids', () => {
    const base = { range: null, confidence: 1 };
    expect(placementOf({ ...base, sectionIndex: 2, step: 1, canonical: [3, 9] })).toEqual({
      kind: 'placed',
      section: 2,
      start: 3,
      end: 9,
      step: 1,
    });
    expect(
      placementOf({
        ...base,
        sectionIndex: 2,
        step: null,
        notInThisVersion: { near: null, at: 7 },
      }),
    ).toEqual({ kind: 'gap', section: 2, at: 7 });
    expect(
      placementOf({
        ...base,
        sectionIndex: null,
        step: null,
        notInThisVersion: { near: null, at: null },
      }),
    ).toEqual({ kind: 'elsewhere' });
    expect(placementOf({ ...base, sectionIndex: null, step: null, reason: 'x' })).toEqual({
      kind: 'detached',
    });
    expect(marginIdsOfKey('margins:cluster:a,b')).toEqual(['a', 'b']);
    expect(marginIdsOfKey('margins:a')).toEqual(['a']);
  });

  it('reuses live ranges while their document is alive', async () => {
    const p = document.createElement('p');
    p.textContent = 'live text in the page';
    document.body.append(p);
    const liveRange = vi.fn(async () => {
      const r = document.createRange();
      r.selectNodeContents(p);
      r.getClientRects = () => [] as unknown as DOMRectList;
      return r;
    });
    const painter = createPainter({
      resolve: async () => ({ kind: 'placed', section: 0, start: 0, end: 4, step: 1 }),
      liveRange,
    });
    await painter.resolveAll([row('a')]);
    const { overlayer } = fakeOverlayer();
    await painter.drawSection(0, overlayer, 'full');
    await painter.drawSection(0, overlayer, 'markers');
    expect(liveRange).toHaveBeenCalledTimes(1);
    p.remove();
  });

  describe('public Margins', () => {
    const cluster = { start: 0, end: 3, count: 4, key: `${POSTS_KEY_PREFIX}3:0:3` };
    const view = { postId: 'pst1', section: 3, start: 4, end: 7 };

    it('draws post badges in full and markers but not in quiet, only on their section', async () => {
      const { painter } = setup({});
      painter.setPostClusters(3, [cluster]);
      const { overlayer, added } = fakeOverlayer();
      expect(await painter.drawSection(3, overlayer, 'full')).toEqual([cluster.key]);
      expect(added.get(cluster.key)!.draw).toBe(drawPostBadge);
      expect(added.get(cluster.key)!.opts).toMatchObject({ count: 4 });
      expect(await painter.drawSection(3, overlayer, 'markers')).toEqual([cluster.key]);
      expect(await painter.drawSection(3, overlayer, 'quiet')).toEqual([]);
      expect(await painter.drawSection(2, fakeOverlayer().overlayer, 'full')).toEqual([]);
    });

    it('draws View in place in every display, quiet included, until cleared', async () => {
      const { painter } = setup({});
      painter.setViewInPlace(view);
      const { overlayer, added } = fakeOverlayer();
      for (const display of ['full', 'markers', 'quiet'] as const) {
        expect(await painter.drawSection(3, overlayer, display)).toEqual([
          `${VIEW_KEY_PREFIX}pst1`,
        ]);
      }
      expect(added.get(`${VIEW_KEY_PREFIX}pst1`)!.draw).toBe(drawMargin);
      painter.setViewInPlace(null);
      expect(await painter.drawSection(3, overlayer, 'full')).toEqual([]);
      expect(added.size).toBe(0);
    });

    it('draws a hidden badge whose only text is the count', () => {
      const rect = { left: 10, top: 20, right: 60, bottom: 30, width: 50, height: 10 } as DOMRect;
      const g = drawPostBadge([rect], { count: 12 });
      expect(g.getAttribute('aria-hidden')).toBe('true');
      expect(g.textContent).toBe('12');
    });
  });
});
