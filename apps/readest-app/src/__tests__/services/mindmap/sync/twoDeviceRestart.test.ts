import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import {
  BOOK,
  USER,
  clockOf,
  createMap,
  createMindmapSim,
  deferred,
  drain,
  entryOf,
  outgoingFiles,
  pull,
  pullDeps,
  push,
  setMindmapSync,
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

const { startDevice, quit, stopAll, storedVersions, expectConverged } = createMindmapSim(holder);

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

describe('mind map sync when the manifest of an uploaded version does not reach the server', () => {
  it('delivers a new map when the app quit while the manifest of its upload was being sent', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Written just before quitting');
    const gate = deferred();
    a.knobs.pushGate = gate.promise;
    const pushesBefore = a.knobs.pushes;
    expect(await (await a.m.runtime.getMindmapSync()).pusher.pushNow(mapId)).toBe('queued');
    await vi.waitFor(
      () => expect(transfersOf(a).some((t) => t.status === 'completed')).toBe(true),
      { timeout: 5_000, interval: 10 },
    );
    await vi.waitFor(() =>
      expect(a.knobs.pushes > pushesBefore || entryOf(a, mapId)!.syncedMd5 !== null).toBe(true),
    );
    expect(entryOf(a, mapId)!.syncedMd5).toBeNull();
    await a.m.store.useMindmapStore.getState().whenPersisted();
    quit(a);

    const restarted = await startDevice('dev-a', a.fs);
    expect(entryOf(restarted, mapId)!.syncedMd5).toBeNull();
    await pull(restarted);
    await pull(restarted);
    const b = await startDevice('dev-b');
    await pull(b);
    expect(entryOf(b, mapId)).toBeDefined();
    await expectConverged(mapId, restarted, b);
  });

  it('pushes a map again once the network is back when the manifest flush failed', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    await pull(a);
    const mapId = await createMap(a, 'Sent while offline');
    a.knobs.dead = true;
    const sync = await a.m.runtime.getMindmapSync();
    expect(await sync.pusher.pushNow(mapId)).toBe('queued');
    await drain(a);
    expect(entryOf(a, mapId)!.syncedMd5).toBeNull();
    expect(holder.cloud!.row(USER, 'mindmap', mapId)).toBeUndefined();
    expect(await outgoingFiles(a, mapId)).toHaveLength(1);
    expect(sync.pusher.unpushed()).toEqual([mapId]);

    a.knobs.dead = false;
    await pull(a);
    await pull(b);
    expect(entryOf(b, mapId)).toBeDefined();
    await expectConverged(mapId, a, b);
  });

  it('pushes a version whose upload finished while mind map sync was switched off', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Toggled');
    const sync = await a.m.runtime.getMindmapSync();
    a.m.transfers.transferManager.pauseQueue();
    expect(await sync.pusher.pushNow(mapId)).toBe('queued');
    setMindmapSync(a, false);
    a.m.transfers.transferManager.resumeQueue();
    await drain(a);
    await a.m.replicaSync.getReplicaSync()!.manager.flush();
    expect(entryOf(a, mapId)!.syncedMd5).toBeNull();
    expect(await outgoingFiles(a, mapId)).toHaveLength(1);
    expect(holder.cloud!.row(USER, 'mindmap', mapId)?.manifest_jsonb ?? null).toBeNull();
    setMindmapSync(a, true);
    await a.m.store.useMindmapStore.getState().whenPersisted();
    quit(a);

    const restarted = await startDevice('dev-a', a.fs);
    await pull(restarted);
    await pull(restarted);
    const b = await startDevice('dev-b');
    await pull(b);
    await expectConverged(mapId, restarted, b);
  });

  it('pushes a version whose upload finished while sync was off once sync is back on in the same session', async () => {
    const a = await startDevice('dev-a');
    await pull(a);
    const mapId = await createMap(a, 'Toggled');
    const sync = await a.m.runtime.getMindmapSync();
    a.m.transfers.transferManager.pauseQueue();
    expect(await sync.pusher.pushNow(mapId)).toBe('queued');
    setMindmapSync(a, false);
    a.m.transfers.transferManager.resumeQueue();
    await drain(a);
    await a.m.replicaSync.getReplicaSync()!.manager.flush();
    expect(holder.cloud!.row(USER, 'mindmap', mapId)?.manifest_jsonb ?? null).toBeNull();
    expect(sync.pusher.unpushed()).toEqual([mapId]);

    setMindmapSync(a, true);
    await pull(a);
    const b = await startDevice('dev-b');
    await pull(b);
    await expectConverged(mapId, a, b);
  });
});

describe('mind map sync when the tombstone of a delete does not reach the server', () => {
  it('keeps a map deleted while mind map sync was off deleted once sync is back on', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Private');
    await push(a, mapId);
    await pull(b);
    expect(entryOf(b, mapId)).toBeDefined();
    setMindmapSync(a, false);
    await a.m.deleteMap.deleteMindmap(mapId, BOOK);
    await settle(a);
    setMindmapSync(a, true);
    await pull(a);
    expect(entryOf(a, mapId)).toBeUndefined();
    expect(await a.fs.exists(a.m.maps.mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    await pull(b);
    expect(entryOf(b, mapId)).toBeUndefined();
    expect(storedVersions(mapId)).toEqual([]);
  });

  it('keeps a map deleted just before the app quit deleted after the restart', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    await pull(a);
    const mapId = await createMap(a, 'Doomed');
    await push(a, mapId);
    await pull(b);
    await a.m.deleteMap.deleteMindmap(mapId, BOOK);
    expect(entryOf(a, mapId)).toBeUndefined();
    await a.m.store.useMindmapStore.getState().whenPersisted();
    quit(a);

    const restarted = await startDevice('dev-a', a.fs);
    await pull(restarted);
    expect(entryOf(restarted, mapId)).toBeUndefined();
    expect(await restarted.fs.exists(restarted.m.maps.mapFilePath(BOOK, mapId), 'Books')).toBe(
      false,
    );
    await pull(b);
    expect(entryOf(b, mapId)).toBeUndefined();
  });

  it('keeps the delete pending while the network is down and sends it once it is back', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Offline delete');
    await push(a, mapId);
    await pull(b);
    a.knobs.dead = true;
    await a.m.deleteMap.deleteMindmap(mapId, BOOK);
    await expect(pull(a)).rejects.toThrow();
    a.knobs.dead = false;
    await pull(a);
    await pull(a);
    expect(entryOf(a, mapId)).toBeUndefined();
    await pull(b);
    expect(entryOf(b, mapId)).toBeUndefined();
  });

  it('does not bring the map back from the server while its delete cannot be sent', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Rejected delete');
    await push(a, mapId);
    await pull(b);
    a.knobs.pushFails = true;
    await a.m.deleteMap.deleteMindmap(mapId, BOOK);
    await a.m.pullAndApply.replicaPullAndApply(pullDeps(a));
    await a.m.runtime.finishMindmapPull();
    expect(entryOf(a, mapId)).toBeUndefined();
    expect(await a.fs.exists(a.m.maps.mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    a.knobs.pushFails = false;
    await pull(a);
    await pull(b);
    expect(entryOf(a, mapId)).toBeUndefined();
    expect(entryOf(b, mapId)).toBeUndefined();
  });
});

describe('mind map sync when a map that cannot be read is deleted from one device', () => {
  it('keeps the healthy copy elsewhere and restores a readable copy after a restart', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    const mapId = await createMap(a, 'Healthy on A');
    await push(a, mapId);
    await pull(b);
    const mainPath = b.m.maps.mapFilePath(BOOK, mapId);
    await b.fs.writeFile(mainPath, 'Books', '{not json');
    await b.fs.writeFile(`${mainPath}.bak`, 'Books', '{not json either');
    const sync = await b.m.runtime.getMindmapSync();
    const broken = await b.m.sessions.openMapSession(sync.fs, BOOK, mapId, clockOf(b));
    expect(broken.status).toBe('unreadable');

    await b.m.deleteMap.deleteMindmapLocally(mapId, BOOK);
    await settle(b);
    expect(entryOf(b, mapId)).toBeUndefined();
    await pull(a);
    await pull(a);
    expect(entryOf(a, mapId)).toBeDefined();
    expect(storedVersions(mapId)).not.toEqual([]);
    await b.m.store.useMindmapStore.getState().whenPersisted();
    quit(b);

    const restarted = await startDevice('dev-b', b.fs);
    await pull(restarted);
    await pull(restarted);
    const reopened = await restarted.m.sessions.openMapSession(
      (await restarted.m.runtime.getMindmapSync()).fs,
      BOOK,
      mapId,
      clockOf(restarted),
    );
    expect(reopened.status).toBe('open');
    if (reopened.status === 'open') await reopened.session.close();
    await expectConverged(mapId, a, restarted);
  });
});
