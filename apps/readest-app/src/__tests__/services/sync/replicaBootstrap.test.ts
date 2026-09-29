import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/store/customDictionaryStore', () => ({
  useCustomDictionaryStore: { getState: () => ({ markAvailableByContentId: vi.fn() }) },
}));

vi.mock('@/store/customFontStore', () => ({
  useCustomFontStore: { getState: () => ({ markAvailableByContentId: vi.fn() }) },
}));

vi.mock('@/store/customTextureStore', () => ({
  useCustomTextureStore: { getState: () => ({ markAvailableByContentId: vi.fn() }) },
}));

const mindmapRuntime = vi.hoisted(() => ({
  handleMindmapDownload: vi.fn(async () => 'merged'),
  handleMindmapUpload: vi.fn(async () => {}),
}));

vi.mock('@/services/mindmap/sync/runtime', () => mindmapRuntime);

vi.mock('@/store/customOPDSStore', () => ({
  useCustomOPDSStore: {
    getState: () => ({ applyRemoteCatalog: vi.fn(), softDeleteByContentId: vi.fn() }),
  },
  findOPDSCatalogByContentId: vi.fn(),
}));

import {
  __resetBootstrapForTests,
  bootstrapReplicaAdapters,
} from '@/services/sync/replicaBootstrap';
import {
  clearReplicaAdapters,
  getReplicaAdapter,
  listReplicaAdapters,
} from '@/services/sync/replicaRegistry';
import {
  __resetReplicaTransferIntegrationForTests,
  startReplicaTransferIntegration,
} from '@/services/sync/replicaTransferIntegration';
import { dictionaryAdapter } from '@/services/sync/adapters/dictionary';
import { mindmapAdapter } from '@/services/sync/adapters/mindmap';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';

vi.mock('@/services/sync/replicaPublish', () => ({
  publishReplicaManifest: vi.fn(async () => {}),
}));

afterEach(() => {
  clearReplicaAdapters();
  __resetBootstrapForTests();
  __resetReplicaTransferIntegrationForTests();
});

describe('bootstrapReplicaAdapters', () => {
  test('registers the dictionary adapter', () => {
    bootstrapReplicaAdapters();
    expect(getReplicaAdapter('dictionary')).toBe(dictionaryAdapter);
  });

  test('is idempotent: calling twice is a no-op (does not throw)', () => {
    bootstrapReplicaAdapters();
    bootstrapReplicaAdapters();
    expect(listReplicaAdapters()).toHaveLength(6);
  });

  test('registers the current allowlist (dictionary, font, texture, opds_catalog, settings, mindmap)', () => {
    bootstrapReplicaAdapters();
    const kinds = listReplicaAdapters().map((a) => a.kind);
    expect(kinds).toEqual(['dictionary', 'font', 'texture', 'opds_catalog', 'settings', 'mindmap']);
    expect(getReplicaAdapter('mindmap')).toBe(mindmapAdapter);
  });

  test('routes finished mind map downloads and uploads to the mind map sync runtime', async () => {
    bootstrapReplicaAdapters();
    startReplicaTransferIntegration({
      openFile: async (path: string) => new File(['x'], path),
    } as unknown as AppService);
    const files = [{ logical: 'm1.v.json', lfp: 'b/m1/incoming/m1.v.json', byteSize: 1 }];
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'm1',
      type: 'download',
      files,
    });
    await eventDispatcher.dispatch('replica-transfer-complete', {
      kind: 'mindmap',
      replicaId: 'm1',
      type: 'upload',
      files,
    });
    expect(mindmapRuntime.handleMindmapDownload).toHaveBeenCalledWith('m1', files);
    expect(mindmapRuntime.handleMindmapUpload).toHaveBeenCalledWith('m1', files);
  });
});
