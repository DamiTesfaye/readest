import { describe, expect, it } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import type { FieldEnvelope, Hlc } from '@/types/replica';
import { canonicalStringify } from '@/services/mindmap/file/canonicalStringify';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { highestHlc, mergeMapFiles } from '@/services/mindmap/file/mergeMapFiles';
import { parseMapFile } from '@/services/mindmap/file/parseMapFile';
import { stampDiff } from '@/services/mindmap/file/stampDiff';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import type { MapFile } from '@/services/mindmap/schema/types';

const hlc = (ms: number, device = 'd1'): Hlc =>
  `${ms.toString(16).padStart(13, '0')}-00000000-${device}` as Hlc;

const envelope = (v: unknown, ms: number, device = 'd1'): FieldEnvelope => ({
  v,
  t: hlc(ms, device),
  s: device,
});

const fileWith = (
  records: MapFile['records'],
  meta: MapFile['meta'] = {},
  schemaVersion = 1,
): MapFile => ({
  schemaVersion,
  mapId: 'm1',
  meta,
  records,
});

describe('mergeMapFiles', () => {
  it('unions records present in only one file', () => {
    const merged = mergeMapFiles(
      fileWith({ n1: { label: envelope('a', 1) } }),
      fileWith({ n2: { label: envelope('b', 1, 'd2') } }),
    );
    expect(Object.keys(merged.records).sort()).toEqual(['n1', 'n2']);
  });

  it('merges a shared record field by field, highest HLC winning', () => {
    const merged = mergeMapFiles(
      fileWith({ n1: { label: envelope('old', 1), x: envelope(9, 7) } }),
      fileWith({ n1: { label: envelope('new', 5, 'd2'), x: envelope(1, 2, 'd2') } }),
    );
    expect(merged.records['n1']!['label']!.v).toBe('new');
    expect(merged.records['n1']!['x']!.v).toBe(9);
  });

  it('merges meta and keeps the higher schemaVersion', () => {
    const merged = mergeMapFiles(
      fileWith({}, { title: envelope('A', 1) }),
      fileWith({}, { title: envelope('B', 5, 'd2') }, 2),
    );
    expect(merged.meta['title']!.v).toBe('B');
    expect(merged.schemaVersion).toBe(2);
  });

  it('gives the same canonical bytes in either order', () => {
    const a = fileWith({ n1: { x: envelope(1, 1) } });
    const b = fileWith({ n1: { x: envelope(2, 5, 'd2') }, n2: { x: envelope(3, 2, 'd2') } });
    expect(canonicalStringify(mergeMapFiles(a, b))).toBe(canonicalStringify(mergeMapFiles(b, a)));
  });

  it('keeps a record deleted when another device edits it later', () => {
    const deleting = fileWith({
      n1: {
        type: envelope('node', 1),
        deleted: envelope({ by: 'user' }, 3),
        label: envelope('x', 1),
      },
    });
    const editing = fileWith({
      n1: {
        type: envelope('node', 1),
        deleted: envelope(null, 1),
        label: envelope('edited', 9, 'd2'),
      },
    });
    const merged = mergeMapFiles(deleting, editing);
    expect(merged.records['n1']!['deleted']!.v).toEqual({ by: 'user' });
    expect(JSON.parse(canonicalStringify(merged)).records.n1.label.v).toBeNull();
  });

  it('converges after a delete is saved, synced and then undone on one device', () => {
    const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
    const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'keep me' });
    const created = stampDiff(
      fileWith({}),
      { added: [node], changed: [], discarded: [] },
      clock,
      () => node,
    );
    const deletedNode = { ...node, deleted: { by: 'user' as const } };
    const deleted = stampDiff(
      created,
      {
        added: [],
        changed: [{ id: 'n1', field: 'deleted', from: null, to: { by: 'user' } }],
        discarded: [],
      },
      clock,
      () => deletedNode,
    );
    const peer = parseMapFile(canonicalStringify(deleted), 'm1')!;
    const undone = stampDiff(
      deleted,
      {
        added: [],
        changed: [{ id: 'n1', field: 'deleted', from: { by: 'user' }, to: null }],
        discarded: [],
      },
      clock,
      () => node,
    );

    expect(canonicalStringify(mergeMapFiles(peer, undone))).toBe(
      canonicalStringify(mergeMapFiles(undone, peer)),
    );
    expect(mergeMapFiles(peer, undone).records['n1']!['label']!.v).toBe('keep me');
  });
});

describe('highestHlc', () => {
  it('returns the newest clock across meta and records, or null for an empty file', () => {
    expect(highestHlc(fileWith({}))).toBeNull();
    expect(highestHlc(fileWith({ n1: { x: envelope(1, 9) } }, { title: envelope('t', 4) }))).toBe(
      hlc(9),
    );
  });
});

describe('mergeMapFiles lastSeenProgress', () => {
  const progressFile = (value: unknown, ms: number, device: string): MapFile =>
    fileWith({}, { lastSeenProgress: envelope(value, ms, device) });

  const progressOf = (file: MapFile): unknown => file.meta['lastSeenProgress']!.v;

  const same = (x: MapFile, y: MapFile): boolean => canonicalStringify(x) === canonicalStringify(y);

  it('is commutative for every pair of finite numbers and ties', () => {
    const values = [0, 0.3, 0.3, 0.9, 1];
    values.forEach((left, i) =>
      values.forEach((right, j) => {
        const a = progressFile(left, 1000 + i, `d${i}`);
        const b = progressFile(right, 1000 + j, `d${j}`);
        expect(same(mergeMapFiles(a, b), mergeMapFiles(b, a))).toBe(true);
      }),
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '0.9'],
    ['null', null],
  ])('lets a finite value win over %s in either order', (_label, bad) => {
    const a = progressFile(bad, 2000, 'da');
    const b = progressFile(0.5, 1000, 'db');
    expect(progressOf(mergeMapFiles(a, b))).toBe(0.5);
    expect(progressOf(mergeMapFiles(b, a))).toBe(0.5);
  });

  it('falls back to the newer clock when neither value is a finite number', () => {
    const a = progressFile(Number.NaN, 2000, 'da');
    const b = progressFile(null, 1000, 'db');
    expect(same(mergeMapFiles(a, b), mergeMapFiles(b, a))).toBe(true);
    expect(mergeMapFiles(a, b).meta['lastSeenProgress']!.s).toBe('da');
  });

  it('is associative across three devices when one value parsed from disk is not a number', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      mapId: 'm1',
      meta: { lastSeenProgress: envelope(null, 2000, 'db') },
      records: {},
    });
    const b = parseMapFile(text, 'm1')!;
    const a = progressFile(0.8, 1000, 'da');
    const c = progressFile(0.5, 3000, 'dc');
    const orders = [
      mergeMapFiles(mergeMapFiles(a, b), c),
      mergeMapFiles(mergeMapFiles(a, c), b),
      mergeMapFiles(a, mergeMapFiles(b, c)),
      mergeMapFiles(mergeMapFiles(c, b), a),
    ];
    for (const merged of orders) expect(same(merged, orders[0]!)).toBe(true);
    expect(progressOf(orders[0]!)).toBe(0.8);
  });
});
