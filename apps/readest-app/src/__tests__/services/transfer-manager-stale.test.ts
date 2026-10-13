import {
  type MockInstance,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { STORAGE_FILE_NOT_FOUND_ERROR } from '@/libs/errors';
import { transferManager } from '@/services/transferManager';
import { clearReplicaAdapters, registerReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import { useTransferStore } from '@/store/transferStore';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';

const downloadReplicaFile = vi.fn(async () => {
  throw new Error(STORAGE_FILE_NOT_FOUND_ERROR);
});

const uploadReplicaFile = vi.fn(async () => {
  throw new Error(STORAGE_FILE_NOT_FOUND_ERROR);
});

const onStaleDownload = vi.fn();

let warn: MockInstance<Console['warn']>;

const adapterOf = (kind: string, staleWhenMissing: boolean): ReplicaAdapter<unknown> => ({
  kind,
  schemaVersion: 1,
  pack: () => ({}),
  unpack: () => ({}),
  computeId: async () => '',
  unpackRow: () => ({}),
  binary: { localBaseDir: 'Books', enumerateFiles: () => [], staleWhenMissing, onStaleDownload },
});

const FILES = [{ logical: 'map1.v2.json', lfp: 'b/incoming/map1.v2.json', byteSize: 3 }];

beforeAll(async () => {
  const appService = { downloadReplicaFile, uploadReplicaFile } as unknown as AppService;
  await transferManager.initialize(
    appService,
    () => [],
    async () => {},
    (key: string) => key,
  );
});

beforeEach(() => {
  clearReplicaAdapters();
  registerReplicaAdapter(adapterOf('mindmap', true));
  registerReplicaAdapter(adapterOf('font', false));
  useTransferStore.setState({ transfers: {} });
  downloadReplicaFile.mockClear();
  uploadReplicaFile.mockClear();
  onStaleDownload.mockClear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('replica downloads whose file is gone', () => {
  test('are dropped without a retry or a toast for kinds that treat them as stale', async () => {
    const toast = vi.spyOn(eventDispatcher, 'dispatch');
    const id = transferManager.queueReplicaDownload('mindmap', 'map1', 'Map', FILES, 'Books', {
      isBackground: true,
    });
    await vi.waitFor(() => expect(useTransferStore.getState().transfers[id!]).toBeUndefined());
    expect(downloadReplicaFile).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalledWith('toast', expect.anything());
    expect(onStaleDownload).toHaveBeenCalledExactlyOnceWith('map1', ['map1.v2.json']);
    expect(warn).toHaveBeenCalledWith('replica download is stale', {
      kind: 'mindmap',
      replicaId: 'map1',
    });
  });

  test('are retried for every other kind', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const id = transferManager.queueReplicaDownload('font', 'font1', 'Font', FILES, 'Books');
      await vi.advanceTimersByTimeAsync(20_000);
      expect(useTransferStore.getState().transfers[id!]?.status).toBe('failed');
      expect(downloadReplicaFile.mock.calls.length).toBeGreaterThan(1);
      expect(onStaleDownload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('leave an upload that fails with the same error to retry and fail as usual', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const id = transferManager.queueReplicaUpload('mindmap', 'map1', 'Map', FILES, 'Books', {
        isBackground: true,
      });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(useTransferStore.getState().transfers[id!]?.status).toBe('failed');
      expect(uploadReplicaFile.mock.calls.length).toBeGreaterThan(1);
      expect(onStaleDownload).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalledWith('replica download is stale', expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });
});
