import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { InMemoryHlcStore } from '@/libs/hlcStore';
import type { MindmapReplicaRecord } from '@/services/sync/adapters/mindmap';
import type { PullAndApplyDeps } from '@/services/sync/replicaPullAndApply';
import type { Hlc, ReplicaRow } from '@/types/replica';
import type { SystemSettings } from '@/types/settings';
import type { AppService, BaseDir } from '@/types/system';

const USER = 'u1';
const BOOK = 'book1';

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

import { GET, POST } from '@/pages/api/sync/replicas';

const byteLength = (text: string): number => new TextEncoder().encode(text).length;
const cloudPath = (kind: string, replicaId: string, filename: string): string =>
  `Readest/Replicas/${kind}/${replicaId}/${filename}`;

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

const deviceService = (fs: MemoryFileSystem): AppService => {
  const dirs = new Set<string>();
  const createDir = async (path: string, base: BaseDir): Promise<void> => {
    for (let dir = path; dir; dir = parentOf(dir)) dirs.add(`${base}:${dir}`);
  };
  return {
    exists: fs.exists.bind(fs),
    readFile: fs.readFile.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    copyFile: fs.copyFile.bind(fs),
    createDir,
    readDirectory: fs.readDir.bind(fs),
    deleteDir: fs.removeDir.bind(fs),
    deleteFile: fs.removeFile.bind(fs),
    openFile: async (path: string, base: BaseDir) =>
      new File([await fs.readFile(path, base)], path.split('/').pop()!),
    uploadReplicaFile: async (
      kind: string,
      replicaId: string,
      filename: string,
      lfp: string,
      base: BaseDir,
    ) => {
      const body = await fs.readFile(lfp, base);
      const cloud = holder.cloud!;
      const signed = cloud.signUpload(
        USER,
        cloudPath(kind, replicaId, filename),
        byteLength(body),
        kind,
        replicaId,
      );
      cloud.put(signed.fileKey, signed.signedSize, body);
    },
    downloadReplicaFile: async (
      kind: string,
      replicaId: string,
      filename: string,
      lfp: string,
      base: BaseDir,
    ) => {
      const body = holder.cloud!.download(USER, cloudPath(kind, replicaId, filename));
      if (!dirs.has(`${base}:${parentOf(lfp)}`)) throw new Error(`ENOENT: ${parentOf(lfp)}`);
      await fs.writeFile(lfp, base, body);
    },
  } as unknown as AppService;
};

const routeClient = {
  push: async (rows: ReplicaRow[]): Promise<ReplicaRow[]> => {
    const response = await POST(
      new NextRequest('http://localhost/api/sync/replicas', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      }),
    );
    if (response.status !== 200) throw new Error(`push failed: ${await response.text()}`);
    return ((await response.json()) as { rows: ReplicaRow[] }).rows;
  },
  pull: async (kind: string, since: Hlc | null): Promise<ReplicaRow[]> => {
    const query = since ? `kind=${kind}&since=${since}` : `kind=${kind}`;
    const response = await GET(
      new NextRequest(`http://localhost/api/sync/replicas?${query}`, {
        headers: { authorization: 'Bearer token' },
      }),
    );
    return ((await response.json()) as { rows: ReplicaRow[] }).rows;
  },
  pullBatch: async (cursors: { kind: string; since: Hlc | null }[]) =>
    Promise.all(
      cursors.map(async ({ kind, since }) => ({ kind, rows: await routeClient.pull(kind, since) })),
    ),
};

const loadModules = async () => ({
  replicaSync: await import('@/services/sync/replicaSync'),
  bootstrap: await import('@/services/sync/replicaBootstrap'),
  integration: await import('@/services/sync/replicaTransferIntegration'),
  transfers: await import('@/services/transferManager'),
  transferStore: await import('@/store/transferStore'),
  settings: await import('@/store/settingsStore'),
  store: await import('@/services/mindmap/persist/mindmapStore'),
  sessions: await import('@/services/mindmap/persist/session'),
  maps: await import('@/services/mindmap/persist/mapFile'),
  clockSource: await import('@/services/mindmap/persist/clockSource'),
  runtime: await import('@/services/mindmap/sync/runtime'),
  deleteMap: await import('@/services/mindmap/sync/deleteMap'),
  pullAndApply: await import('@/services/sync/replicaPullAndApply'),
  adapter: await import('@/services/sync/adapters/mindmap'),
  events: await import('@/utils/event'),
  file: await import('@/services/mindmap/file/canonicalStringify'),
  schema: await import('@/services/mindmap/schema/types'),
});

type Modules = Awaited<ReturnType<typeof loadModules>>;

interface Device {
  name: string;
  fs: MemoryFileSystem;
  service: AppService;
  m: Modules;
  toasts: { type: string; message: string }[];
  handled: number;
}

const devices: Device[] = [];

const startDevice = async (name: string): Promise<Device> => {
  vi.resetModules();
  const fs = new MemoryFileSystem();
  const service = deviceService(fs);
  holder.service = service;
  const m = await loadModules();
  const device: Device = { name, fs, service, m, toasts: [], handled: 0 };
  m.settings.useSettingsStore.setState({
    settings: { replicaDeviceId: name, syncCategories: {} } as SystemSettings,
  });
  m.replicaSync.initReplicaSync({
    deviceId: name,
    cursorStore: { get: () => null, set: () => {} },
    hlcStore: new InMemoryHlcStore(),
    client: routeClient,
  });
  m.bootstrap.bootstrapReplicaAdapters();
  m.integration.startReplicaTransferIntegration(service);
  m.events.eventDispatcher.on('replica-transfer-complete', () => {
    device.handled += 1;
  });
  m.events.eventDispatcher.on('toast', (event: CustomEvent) => {
    device.toasts.push(event.detail as { type: string; message: string });
  });
  await m.transfers.transferManager.initialize(
    service,
    () => [],
    async () => {},
    (key: string) => key,
  );
  await m.runtime.getMindmapSync();
  await m.store.useMindmapStore.getState().hydrate((await m.runtime.getMindmapSync()).fs);
  devices.push(device);
  return device;
};

const transfersOf = (device: Device) =>
  Object.values(device.m.transferStore.useTransferStore.getState().transfers);

const drain = async (device: Device): Promise<void> => {
  await vi.waitFor(
    () => {
      const transfers = transfersOf(device);
      const busy = transfers.some((t) => t.status === 'pending' || t.status === 'in_progress');
      const completed = transfers.filter((t) => t.status === 'completed').length;
      if (busy || device.handled < completed) throw new Error(`${device.name} is busy`);
    },
    { timeout: 5_000, interval: 10 },
  );
  await (await device.m.runtime.getMindmapSync()).pusher.idle();
};

const settle = async (device: Device): Promise<void> => {
  for (let round = 0; round < 4; round++) {
    await drain(device);
    await (await device.m.runtime.getMindmapSync()).pusher.flushAll();
    await device.m.replicaSync.getReplicaSync()!.manager.flush();
  }
};

const pullDeps = (device: Device): PullAndApplyDeps<MindmapReplicaRecord> => {
  const { m, service } = device;
  const store = m.store.useMindmapStore;
  const manager = m.replicaSync.getReplicaSync()!.manager;
  return {
    adapter: m.adapter.mindmapAdapter,
    pull: () => manager.pull('mindmap', { since: null }),
    findByContentId: m.store.findMindmapByContentId,
    hydrateLocalStore: m.runtime.beginMindmapPull,
    applyRemote: (record) => store.getState().applyRemoteMap(record),
    softDeleteByContentId: (id) => store.getState().softDeleteByContentId(id),
    createBundleDir: async (dir) => {
      await service.createDir(dir!, 'Books', true);
      return dir!;
    },
    ensureDir: (dir) => service.createDir(dir, 'Books', true),
    queueReplicaDownload: (id, title, files, _dir, base) =>
      m.transfers.transferManager.queueReplicaDownload('mindmap', id, title, files, base, {
        isBackground: true,
      }),
    filesExist: async () => false,
  };
};

const pull = async (device: Device): Promise<void> => {
  await device.m.pullAndApply.replicaPullAndApply(pullDeps(device));
  await device.m.runtime.finishMindmapPull();
  await settle(device);
};

const clockOf = (device: Device) => device.m.clockSource.getMindmapClock(device.name);

const createMap = async (device: Device, title: string): Promise<string> => {
  const file = await device.m.store.useMindmapStore
    .getState()
    .createMap(BOOK, { ...device.m.schema.DEFAULT_MAP_META, title }, clockOf(device));
  return file.mapId;
};

const openMap = async (device: Device, mapId: string) => {
  const sync = await device.m.runtime.getMindmapSync();
  const opened = await device.m.sessions.openMapSession(sync.fs, BOOK, mapId, clockOf(device));
  if (opened.status !== 'open') throw new Error('expected an open session');
  return opened.session;
};

const edit = async (
  device: Device,
  mapId: string,
  change: (session: Awaited<ReturnType<typeof openMap>>) => void,
): Promise<void> => {
  const session = await openMap(device, mapId);
  change(session);
  await session.close();
};

const push = async (device: Device, mapId: string): Promise<string> => {
  const result = await (await device.m.runtime.getMindmapSync()).pusher.pushNow(mapId);
  await settle(device);
  return result;
};

const localText = async (device: Device, mapId: string): Promise<string> =>
  device.fs.readFile(device.m.maps.mapFilePath(BOOK, mapId), 'Books');

const entryOf = (device: Device, mapId: string) =>
  device.m.store.useMindmapStore.getState().getEntry(mapId);

const serverVersion = (mapId: string): string | undefined =>
  holder.cloud!.row(USER, 'mindmap', mapId)?.manifest_jsonb?.files[0]?.filename;

const storedVersions = (mapId: string) => holder.cloud!.fileRows('mindmap', mapId);

const expectConverged = async (mapId: string, ...group: Device[]): Promise<void> => {
  const texts = await Promise.all(group.map((device) => localText(device, mapId)));
  expect(new Set(texts).size).toBe(1);
  const md5 = group[0]!.m.file.md5Hex(texts[0]!);
  for (const device of group) expect(entryOf(device, mapId)!.syncedMd5).toBe(md5);
  expect(serverVersion(mapId)).toBe(`${mapId}.${md5}.json`);
  expect(storedVersions(mapId).map((row) => row.file_key)).toEqual([
    `${USER}/${cloudPath('mindmap', mapId, `${mapId}.${md5}.json`)}`,
  ]);
  expect(storedVersions(mapId)[0]!.file_size).toBe(byteLength(texts[0]!));
};

const errorToasts = (device: Device) => device.toasts.filter((toast) => toast.type === 'error');

beforeEach(() => {
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  for (const device of devices.splice(0)) {
    device.m.replicaSync.__resetReplicaSyncForTests();
    device.m.integration.__resetReplicaTransferIntegrationForTests();
    device.m.runtime.__resetMindmapSyncForTests();
    device.m.transfers.transferManager.pauseQueue();
  }
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('mind map sync between two devices', () => {
  it('delivers a new map to the other device byte for byte', async () => {
    const a = await startDevice('dev-a');
    const b = await startDevice('dev-b');
    expect(b.m.store.useMindmapStore).not.toBe(a.m.store.useMindmapStore);
    const mapId = await createMap(a, 'Characters');
    expect(await push(a, mapId)).toBe('queued');
    await pull(b);
    await expectConverged(mapId, a, b);
    expect(entryOf(b, mapId)).toMatchObject({ bookHash: BOOK, name: 'Characters' });
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
    await edit(b, mapId, (session) =>
      session.store.put([
        {
          id: 'n-b',
          type: 'node',
          version: 1,
          parentId: null,
          index: 'a0',
          origin: 'user',
          genKey: null,
          touched: [],
          anchor: null,
          revealAt: null,
          deleted: null,
          x: 0,
          y: 0,
          w: 160,
          h: 64,
          label: 'Added on B',
          kind: 'idea',
          color: 'terracotta',
          icon: '',
        },
      ]),
    );
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
});
