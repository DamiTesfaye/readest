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

interface Knobs {
  dead: boolean;
  pushGate: Promise<void> | null;
  pushes: number;
}

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

const routeClientFor = (knobs: Knobs) => {
  const client = {
    push: async (rows: ReplicaRow[]): Promise<ReplicaRow[]> => {
      knobs.pushes += 1;
      if (knobs.pushGate) await knobs.pushGate;
      if (knobs.dead) throw new Error('Network error');
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
      if (knobs.dead) throw new Error('Network error');
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
        cursors.map(async ({ kind, since }) => ({ kind, rows: await client.pull(kind, since) })),
      ),
  };
  return client;
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
  versions: await import('@/services/mindmap/sync/versions'),
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
  knobs: Knobs;
  m: Modules;
  toasts: { type: string; message: string }[];
  handled: number;
}

const devices: Device[] = [];

const startDevice = async (name: string, disk?: MemoryFileSystem): Promise<Device> => {
  vi.resetModules();
  localStorage.clear();
  const fs = disk ?? new MemoryFileSystem();
  const knobs: Knobs = { dead: false, pushGate: null, pushes: 0 };
  const service = deviceService(fs);
  holder.service = service;
  const m = await loadModules();
  const device: Device = { name, fs, service, knobs, m, toasts: [], handled: 0 };
  m.settings.useSettingsStore.setState({
    settings: { replicaDeviceId: name, syncCategories: {} } as SystemSettings,
  });
  m.replicaSync.initReplicaSync({
    deviceId: name,
    cursorStore: { get: () => null, set: () => {} },
    hlcStore: new InMemoryHlcStore(),
    client: routeClientFor(knobs),
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

const quit = (device: Device): void => {
  device.knobs.dead = true;
  device.m.transfers.transferManager.pauseQueue();
  device.m.replicaSync.__resetReplicaSyncForTests();
  device.m.integration.__resetReplicaTransferIntegrationForTests();
  device.m.runtime.__resetMindmapSyncForTests();
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

const localText = async (device: Device, mapId: string): Promise<string> =>
  device.fs.readFile(device.m.maps.mapFilePath(BOOK, mapId), 'Books');

const entryOf = (device: Device, mapId: string) =>
  device.m.store.useMindmapStore.getState().getEntry(mapId);

const serverVersion = (mapId: string): string | undefined =>
  holder.cloud!.row(USER, 'mindmap', mapId)?.manifest_jsonb?.files[0]?.filename;

const storedVersions = (mapId: string) => holder.cloud!.fileRows('mindmap', mapId);

const outgoingFiles = async (device: Device, mapId: string): Promise<string[]> => {
  const dir = device.m.versions.outgoingDir(device.m.maps.mapFileDir(BOOK, mapId));
  const items = await device.fs.readDir(dir, 'Books').catch(() => []);
  return items.map((item) => item.path);
};

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
  for (const device of group) expect(await outgoingFiles(device, mapId)).toEqual([]);
};

const deferred = () => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
};

const setMindmapSync = (device: Device, on: boolean): void =>
  device.m.settings.useSettingsStore.setState({
    settings: { replicaDeviceId: device.name, syncCategories: { mindmap: on } } as SystemSettings,
  });

beforeEach(() => {
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  for (const device of devices.splice(0)) {
    device.knobs.dead = true;
    device.m.replicaSync.__resetReplicaSyncForTests();
    device.m.integration.__resetReplicaTransferIntegrationForTests();
    device.m.runtime.__resetMindmapSyncForTests();
    device.m.transfers.transferManager.pauseQueue();
  }
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
});
