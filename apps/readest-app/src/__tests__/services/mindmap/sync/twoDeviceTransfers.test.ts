import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import {
  BOOK,
  USER,
  cloudPath,
  createMap,
  createMindmapSim,
  deferred,
  drain,
  type Device,
  edit,
  entryOf,
  localText,
  localVersion,
  nodeRecord,
  pull,
  pullDeps,
  push,
  settle,
  transfersOf,
} from '@/__tests__/helpers/mindmapSyncSim';
import type { AppService } from '@/types/system';

const holder = vi.hoisted(() => ({
  cloud: null as FakeReplicaCloud | null,
  service: null as AppService | null,
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: () => holder.cloud!.client(),
  createSupabaseAdminClient: () => holder.cloud!.client(),
}));
vi.mock('@/utils/object', () => ({
  deleteObject: async (fileKey: string) => holder.cloud!.deleteObject(fileKey),
}));
vi.mock('@/utils/access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/access')>()),
  validateUserAndToken: async () => ({ user: { id: 'u1' }, token: 'token' }),
  getAccessToken: async () => 'token',
  getUserID: async () => 'u1',
}));
vi.mock('@/services/environment', () => ({
  default: { getAppService: async () => holder.service },
}));

const { cloud, startDevice, stopAll, serverVersion, serverText } = createMindmapSim(holder);

const RETRIES_EXHAUSTED_MS = 15_000;

const exhaustRetries = async (device: Device, type: 'upload' | 'download'): Promise<void> => {
  await vi.advanceTimersByTimeAsync(RETRIES_EXHAUSTED_MS);
  await vi.waitFor(
    () =>
      expect(
        transfersOf(device).filter((t) => t.type === type && t.status === 'failed'),
      ).toHaveLength(1),
    { timeout: 5_000, interval: 10 },
  );
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stopAll();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('mind map sync when an upload fails', () => {
  it('spaces the upload attempts by the retry backoff', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Blip');
    a.knobs.uploadFailures = 4;
    const sync = await a.m.runtime.getMindmapSync();
    expect(await sync.pusher.pushNow(mapId)).toBe('queued');
    await exhaustRetries(a, 'upload');
    const attempts = a.knobs.uploadAttempts;
    expect(attempts).toHaveLength(4);
    expect(attempts[3]! - attempts[0]!).toBeGreaterThanOrEqual(14_000);
  });

  it('pushes the map again on a later pull in the same session once the network is back', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Blip');
    a.knobs.uploadFailures = 4;
    const sync = await a.m.runtime.getMindmapSync();
    expect(await sync.pusher.pushNow(mapId)).toBe('queued');
    await exhaustRetries(a, 'upload');
    expect(sync.pusher.unpushed()).toEqual([mapId]);
    expect(serverVersion(mapId)).toBeUndefined();

    await pull(a);
    expect(serverVersion(mapId)).toBe(await localVersion(a, mapId));
    expect(entryOf(a, mapId)!.syncedMd5).not.toBeNull();
    expect(sync.pusher.unpushed()).toEqual([]);
    const b = await startDevice('dev-b');
    await pull(b);
    expect(await localText(b, mapId)).toBe(await localText(a, mapId));
  });

  it('does not raise an error toast for a background map upload that fails', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Blip');
    a.knobs.uploadFailures = 4;
    await (await a.m.runtime.getMindmapSync()).pusher.pushNow(mapId);
    await exhaustRetries(a, 'upload');
    expect(transfersOf(a).every((t) => t.isBackground)).toBe(true);
    expect(a.toasts.filter((toast) => toast.type === 'error')).toEqual([]);
  });
});

describe('mind map sync when a newer version was seen but not merged', () => {
  const sharedMapEditedOnB = async (a: Device, b: Device): Promise<string> => {
    await pull(a);
    const mapId = await createMap(a, 'Shared');
    await push(a, mapId);
    await pull(b);
    await edit(b, mapId, (session) => session.store.put([nodeRecord('n-b', 'Added on B')]));
    await push(b, mapId);
    expect(serverText(mapId)).toContain('Added on B');
    return mapId;
  };

  it('merges the version it could not download before pushing over it', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await sharedMapEditedOnB(a, b);
    await edit(a, mapId, (session) => session.updateMeta({ title: 'Edited on A' }));
    a.knobs.downloadFailures = 4;
    await a.m.pullAndApply.replicaPullAndApply(pullDeps(a));
    await exhaustRetries(a, 'download');
    expect(a.m.versions.latestMindmapManifest(mapId)?.filename).toBe(serverVersion(mapId));

    expect(await push(a, mapId)).toBe('deferred');
    expect(serverText(mapId)).toContain('Edited on A');
    expect(serverText(mapId)).toContain('Added on B');
    const c = await startDevice('dev-c');
    await pull(c);
    expect(await localText(c, mapId)).toContain('Added on B');
    expect(await localText(c, mapId)).toContain('Edited on A');
  });

  it('does not let a manifest naming a missing file block its pushes', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await sharedMapEditedOnB(a, b);
    cloud().objects.delete(`${USER}/${cloudPath('mindmap', mapId, serverVersion(mapId)!)}`);
    await edit(a, mapId, (session) => session.updateMeta({ title: 'Edited on A' }));
    a.m.transfers.transferManager.pauseQueue();
    await a.m.pullAndApply.replicaPullAndApply(pullDeps(a));
    const sync = await a.m.runtime.getMindmapSync();
    expect(await sync.pusher.pushNow(mapId)).toBe('deferred');
    a.m.transfers.transferManager.resumeQueue();
    await drain(a);
    expect(transfersOf(a).filter((t) => t.type === 'download')).toEqual([]);
    expect(a.m.versions.latestMindmapManifest(mapId)).toBeUndefined();

    a.m.transfers.transferManager.pauseQueue();
    await a.m.pullAndApply.replicaPullAndApply(pullDeps(a));
    await a.m.runtime.finishMindmapPull();
    a.m.transfers.transferManager.resumeQueue();
    await settle(a);
    expect(serverVersion(mapId)).toBe(await localVersion(a, mapId));
    expect(serverText(mapId)).toContain('Edited on A');

    await pull(b);
    await pull(a);
    expect(await localText(a, mapId)).toBe(await localText(b, mapId));
    expect(await localText(a, mapId)).toContain('Added on B');
    expect(serverVersion(mapId)).toBe(await localVersion(a, mapId));
  });
});

describe('mind map sync when a map is deleted while its transfers run', () => {
  it('does not bring a map back when a download merge finishes after the map was deleted', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    await pull(a);
    await pull(b);
    const mapId = await createMap(a, 'Racing');
    await push(a, mapId);
    const held = deferred();
    b.knobs.incomingReadGate = held.promise;
    await b.m.pullAndApply.replicaPullAndApply(pullDeps(b));
    await vi.waitFor(
      () => expect(transfersOf(b).some((t) => t.status === 'completed')).toBe(true),
      { timeout: 5_000, interval: 10 },
    );
    await b.m.deleteMap.deleteMindmap(mapId, BOOK);
    expect(entryOf(b, mapId)).toBeUndefined();
    b.knobs.incomingReadGate = null;
    held.release();
    await vi.waitFor(() => expect(b.handled).toBe(1), { timeout: 5_000, interval: 10 });
    await settle(b);

    const sync = await b.m.runtime.getMindmapSync();
    const listed = await b.m.index.loadMindmapIndex(sync.fs, BOOK);
    expect(listed.map((entry) => entry.mapId)).not.toContain(mapId);
    expect(await b.fs.exists(b.m.maps.mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    expect(entryOf(b, mapId)).toBeUndefined();
    await pull(a);
    expect(entryOf(a, mapId)).toBeUndefined();
  });

  it('cancels the waiting download of a map deleted on this device', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    await pull(a);
    await pull(b);
    const mapId = await createMap(a, 'Waiting');
    await push(a, mapId);
    b.knobs.downloadFailures = 1;
    await b.m.pullAndApply.replicaPullAndApply(pullDeps(b));
    await vi.waitFor(
      () =>
        expect(
          transfersOf(b).some(
            (t) => t.type === 'download' && t.status === 'pending' && t.retryCount === 1,
          ),
        ).toBe(true),
      { timeout: 5_000, interval: 10 },
    );
    await b.m.deleteMap.deleteMindmap(mapId, BOOK);
    await vi.advanceTimersByTimeAsync(RETRIES_EXHAUSTED_MS);

    expect(
      transfersOf(b)
        .filter((t) => t.type === 'download')
        .map((t) => t.status),
    ).toEqual(['cancelled']);
    expect(b.handled).toBe(0);
    expect(await b.fs.exists(b.m.maps.mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    expect(b.toasts.filter((toast) => toast.type === 'error')).toEqual([]);
  });

  it('cancels the waiting upload of a map deleted on this device only', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Unsent');
    a.knobs.uploadFailures = 1;
    expect(await (await a.m.runtime.getMindmapSync()).pusher.pushNow(mapId)).toBe('queued');
    await vi.waitFor(
      () =>
        expect(
          transfersOf(a).some(
            (t) => t.type === 'upload' && t.status === 'pending' && t.retryCount === 1,
          ),
        ).toBe(true),
      { timeout: 5_000, interval: 10 },
    );
    await a.m.deleteMap.deleteMindmapLocally(mapId, BOOK);
    await vi.advanceTimersByTimeAsync(RETRIES_EXHAUSTED_MS);

    expect(
      transfersOf(a)
        .filter((t) => t.type === 'upload')
        .map((t) => t.status),
    ).toEqual(['cancelled']);
    expect(a.knobs.uploadAttempts).toHaveLength(1);
    expect(serverVersion(mapId)).toBeUndefined();
    expect(a.toasts.filter((toast) => toast.type === 'error')).toEqual([]);
  });
});
