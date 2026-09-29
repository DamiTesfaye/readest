import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import type { AppService } from '@/types/system';

const h = vi.hoisted(() => ({
  service: null as AppService | null,
  token: 'token' as string | null,
  queueReplicaUpload: vi.fn((..._args: unknown[]) => 'upload-1' as string | null),
  queueReplicaDownload: vi.fn((..._args: unknown[]) => 'download-1' as string | null),
  publishReplicaUpsert: vi.fn(async (..._args: unknown[]) => {}),
  publishReplicaDelete: vi.fn(async (..._args: unknown[]) => true),
  mindmapSupported: true,
  appServiceError: null as Error | null,
  flush: vi.fn(async () => {}),
  syncContext: true,
}));

vi.mock('@/services/environment', () => ({
  default: {
    getAppService: async () => {
      if (h.appServiceError) throw h.appServiceError;
      return h.service;
    },
  },
}));
vi.mock('@/services/transferManager', () => ({
  transferManager: {
    isReady: () => true,
    queueReplicaUpload: h.queueReplicaUpload,
    queueReplicaDownload: h.queueReplicaDownload,
  },
}));
vi.mock('@/utils/access', () => ({ getAccessToken: async () => h.token }));
vi.mock('@/services/sync/replicaPublish', () => ({
  publishReplicaUpsert: h.publishReplicaUpsert,
  publishReplicaDelete: h.publishReplicaDelete,
}));
vi.mock('@/services/sync/replicaSync', async (importOriginal) => {
  const { HlcGenerator } = await import('@/libs/crdt');
  const context = {
    hlc: new HlcGenerator('dev-a'),
    deviceId: 'dev-a',
    manager: {
      isKindSupported: (kind: string) => kind !== 'mindmap' || h.mindmapSupported,
      flush: () => h.flush(),
    },
  };
  return {
    ...(await importOriginal<typeof import('@/services/sync/replicaSync')>()),
    getReplicaSync: () => (h.syncContext ? context : null),
  };
});

import { HlcGenerator } from '@/libs/crdt';
import { canonicalStringify, md5Hex } from '@/services/mindmap/file/canonicalStringify';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { stampMeta } from '@/services/mindmap/file/stampDiff';
import { mapFileDir, readMapFile } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import {
  __resetMindmapTrashForTests,
  hasPendingTombstone,
  listTrashedMaps,
} from '@/services/mindmap/persist/mindmapTrash';
import { __resetMapSessionsForTests } from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import {
  __resetMindmapSyncForTests,
  beginMindmapPull,
  finishMindmapPull,
  getMindmapSync,
  handleMindmapDownload,
  handleMindmapUpload,
} from '@/services/mindmap/sync/runtime';
import {
  __resetMindmapManifestsForTests,
  noteMindmapManifest,
  versionFilename,
} from '@/services/mindmap/sync/versions';
import { mindmapAdapter } from '@/services/sync/adapters/mindmap';
import { clearReplicaAdapters, registerReplicaAdapter } from '@/services/sync/replicaRegistry';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransferStore } from '@/store/transferStore';
import type { SystemSettings } from '@/types/settings';

const BOOK = 'book1';
const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
let fs: MemoryFileSystem;

const serviceOver = (memory: MemoryFileSystem): AppService =>
  ({
    exists: memory.exists.bind(memory),
    readFile: memory.readFile.bind(memory),
    writeFile: memory.writeFile.bind(memory),
    copyFile: memory.copyFile.bind(memory),
    createDir: memory.createDir.bind(memory),
    readDirectory: memory.readDir.bind(memory),
    deleteDir: memory.removeDir.bind(memory),
    deleteFile: memory.removeFile.bind(memory),
  }) as unknown as AppService;

const createMap = async (title = 'Characters'): Promise<string> =>
  (await useMindmapStore.getState().createMap(BOOK, { ...DEFAULT_MAP_META, title }, clock)).mapId;

beforeEach(async () => {
  fs = new MemoryFileSystem();
  h.service = serviceOver(fs);
  h.token = 'token';
  h.mindmapSupported = true;
  h.appServiceError = null;
  h.syncContext = true;
  h.flush.mockImplementation(async () => {});
  h.publishReplicaDelete.mockImplementation(async () => true);
  useSettingsStore.setState({
    settings: { replicaDeviceId: 'dev-a', syncCategories: {} } as SystemSettings,
  });
  useTransferStore.setState({ transfers: {} });
  clearReplicaAdapters();
  registerReplicaAdapter(mindmapAdapter);
  await useMindmapStore.getState().hydrate((await getMindmapSync()).fs);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  __resetMindmapSyncForTests();
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
  __resetMindmapManifestsForTests();
  clearReplicaAdapters();
});

describe('mindmap sync runtime', () => {
  it('pushes through the existing upload path as a background transfer', async () => {
    const mapId = await createMap();
    expect(await (await getMindmapSync()).pusher.pushNow(mapId)).toBe('queued');
    expect(h.publishReplicaUpsert).toHaveBeenCalledWith(
      'mindmap',
      useMindmapStore.getState().getEntry(mapId),
      mapId,
    );
    const [kind, replicaId, , files, base, options] = h.queueReplicaUpload.mock.calls[0]!;
    expect([kind, replicaId, base]).toEqual(['mindmap', mapId, 'Books']);
    expect(options).toMatchObject({ isBackground: true });
    expect(files).toEqual([
      expect.objectContaining({
        lfp: expect.stringContaining(`${mapFileDir(BOOK, mapId)}/outgoing/`),
      }),
    ]);
  });

  it.each([
    ['signed out', () => void (h.token = null)],
    [
      'mind map sync turned off',
      () =>
        useSettingsStore.setState({
          settings: {
            replicaDeviceId: 'dev-a',
            syncCategories: { mindmap: false },
          } as SystemSettings,
        }),
    ],
    ['offline', () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)],
    ['the server does not know mind maps', () => void (h.mindmapSupported = false)],
  ])('writes and uploads nothing while %s', async (_label, arrange) => {
    const mapId = await createMap();
    arrange();
    expect(await (await getMindmapSync()).pusher.pushNow(mapId)).toBe('skipped');
    expect(h.queueReplicaUpload).not.toHaveBeenCalled();
    expect(await fs.readDir(`${mapFileDir(BOOK, mapId)}/outgoing`, 'Books')).toEqual([]);
  });

  it('retries creating the runtime after a failed attempt', async () => {
    __resetMindmapSyncForTests();
    h.appServiceError = new Error('not ready');
    await expect(getMindmapSync()).rejects.toThrow('not ready');
    h.appServiceError = null;
    await expect(getMindmapSync()).resolves.toMatchObject({ service: h.service });
  });

  it('sees an upload of the map that is still queued as pending', async () => {
    const mapId = await createMap();
    useTransferStore.getState().addReplicaTransfer('mindmap', mapId, 'Map', 'upload', {});
    expect(await (await getMindmapSync()).pusher.pushNow(mapId)).toBe('pending');
  });

  it('marks the version synced when its upload commits', async () => {
    const mapId = await createMap();
    await (await getMindmapSync()).pusher.pushNow(mapId);
    const [, , , files] = h.queueReplicaUpload.mock.calls[0]!;
    await handleMindmapUpload(mapId, files as never);
    const read = await readMapFile(fs, BOOK, mapId);
    expect(useMindmapStore.getState().getEntry(mapId)!.syncedMd5).toBe(
      md5Hex(canonicalStringify(read!.file)),
    );
  });

  it('marks the version synced only after the replica flush has sent its manifest', async () => {
    const mapId = await createMap();
    await (await getMindmapSync()).pusher.pushNow(mapId);
    const [, , , files] = h.queueReplicaUpload.mock.calls[0]!;
    let release: () => void = () => {};
    h.flush.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const commit = handleMindmapUpload(mapId, files as never);
    await vi.waitFor(() => expect(h.flush).toHaveBeenCalledOnce());
    expect(useMindmapStore.getState().getEntry(mapId)!.syncedMd5).toBeNull();
    release();
    await commit;
    expect(useMindmapStore.getState().getEntry(mapId)!.syncedMd5).not.toBeNull();
  });

  it.each([
    ['the replica flush fails', () => h.flush.mockRejectedValueOnce(new Error('Network error'))],
    ['sync has no context', () => void (h.syncContext = false)],
    [
      'the server stops supporting mind maps during the flush',
      () =>
        h.flush.mockImplementationOnce(async () => {
          h.mindmapSupported = false;
        }),
    ],
  ])('keeps the version unsynced and its copy when %s', async (_label, arrange) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mapId = await createMap();
    const sync = await getMindmapSync();
    await sync.pusher.pushNow(mapId);
    const [, , , files] = h.queueReplicaUpload.mock.calls[0]!;
    arrange();
    await handleMindmapUpload(mapId, files as never);
    expect(useMindmapStore.getState().getEntry(mapId)!.syncedMd5).toBeNull();
    expect(await fs.readDir(`${mapFileDir(BOOK, mapId)}/outgoing`, 'Books')).toHaveLength(1);
    expect(sync.pusher.unpushed()).toEqual([mapId]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('mindmap'),
      expect.objectContaining({ mapId }),
    );
  });

  it('merges a download and queues a newer version into incoming/ in the background', async () => {
    const mapId = await createMap();
    const read = await readMapFile(fs, BOOK, mapId);
    const text = canonicalStringify(stampMeta(read!.file, { title: 'Remote' }, clock));
    const name = versionFilename(mapId, md5Hex(text));
    const lfp = `${mapFileDir(BOOK, mapId)}/incoming/${name}`;
    await fs.writeFile(lfp, 'Books', text);
    const newer = {
      filename: versionFilename(mapId, 'e'.repeat(32)),
      byteSize: 7,
      partialMd5: 'x',
    };
    noteMindmapManifest(mapId, newer);
    expect(await handleMindmapDownload(mapId, [{ logical: name, lfp, byteSize: 1 }])).toBe(
      'merged',
    );
    expect(h.queueReplicaDownload).toHaveBeenCalledWith(
      'mindmap',
      mapId,
      'Remote',
      [
        {
          logical: newer.filename,
          lfp: `${mapFileDir(BOOK, mapId)}/incoming/${newer.filename}`,
          byteSize: 7,
        },
      ],
      'Books',
      { isBackground: true },
    );
  });

  it('empties the trash of maps deleted before the pull and pushes every map once per app start', async () => {
    const kept = await createMap('Kept');
    const trashed = await createMap('Trashed');
    await useMindmapStore.getState().moveToTrash(trashed);
    await beginMindmapPull();
    await finishMindmapPull();
    expect(await listTrashedMaps(fs)).toEqual([]);
    expect(h.queueReplicaUpload.mock.calls.map((call) => call[1])).toEqual([kept]);
    await beginMindmapPull();
    await finishMindmapPull();
    expect(h.queueReplicaUpload).toHaveBeenCalledOnce();
  });

  it('after the first pull, pushes again only the maps it could not push before', async () => {
    h.token = null;
    await beginMindmapPull();
    await finishMindmapPull();
    const mapId = await createMap();
    await (await getMindmapSync()).pusher.pushNow(mapId);
    h.token = 'token';
    await beginMindmapPull();
    await finishMindmapPull();
    expect(h.queueReplicaUpload.mock.calls.map((call) => call[1])).toEqual([mapId]);
  });
});

describe('mindmap sync runtime with a delete the server has not seen', () => {
  const deletedMap = async (): Promise<string> => {
    const mapId = await createMap('Deleted');
    await useMindmapStore.getState().moveToTrash(mapId, BOOK, { tombstone: true });
    return mapId;
  };

  it('sends the pending delete again at the pull and confirms it once the flush succeeds', async () => {
    const mapId = await deletedMap();
    await beginMindmapPull();
    expect(h.publishReplicaDelete).toHaveBeenCalledWith('mindmap', mapId);
    expect(h.flush).toHaveBeenCalled();
    expect(hasPendingTombstone(mapId)).toBe(true);
    await finishMindmapPull();
    expect(hasPendingTombstone(mapId)).toBe(false);
    expect(await listTrashedMaps(fs)).toEqual([]);
  });

  it('keeps the delete pending when the flush fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.flush.mockRejectedValue(new Error('offline'));
    const mapId = await deletedMap();
    await beginMindmapPull();
    await finishMindmapPull();
    expect(warn).toHaveBeenCalledWith(
      'mindmap: could not send the delete of a map',
      expect.objectContaining({ mapIds: [mapId] }),
    );
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId, tombstone: true }]);
  });

  it('keeps the delete pending when the server does not support mind maps', async () => {
    h.mindmapSupported = false;
    const mapId = await deletedMap();
    await beginMindmapPull();
    await finishMindmapPull();
    expect(hasPendingTombstone(mapId)).toBe(true);
  });

  it('keeps the delete pending without flushing when it cannot be published', async () => {
    h.publishReplicaDelete.mockImplementation(async () => false);
    const mapId = await deletedMap();
    await beginMindmapPull();
    await finishMindmapPull();
    expect(h.flush).not.toHaveBeenCalled();
    expect(hasPendingTombstone(mapId)).toBe(true);
  });
});
