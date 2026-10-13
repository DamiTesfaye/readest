import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/services/sync/replicaPublish', () => ({
  publishReplicaManifest: vi.fn(),
}));

import { publishReplicaManifest } from '@/services/sync/replicaPublish';
import { clearReplicaAdapters, registerReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import {
  __resetReplicaTransferIntegrationForTests,
  registerReplicaDownloadHandler,
  registerReplicaUploadHandler,
  startReplicaTransferIntegration,
} from '@/services/sync/replicaTransferIntegration';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';

const mockPublish = vi.mocked(publishReplicaManifest);

const adapter: ReplicaAdapter<unknown> = {
  kind: 'mindmap',
  schemaVersion: 1,
  pack: () => ({}),
  unpack: () => ({}),
  computeId: async () => '',
  unpackRow: () => ({}),
  binary: { localBaseDir: 'Books', enumerateFiles: () => [] },
};

const FILES = [{ logical: 'map1.v2.json', lfp: 'b/outgoing/map1.v2.json', byteSize: 3 }];

const appService = {
  openFile: vi.fn(async (path: string) => new File(['abc'], path)),
} as unknown as AppService;

beforeEach(() => {
  __resetReplicaTransferIntegrationForTests();
  clearReplicaAdapters();
  vi.clearAllMocks();
  registerReplicaAdapter(adapter);
  startReplicaTransferIntegration(appService);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __resetReplicaTransferIntegrationForTests();
  clearReplicaAdapters();
  vi.restoreAllMocks();
});

describe('replica transfer handlers', () => {
  test('a download handler receives the downloaded files and is awaited', async () => {
    const seen: string[] = [];
    registerReplicaDownloadHandler('mindmap', async (replicaId, files) => {
      await Promise.resolve();
      seen.push(`${replicaId}:${files.map((file) => file.lfp).join(',')}`);
    });
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'map1',
      type: 'download',
      files: FILES,
    });
    expect(seen).toEqual(['map1:b/outgoing/map1.v2.json']);
  });

  test('a failing download handler is logged, not thrown', async () => {
    registerReplicaDownloadHandler('mindmap', async () => {
      throw new Error('merge failed');
    });
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'map1',
      type: 'download',
      files: FILES,
    });
    expect(console.warn).toHaveBeenCalledWith(
      'replica-transfer-complete download handler failed',
      expect.any(Error),
    );
  });

  test('an upload handler runs after the manifest is published', async () => {
    const order: string[] = [];
    mockPublish.mockImplementation(async () => {
      order.push('publish');
      return true;
    });
    registerReplicaUploadHandler('mindmap', async (replicaId, files) => {
      order.push(`uploaded:${replicaId}:${files[0]!.logical}`);
    });
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'map1',
      type: 'upload',
      files: FILES,
    });
    expect(order).toEqual(['publish', 'uploaded:map1:map1.v2.json']);
  });

  test('an upload handler does not run when the manifest publish fails', async () => {
    const handler = vi.fn();
    mockPublish.mockRejectedValue(new Error('offline'));
    registerReplicaUploadHandler('mindmap', handler);
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'map1',
      type: 'upload',
      files: FILES,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test('an upload handler does not run when the manifest was not published', async () => {
    const handler = vi.fn();
    mockPublish.mockResolvedValue(false);
    registerReplicaUploadHandler('mindmap', handler);
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'map1',
      type: 'upload',
      files: FILES,
    });
    expect(mockPublish).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  test('registering a second upload handler for a kind throws', () => {
    registerReplicaUploadHandler('mindmap', vi.fn());
    expect(() => registerReplicaUploadHandler('mindmap', vi.fn())).toThrow();
  });
});
