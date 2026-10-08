import { beforeEach, describe, expect, test, vi } from 'vitest';
import { hlcPack } from '@/libs/crdt';
import { dictionaryAdapter } from '@/services/sync/adapters/dictionary';
import { type PullAndApplyDeps, replicaPullAndApply } from '@/services/sync/replicaPullAndApply';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ImportedDictionary } from '@/services/dictionaries/types';
import type { Hlc, ReplicaRow } from '@/types/replica';

interface FakeMap {
  name: string;
  mapId: string;
  bundleDir: string;
  synced: string | null;
}

const HLC = hlcPack(1_700_000_000_000, 0, 'dev-a') as Hlc;

const rowOf = (overrides: Partial<ReplicaRow> = {}): ReplicaRow => ({
  user_id: 'u1',
  kind: 'fakemap',
  replica_id: 'map1',
  fields_jsonb: { bookHash: { v: 'book1', t: HLC, s: 'dev-a' } },
  manifest_jsonb: {
    schemaVersion: 1,
    files: [{ filename: 'map1.v2.json', byteSize: 7, partialMd5: 'x' }],
  },
  deleted_at_ts: null,
  reincarnation: null,
  updated_at_ts: HLC,
  schema_version: 1,
  ...overrides,
});

const fakeMapAdapter: ReplicaAdapter<FakeMap> = {
  kind: 'fakemap',
  schemaVersion: 1,
  pack: () => ({}),
  unpack: () => ({ name: '', mapId: '', bundleDir: '', synced: null }),
  computeId: async (record) => record.mapId,
  unpackRow: (row, bundleDir) => ({
    name: row.replica_id,
    mapId: row.replica_id,
    bundleDir,
    synced: null,
  }),
  binary: {
    localBaseDir: 'Books',
    enumerateFiles: () => [],
    isCurrent: (record, files) => files[0]?.filename === `${record.mapId}.${record.synced}.json`,
    downloadPath: (filename, bundleDir) => `${bundleDir}/incoming/${filename}`,
    bundleDirFor: (row) => {
      const bookHash = row.fields_jsonb['bookHash']?.v;
      return typeof bookHash === 'string' ? `${bookHash}/mindmaps/${row.replica_id}` : null;
    },
  },
};

const depsFor = <T extends FakeMap | ImportedDictionary>(
  adapter: ReplicaAdapter<T>,
  rows: ReplicaRow[],
) => {
  const order: string[] = [];
  const deps = {
    adapter,
    pull: vi.fn(async () => rows),
    findByContentId: vi.fn((_id: string): T | undefined => undefined),
    applyRemote: vi.fn((_record: T) => {}),
    softDeleteByContentId: vi.fn(),
    createBundleDir: vi.fn(async (dir?: string) => dir ?? 'fresh-dir'),
    ensureDir: vi.fn(async (dir: string) => {
      order.push(`ensure:${dir}`);
    }),
    queueReplicaDownload: vi.fn((_id: string, _title: string, files: { lfp: string }[]) => {
      order.push(`queue:${files.map((file) => file.lfp).join(',')}`);
      return 'transfer-1';
    }),
    filesExist: vi.fn(async () => false),
  } satisfies PullAndApplyDeps<T>;
  return { deps, order };
};

const localMap = (synced: string | null): FakeMap => ({
  name: 'map1',
  mapId: 'map1',
  bundleDir: 'book1/mindmaps/map1',
  synced,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('replicaPullAndApply binary hooks', () => {
  test('a manifest naming another version queues it into incoming/, after creating that directory', async () => {
    const { deps, order } = depsFor(fakeMapAdapter, [rowOf()]);
    deps.findByContentId.mockReturnValue(localMap('v1'));
    await replicaPullAndApply(deps);
    expect(order).toEqual([
      'ensure:book1/mindmaps/map1/incoming',
      'queue:book1/mindmaps/map1/incoming/map1.v2.json',
    ]);
    expect(deps.queueReplicaDownload).toHaveBeenCalledWith(
      'map1',
      'map1',
      [{ logical: 'map1.v2.json', lfp: 'book1/mindmaps/map1/incoming/map1.v2.json', byteSize: 7 }],
      'book1/mindmaps/map1',
      'Books',
    );
    expect(deps.filesExist).not.toHaveBeenCalled();
  });

  test('a manifest naming the synced version queues nothing', async () => {
    const { deps } = depsFor(fakeMapAdapter, [rowOf()]);
    deps.findByContentId.mockReturnValue(localMap('v2'));
    await replicaPullAndApply(deps);
    expect(deps.queueReplicaDownload).not.toHaveBeenCalled();
    expect(deps.ensureDir).not.toHaveBeenCalled();
  });

  test('a new row lands in the directory bundleDirFor names and downloads its version', async () => {
    const { deps } = depsFor(fakeMapAdapter, [rowOf()]);
    await replicaPullAndApply(deps);
    expect(deps.createBundleDir).toHaveBeenCalledWith('book1/mindmaps/map1');
    expect(deps.applyRemote).toHaveBeenCalledWith(localMap(null));
    expect(deps.queueReplicaDownload).toHaveBeenCalledOnce();
  });

  test('a new row bundleDirFor rejects is skipped before any directory or record is made', async () => {
    const { deps } = depsFor(fakeMapAdapter, [rowOf({ fields_jsonb: {} })]);
    await replicaPullAndApply(deps);
    expect(deps.createBundleDir).not.toHaveBeenCalled();
    expect(deps.applyRemote).not.toHaveBeenCalled();
    expect(deps.queueReplicaDownload).not.toHaveBeenCalled();
  });

  test('kinds without the hooks keep uniqueId directories and the filesExist check', async () => {
    const row = rowOf({
      kind: 'dictionary',
      fields_jsonb: {
        name: { v: 'Webster', t: HLC, s: 'dev-a' },
        kind: { v: 'mdict', t: HLC, s: 'dev-a' },
        addedAt: { v: 1, t: HLC, s: 'dev-a' },
      },
      manifest_jsonb: {
        schemaVersion: 1,
        files: [{ filename: 'webster.mdx', byteSize: 3, partialMd5: 'x' }],
      },
    });
    const { deps } = depsFor(dictionaryAdapter, [row]);
    await replicaPullAndApply(deps);
    expect(deps.createBundleDir).toHaveBeenCalledWith();
    expect(deps.filesExist).toHaveBeenCalledWith('fresh-dir', ['webster.mdx']);
    expect(deps.ensureDir).not.toHaveBeenCalled();
    expect(deps.queueReplicaDownload).toHaveBeenCalledWith(
      'map1',
      'Webster',
      [{ logical: 'webster.mdx', lfp: 'fresh-dir/webster.mdx', byteSize: 3 }],
      'fresh-dir',
      'Dictionaries',
    );
  });
});
