import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import {
  BOOK,
  USER,
  byteLength,
  cloudPath,
  createMap,
  createMindmapSim,
  type Device,
  drain,
  edit,
  entryOf,
  errorToasts,
  fieldOf,
  localText,
  metaOf,
  nodeRecord,
  openMap,
  pull,
  pullDeps,
  push,
  settle,
  syncRounds,
  transfersOf,
} from '@/__tests__/helpers/mindmapSyncSim';
import type { AppService } from '@/types/system';
import { hlcPack } from '@/libs/crdt';

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

const { startDevice, stopAll, serverVersion, storedVersions, expectConverged } =
  createMindmapSim(holder);

beforeEach(() => {
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  stopAll();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('mind map sync between two devices', () => {
  it('delivers a new map to the other device byte for byte', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    expect(b.m.store.useMindmapStore).not.toBe(a.m.store.useMindmapStore);
    const mapId = await createMap(a, 'Personnages é 人物');
    expect(await push(a, mapId)).toBe('queued');
    await pull(b);
    await expectConverged(mapId, a, b);
    expect(entryOf(b, mapId)).toMatchObject({ bookHash: BOOK, name: 'Personnages é 人物' });
    expect(transfersOf(b).every((t) => t.isBackground)).toBe(true);
    expect([...errorToasts(a), ...errorToasts(b)]).toEqual([]);
  });

  it('converges after concurrent edits when the commit with the lower clock loses and is pruned', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Shared');
    await push(a, mapId);
    await pull(b);
    await edit(a, mapId, (session) => session.updateMeta({ title: 'Renamed on A' }));
    await edit(b, mapId, (session) => session.store.put([nodeRecord('n-b', 'Added on B')]));
    const syncB = await b.m.runtime.getMindmapSync();
    expect(await syncB.pusher.pushNow(mapId)).toBe('queued');
    await drain(b);
    await push(a, mapId);
    const winner = serverVersion(mapId);
    await b.m.replicaSync.getReplicaSync()!.manager.flush();
    expect(serverVersion(mapId)).toBe(winner);
    expect(storedVersions(mapId).map((row) => row.file_key)).toEqual([
      `${USER}/${cloudPath('mindmap', mapId, winner!)}`,
    ]);
    for (let round = 0; round < 3; round++) {
      await pull(a);
      await pull(b);
    }
    await expectConverged(mapId, a, b);
    const text = await localText(a, mapId);
    expect(text).toContain('Renamed on A');
    expect(text).toContain('Added on B');
    expect(await push(a, mapId)).toBe('current');
    expect(await push(b, mapId)).toBe('current');
    expect([...errorToasts(a), ...errorToasts(b)]).toEqual([]);
  });

  it('commits every push of a growing map with the true file size', async () => {
    const a = await startDevice('dev-a');
    const mapId = await createMap(a, 'Grows');
    for (const title of ['Grows a bit', 'Grows a bit more', 'Grows a great deal more than that']) {
      await edit(a, mapId, (session) => session.updateMeta({ title }));
      expect(await push(a, mapId)).toBe('queued');
      const md5 = a.m.file.md5Hex(await localText(a, mapId));
      expect(serverVersion(mapId)).toBe(`${mapId}.${md5}.json`);
      expect(storedVersions(mapId).map((row) => row.file_size)).toEqual([
        byteLength(await localText(a, mapId)),
      ]);
    }
    expect(transfersOf(a).filter((t) => t.status === 'failed')).toEqual([]);
  });

  it('pushes again after the commit when the map changed during its upload', async () => {
    const a = await startDevice('dev-a');
    const mapId = await createMap(a, 'Busy');
    a.m.transfers.transferManager.pauseQueue();
    const sync = await a.m.runtime.getMindmapSync();
    expect(await sync.pusher.pushNow(mapId)).toBe('queued');
    await edit(a, mapId, (session) => session.updateMeta({ title: 'Changed mid upload' }));
    expect(await sync.pusher.pushNow(mapId)).toBe('pending');
    a.m.transfers.transferManager.resumeQueue();
    await settle(a);
    await expect
      .poll(async () => serverVersion(mapId), { timeout: 5_000 })
      .toBe(`${mapId}.${a.m.file.md5Hex(await localText(a, mapId))}.json`);
  });

  it('treats a download of a pruned version as stale and fetches the newer one on the next pull', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'First');
    await push(a, mapId);
    b.m.transfers.transferManager.pauseQueue();
    await b.m.pullAndApply.replicaPullAndApply(pullDeps(b));
    await edit(a, mapId, (session) => session.updateMeta({ title: 'Second' }));
    await push(a, mapId);
    b.m.transfers.transferManager.resumeQueue();
    await settle(b);
    expect(entryOf(b, mapId)!.syncedMd5).toBeNull();
    expect(errorToasts(b)).toEqual([]);
    await pull(b);
    await expectConverged(mapId, a, b);
    expect(await localText(b, mapId)).toContain('Second');
  });

  it('merges into a map that is open on the other device without autosave undoing it', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Open');
    await push(a, mapId);
    await pull(b);
    const session = await openMap(b, mapId);
    session.updateMeta({ camera: { x: 5, y: 6, z: 1 } });
    await edit(a, mapId, (other) => other.updateMeta({ title: 'Renamed while open' }));
    await push(a, mapId);
    await pull(b);
    expect(session.meta()).toMatchObject({
      title: 'Renamed while open',
      camera: { x: 5, y: 6, z: 1 },
    });
    await session.close();
    await push(b, mapId);
    await pull(a);
    await expectConverged(mapId, a, b);
  });

  it('removes a map deleted on one device from the other, and its stored versions', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Doomed');
    await push(a, mapId);
    await pull(b);
    await a.m.deleteMap.deleteMindmap(mapId, BOOK);
    await settle(a);
    expect(storedVersions(mapId)).toEqual([]);
    await pull(b);
    await vi.waitFor(() => expect(entryOf(b, mapId)).toBeUndefined());
    expect(await b.fs.exists(b.m.maps.mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    await pull(b);
    expect(await b.fs.readDir(b.m.maps.mapTrashDir(BOOK, mapId), 'Books')).toEqual([]);
  });

  it('lets a local rename survive after merging a version whose title clock is far in the future', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Base');
    await push(a, mapId);
    await pull(b);
    const farFuture = hlcPack(Date.now() + 365 * 24 * 3600 * 1000, 0, 'dev-a');
    const current = JSON.parse(await localText(a, mapId));
    current.meta.title = { v: 'Future title', t: farFuture, s: 'dev-a' };
    const poisoned = a.m.file.canonicalStringify(current);
    await a.fs.writeFile(a.m.maps.mapFilePath(BOOK, mapId), 'Books', poisoned);
    await push(a, mapId);
    await pull(b);
    expect(metaOf(await localText(b, mapId), 'title')).toBe('Future title');
    expect(b.m.replicaSync.getReplicaSync()!.hlc.serialize().physicalMs).toBeLessThan(
      Date.now() + 24 * 3600 * 1000,
    );
    await edit(b, mapId, (s) => s.updateMeta({ title: 'Renamed by the user' }));
    await push(b, mapId);
    await syncRounds(3, a, b);
    await expectConverged(mapId, a, b);
    expect(metaOf(await localText(a, mapId), 'title')).toBe('Renamed by the user');
    await edit(a, mapId, (s) => s.updateMeta({ title: 'Renamed again' }));
    await push(a, mapId);
    await syncRounds(3, a, b);
    await expectConverged(mapId, a, b);
    expect(metaOf(await localText(b, mapId), 'title')).toBe('Renamed again');
  });
});

describe('mind map sync convergence between two devices', () => {
  const sharedNode = async (a: Device, b: Device): Promise<string> => {
    const mapId = await createMap(a, 'Shared');
    await edit(a, mapId, (session) => session.store.put([nodeRecord('n1', 'Original')]));
    await push(a, mapId);
    await pull(b);
    return mapId;
  };

  const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

  it('queues no transfer and pushes no row when a full pull runs again on converged devices', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await sharedNode(a, b);
    await syncRounds(1, a, b);
    await expectConverged(mapId, a, b);
    const queued = [a, b].map((device) => [
      vi.spyOn(device.m.transfers.transferManager, 'queueReplicaDownload'),
      vi.spyOn(device.m.transfers.transferManager, 'queueReplicaUpload'),
    ]);
    const pushes = a.knobs.pushes + b.knobs.pushes;
    await syncRounds(2, a, b);
    for (const spy of queued.flat()) expect(spy).not.toHaveBeenCalled();
    expect(a.knobs.pushes + b.knobs.pushes).toBe(pushes);
    await expectConverged(mapId, a, b);
  });

  it('merges concurrent edits to one node field by field, the later clock winning a shared field', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await sharedNode(a, b);
    await edit(a, mapId, (session) => session.store.update('n1', { label: 'From A', w: 200 }));
    await later();
    await edit(b, mapId, (session) => session.store.update('n1', { label: 'From B', x: 50 }));
    await push(b, mapId);
    await push(a, mapId);
    await syncRounds(3, a, b);
    await expectConverged(mapId, a, b);
    const text = await localText(a, mapId);
    expect(fieldOf(text, 'n1', 'label')).toBe('From B');
    expect(fieldOf(text, 'n1', 'x')).toBe(50);
    expect(fieldOf(text, 'n1', 'w')).toBe(200);
  });

  it('keeps the furthest lastSeenProgress even when the lower value was written later', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await sharedNode(a, b);
    await edit(a, mapId, (session) => session.updateMeta({ lastSeenProgress: 0.7 }));
    await later();
    await edit(b, mapId, (session) => session.updateMeta({ lastSeenProgress: 0.3 }));
    await push(b, mapId);
    await push(a, mapId);
    await syncRounds(3, a, b);
    await expectConverged(mapId, a, b);
    expect(metaOf(await localText(b, mapId), 'lastSeenProgress')).toBe(0.7);
  });
});
