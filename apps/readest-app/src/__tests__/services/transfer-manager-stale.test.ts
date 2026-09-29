import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { transferManager } from '@/services/transferManager';
import { clearReplicaAdapters, registerReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import { useTransferStore } from '@/store/transferStore';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';

const downloadReplicaFile = vi.fn(async () => {
  throw new Error('File not found');
});

const onStaleDownload = vi.fn();

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
  const appService = { downloadReplicaFile } as unknown as AppService;
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
  onStaleDownload.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
});
