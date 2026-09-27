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
