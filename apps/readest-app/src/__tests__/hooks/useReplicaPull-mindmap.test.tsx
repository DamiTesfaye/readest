import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PullAndApplyDeps, ReplicaLocalRecord } from '@/services/sync/replicaPullAndApply';

const h = vi.hoisted(() => ({
  order: [] as string[],
  applied: [] as PullAndApplyDeps<ReplicaLocalRecord>[],
  queueReplicaDownload: vi.fn(),
  createDir: vi.fn(async () => {}),
}));

vi.mock('@/services/sync/replicaPullAndApply', () => ({
  replicaPullAndApply: async (deps: PullAndApplyDeps<ReplicaLocalRecord>) => {
    h.order.push(`apply:${deps.adapter.kind}`);
    h.applied.push(deps);
  },
}));
vi.mock('@/services/mindmap/sync/runtime', () => ({
  beginMindmapPull: async () => {
    h.order.push('begin:mindmap');
  },
  finishMindmapPull: async () => {
    h.order.push('finish:mindmap');
  },
}));
vi.mock('@/services/sync/replicaSync', () => ({
  getReplicaSync: () => ({
    manager: {
      pull: async () => [],
      pullMany: async (kinds: string[]) => new Map(kinds.map((kind) => [kind, []])),
    },
  }),
  subscribeReplicaSyncReady: (listener: () => void) => {
    listener();
    return () => {};
  },
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: { name: 'env' }, appService: { createDir: h.createDir } }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/services/transferManager', () => ({
  transferManager: { queueReplicaDownload: h.queueReplicaDownload },
}));
vi.mock('@/utils/access', () => ({ getAccessToken: async () => 'token' }));

import {
  LIBRARY_REPLICA_KINDS,
  READER_REPLICA_KINDS,
  __resetReplicaPullForTests,
  useReplicaPull,
} from '@/hooks/useReplicaPull';

const mindmapDeps = (): PullAndApplyDeps<ReplicaLocalRecord> => {
  const deps = h.applied.find((applied) => applied.adapter.kind === 'mindmap');
  if (!deps) throw new Error('mindmap was not pulled');
  return deps;
};

beforeEach(() => {
  vi.useFakeTimers();
  h.order.length = 0;
  h.applied.length = 0;
  __resetReplicaPullForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  cleanup();
});

const bootPull = async (): Promise<void> => {
  renderHook(() => useReplicaPull({ kinds: ['mindmap'], delayMs: 10 }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
};

describe('useReplicaPull mindmap kind', () => {
  test('the reader and library pages pull mind maps', () => {
    expect(READER_REPLICA_KINDS).toContain('mindmap');
    expect(LIBRARY_REPLICA_KINDS).toContain('mindmap');
  });

  test('hydrates through the sync runtime and finishes the sync cycle after the pull', async () => {
    await bootPull();
    expect(h.order.filter((step) => step.endsWith(':mindmap'))).toEqual([
      'apply:mindmap',
      'finish:mindmap',
    ]);
    await mindmapDeps().hydrateLocalStore!();
    expect(h.order).toContain('begin:mindmap');
  });

  test('creates the directory a new map names and the incoming/ directory before downloads', async () => {
    await bootPull();
    const deps = mindmapDeps();
    expect(await deps.createBundleDir('book1/mindmaps/map1')).toBe('book1/mindmaps/map1');
    await deps.ensureDir!('book1/mindmaps/map1/incoming');
    expect(h.createDir.mock.calls).toEqual([
      ['book1/mindmaps/map1', 'Books', true],
      ['book1/mindmaps/map1/incoming', 'Books', true],
    ]);
  });

  test('downloads map versions as background transfers', async () => {
    await bootPull();
    const files = [{ logical: 'v.json', lfp: 'd/incoming/v.json', byteSize: 3 }];
    mindmapDeps().queueReplicaDownload('map1', 'Map', files, 'd', 'Books');
    expect(h.queueReplicaDownload).toHaveBeenCalledWith('mindmap', 'map1', 'Map', files, 'Books', {
      isBackground: true,
    });
  });
});
