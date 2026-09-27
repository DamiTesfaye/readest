import { describe, expect, it } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import { type HlcClock, createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { stampDiff, stampMeta } from '@/services/mindmap/file/stampDiff';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META, type MapFile, type MapMeta } from '@/services/mindmap/schema/types';
import { decodeMeta } from '@/services/mindmap/schema/validate';

const clock = (): HlcClock => createMindmapClock(new HlcGenerator('device-1'), 'device-1');

const emptyFile = (): MapFile => ({ schemaVersion: 1, mapId: 'm1', meta: {}, records: {} });

const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'keep me' });

const withNode = (c: HlcClock): MapFile =>
  stampDiff(emptyFile(), { added: [node], changed: [], discarded: [] }, c, () => node);

describe('stampDiff', () => {
  it('stamps every field of an added record except id', () => {
    const fields = withNode(clock()).records['n1']!;
    expect(Object.keys(fields).sort()).toEqual(
      Object.keys(node)
        .filter((key) => key !== 'id')
        .sort(),
    );
    expect(fields['label']).toMatchObject({ v: 'keep me', s: 'device-1' });
  });

  it('replaces only the changed envelope with a newer clock', () => {
    const c = clock();
    const file = withNode(c);
    const next = stampDiff(
      file,
      {
        added: [],
        changed: [{ id: 'n1', field: 'label', from: 'keep me', to: 'new' }],
        discarded: [],
      },
      c,
      () => ({ ...node, label: 'new' }),
    );
    expect(next.records['n1']!['label']!.v).toBe('new');
    expect(next.records['n1']!['label']!.t > file.records['n1']!['label']!.t).toBe(true);
    expect(next.records['n1']!['x']).toBe(file.records['n1']!['x']);
  });

  it('ignores a change for a record that is not in the file', () => {
    const next = stampDiff(
      emptyFile(),
      { added: [], changed: [{ id: 'ghost', field: 'label', from: '', to: 'x' }], discarded: [] },
      clock(),
      () => undefined,
    );
    expect(next.records).toEqual({});
  });

  it('restamps every content field when a record is revived', () => {
    const c = clock();
    const deletedNode = { ...node, deleted: { by: 'user' as const } };
    const deleted = stampDiff(
      withNode(c),
      {
        added: [],
        changed: [{ id: 'n1', field: 'deleted', from: null, to: { by: 'user' } }],
        discarded: [],
      },
      c,
      () => deletedNode,
    );
    const deletedAt = deleted.records['n1']!['deleted']!.t;
    const revived = stampDiff(
      deleted,
      {
        added: [],
        changed: [{ id: 'n1', field: 'deleted', from: { by: 'user' }, to: null }],
        discarded: [],
      },
      c,
      () => node,
    );
    expect(revived.records['n1']!['label']!.v).toBe('keep me');
    expect(revived.records['n1']!['label']!.t > deletedAt).toBe(true);
    expect(revived.records['n1']!['x']).toBe(deleted.records['n1']!['x']);
  });

  it('removes discarded records from the file', () => {
    const c = clock();
    const next = stampDiff(
      withNode(c),
      { added: [], changed: [], discarded: ['n1'] },
      c,
      () => undefined,
    );
    expect(next.records).toEqual({});
  });
});

describe('stampMeta and createMapFile', () => {
  it('creates a map file whose meta decodes back to the input', () => {
    const meta: MapMeta = { ...DEFAULT_MAP_META, title: 'Family', source: 'generated' };
    const file = createMapFile(meta, 'm1', clock());
    expect(file).toMatchObject({ schemaVersion: 1, mapId: 'm1', records: {} });
    expect(decodeMeta(file.meta)).toEqual(meta);
  });

  it('stamps only the patched keys and skips undefined values', () => {
    const c = clock();
    const file = createMapFile(DEFAULT_MAP_META, 'm1', c);
    const next = stampMeta(file, { title: 'Renamed', style: undefined } as Partial<MapMeta>, c);
    expect(next.meta['title']!.v).toBe('Renamed');
    expect(next.meta['style']).toBe(file.meta['style']);
  });
});
