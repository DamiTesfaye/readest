import { afterEach, describe, expect, test } from 'vitest';
import { hlcPack } from '@/libs/crdt';
import {
  latestMindmapManifest,
  __resetMindmapManifestsForTests,
} from '@/services/mindmap/sync/versions';
import { type MindmapReplicaRecord, mindmapAdapter } from '@/services/sync/adapters/mindmap';
import type { Hlc, ManifestFile, ReplicaRow } from '@/types/replica';

const HLC = hlcPack(1_700_000_000_000, 0, 'dev-a') as Hlc;
const MD5 = '0123456789abcdef0123456789abcdef';
const OTHER = 'ffffffffffffffffffffffffffffffff';
const binary = mindmapAdapter.binary!;

const rowOf = (replicaId: string, bookHash: unknown): ReplicaRow => ({
  user_id: 'u1',
  kind: 'mindmap',
  replica_id: replicaId,
  fields_jsonb: bookHash === undefined ? {} : { bookHash: { v: bookHash, t: HLC, s: 'dev-a' } },
  manifest_jsonb: null,
  deleted_at_ts: null,
  reincarnation: null,
  updated_at_ts: HLC,
  schema_version: 1,
});

const entry = (overrides: Partial<MindmapReplicaRecord> = {}): MindmapReplicaRecord => ({
  mapId: 'map1',
  bookHash: 'book1',
  name: 'Characters',
  bundleDir: 'book1/mindmaps/map1',
  syncedMd5: MD5,
  ...overrides,
});

const manifestFile = (filename: string): ManifestFile => ({
  filename,
  byteSize: 5,
  partialMd5: 'x',
});

afterEach(() => {
  __resetMindmapManifestsForTests();
});

describe('mindmapAdapter', () => {
  test('publishes only the book hash, never the title', () => {
    expect(mindmapAdapter.pack(entry())).toEqual({ bookHash: 'book1' });
  });

  test('turns a row into a local entry with no synced version', () => {
    expect(mindmapAdapter.unpackRow(rowOf('map1', 'book1'), 'book1/mindmaps/map1')).toEqual({
      mapId: 'map1',
      bookHash: 'book1',
      name: 'map1',
      bundleDir: 'book1/mindmaps/map1',
      syncedMd5: null,
    });
  });

  test.each([
    ['map1', undefined],
    ['map1', '../book'],
    ['map1', 42],
    ['../map1', 'book1'],
    ['', 'book1'],
  ])('rejects the row %s of book %j', (replicaId, bookHash) => {
    const row = rowOf(replicaId, bookHash);
    expect(mindmapAdapter.unpackRow(row, 'x')).toBeNull();
    expect(binary.bundleDirFor!(row)).toBeNull();
  });

  test('places a new map in its book mindmaps directory', () => {
    expect(binary.bundleDirFor!(rowOf('map1', 'book1'))).toBe('book1/mindmaps/map1');
  });

  test('is current only when the manifest names the synced version', () => {
    expect(binary.isCurrent!(entry(), [manifestFile(`map1.${MD5}.json`)])).toBe(true);
    expect(binary.isCurrent!(entry(), [manifestFile(`map1.${OTHER}.json`)])).toBe(false);
    expect(binary.isCurrent!(entry({ syncedMd5: null }), [manifestFile(`map1.${MD5}.json`)])).toBe(
      false,
    );
  });

  test('remembers the manifest it was asked about for the merge to compare against', () => {
    binary.isCurrent!(entry(), [manifestFile(`map1.${OTHER}.json`)]);
    expect(latestMindmapManifest('map1')).toEqual(manifestFile(`map1.${OTHER}.json`));
  });

  test('downloads into incoming/ and uploads the outgoing copy', () => {
    expect(binary.downloadPath!(`map1.${OTHER}.json`, 'book1/mindmaps/map1')).toBe(
      `book1/mindmaps/map1/incoming/map1.${OTHER}.json`,
    );
    expect(binary.enumerateFiles(entry())).toEqual([]);
    expect(
      binary.enumerateFiles(entry({ outgoing: { filename: `map1.${OTHER}.json`, byteSize: 12 } })),
    ).toEqual([
      {
        logical: `map1.${OTHER}.json`,
        lfp: `book1/mindmaps/map1/outgoing/map1.${OTHER}.json`,
        byteSize: 12,
      },
    ]);
  });

  test('treats a download whose version is gone as stale', () => {
    expect(binary.staleWhenMissing).toBe(true);
    expect(binary.localBaseDir).toBe('Books');
  });
});
