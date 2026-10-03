import { describe, expect, it } from 'vitest';
import { HlcGenerator, hlcPack } from '@/libs/crdt';
import { type HlcClock, createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { canonicalStringify } from '@/services/mindmap/file/canonicalStringify';
import { parseMapFile } from '@/services/mindmap/file/parseMapFile';
import { mergeMapFiles } from '@/services/mindmap/file/mergeMapFiles';
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

  it('skips undefined fields of an added record so the file stays parseable', () => {
    const loose = { ...node, id: 'n2', icon: undefined } as unknown as typeof node;
    const file = stampDiff(
      emptyFile(),
      { added: [loose], changed: [], discarded: [] },
      clock(),
      () => loose,
    );
    expect(Object.hasOwn(file.records['n2']!, 'icon')).toBe(false);
    expect(parseMapFile(canonicalStringify(file), 'm1')).not.toBeNull();
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

describe('stamping above a far-future clock of the same field', () => {
  const future = hlcPack(Date.now() + 365 * 24 * 3600 * 1000, 3, 'device-x');
  const label = { id: 'n1', field: 'label', from: 'keep me', to: 'mine' };

  const poisonedMeta = (): MapFile => {
    const file = createMapFile(DEFAULT_MAP_META, 'm1', clock());
    return { ...file, meta: { ...file.meta, title: { v: 'Future', t: future, s: 'device-x' } } };
  };

  const poisonedNode = (): MapFile => {
    const file = withNode(clock());
    const fields = file.records['n1']!;
    const poisoned = { ...fields, label: { v: 'Future', t: future, s: 'device-x' } };
    return { ...file, records: { n1: poisoned } };
  };

  const renameWith = (file: MapFile, c: HlcClock, title: string): MapFile =>
    stampMeta(file, { title }, c);

  it('keeps the normal stamp for a meta field whose clock is in the past', () => {
    const c = clock();
    const file = createMapFile(DEFAULT_MAP_META, 'm1', c);
    const next = renameWith(file, c, 'Renamed');
    expect(next.meta['title']!.t > file.meta['title']!.t).toBe(true);
    expect(next.meta['title']!.t < future).toBe(true);
  });

  it('lets a meta rename win a merge against the far-future version', () => {
    const file = poisonedMeta();
    const renamed = renameWith(file, clock(), 'Mine');
    expect(renamed.meta['title']!.t > future).toBe(true);
    expect(decodeMeta(mergeMapFiles(file, renamed).meta).title).toBe('Mine');
    expect(decodeMeta(mergeMapFiles(renamed, file).meta).title).toBe('Mine');
  });

  it('lets a record field edit win a merge against the far-future version', () => {
    const file = poisonedNode();
    const edited = stampDiff(file, { added: [], changed: [label], discarded: [] }, clock(), () => ({
      ...node,
      label: 'mine',
    }));
    expect(edited.records['n1']!['label']!.t > future).toBe(true);
    expect(mergeMapFiles(file, edited).records['n1']!['label']!.v).toBe('mine');
  });

  it('stamps a re-added record above its far-future fields', () => {
    const file = poisonedNode();
    const readded = stampDiff(
      file,
      { added: [{ ...node, label: 'again' }], changed: [], discarded: [] },
      clock(),
      () => node,
    );
    expect(readded.records['n1']!['label']!.t > future).toBe(true);
  });

  it('restamps revived content above a far-future content clock', () => {
    const file = poisonedNode();
    const revived = stampDiff(
      file,
      {
        added: [],
        changed: [{ id: 'n1', field: 'deleted', from: { by: 'user' }, to: null }],
        discarded: [],
      },
      clock(),
      () => node,
    );
    expect(revived.records['n1']!['label']).toMatchObject({ v: 'keep me', s: 'device-1' });
    expect(revived.records['n1']!['label']!.t > future).toBe(true);
  });

  it('converges when two devices rename above the same far-future clock', () => {
    const file = poisonedMeta();
    const deviceA = createMindmapClock(new HlcGenerator('device-a'), 'device-a');
    const deviceB = createMindmapClock(new HlcGenerator('device-b'), 'device-b');
    const a = renameWith(file, deviceA, 'From A');
    const b = renameWith(file, deviceB, 'From B');
    expect(a.meta['title']!.t).not.toBe(b.meta['title']!.t);
    const ab = canonicalStringify(mergeMapFiles(a, b));
    expect(ab).toBe(canonicalStringify(mergeMapFiles(b, a)));
    expect(decodeMeta(mergeMapFiles(mergeMapFiles(file, a), b).meta).title).toBe('From B');
    expect(decodeMeta(mergeMapFiles(b, mergeMapFiles(a, file)).meta).title).toBe('From B');
  });
});
