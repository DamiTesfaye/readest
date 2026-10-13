import { expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { InMemoryHlcStore } from '@/libs/hlcStore';
import { GET, POST } from '@/pages/api/sync/replicas';
import type { MapFile, MapRecord } from '@/services/mindmap/schema/types';
import type { MindmapReplicaRecord } from '@/services/sync/adapters/mindmap';
import type { PullAndApplyDeps } from '@/services/sync/replicaPullAndApply';
import type { Hlc, ReplicaRow } from '@/types/replica';
import type { SystemSettings } from '@/types/settings';
import type { AppService, BaseDir } from '@/types/system';

export const USER = 'u1';
export const BOOK = 'book1';

export interface SimHolder {
  cloud: FakeReplicaCloud | null;
  service: AppService | null;
}

export interface Knobs {
  dead: boolean;
  pushFails: boolean;
  pushGate: Promise<void> | null;
  pushes: number;
  uploadFailures: number;
  uploadAttempts: number[];
  downloadFailures: number;
  incomingReadGate: Promise<void> | null;
}

export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export const cloudPath = (kind: string, replicaId: string, filename: string): string =>
  `Readest/Replicas/${kind}/${replicaId}/${filename}`;

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

const utf8Bytes = (text: string): ArrayBuffer =>
  new TextEncoder().encode(text).buffer as ArrayBuffer;

export const deferred = () => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
};

export const nodeRecord = (id: string, label: string): MapRecord => ({
  id,
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
  label,
  kind: 'idea',
  color: 'terracotta',
  icon: '',
});

const parsed = (text: string) =>
  JSON.parse(text) as {
    meta: Record<string, { v: unknown }>;
    records: Record<string, Record<string, { v: unknown }>>;
  };

export const metaOf = (text: string, key: string): unknown => parsed(text).meta[key]?.v;

export const fieldOf = (text: string, id: string, field: string): unknown =>
  parsed(text).records[id]?.[field]?.v;

const newKnobs = (): Knobs => ({
  dead: false,
  pushFails: false,
  pushGate: null,
  pushes: 0,
  uploadFailures: 0,
  uploadAttempts: [],
  downloadFailures: 0,
  incomingReadGate: null,
});

const routeClientFor = (knobs: Knobs) => {
  const client = {
    push: async (rows: ReplicaRow[]): Promise<ReplicaRow[]> => {
      knobs.pushes += 1;
      if (knobs.pushGate) await knobs.pushGate;
      if (knobs.dead || knobs.pushFails) throw new Error('Network error');
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
  index: await import('@/services/mindmap/persist/mindmapIndex'),
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

export interface Device {
  name: string;
  fs: MemoryFileSystem;
  service: AppService;
  knobs: Knobs;
  m: Awaited<ReturnType<typeof loadModules>>;
  toasts: { type: string; message: string }[];
  handled: number;
}

export const transfersOf = (device: Device) =>
  Object.values(device.m.transferStore.useTransferStore.getState().transfers);

export const errorToasts = (device: Device) =>
  device.toasts.filter((toast) => toast.type === 'error');

export const drain = async (device: Device): Promise<void> => {
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

export const settle = async (device: Device): Promise<void> => {
  for (let round = 0; round < 4; round++) {
    await drain(device);
    await (await device.m.runtime.getMindmapSync()).pusher.flushAll();
    await device.m.replicaSync.getReplicaSync()!.manager.flush();
  }
};

export const pullDeps = (device: Device): PullAndApplyDeps<MindmapReplicaRecord> => {
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

export const pull = async (device: Device): Promise<void> => {
  await device.m.pullAndApply.replicaPullAndApply(pullDeps(device));
  await device.m.runtime.finishMindmapPull();
  await settle(device);
};

export const syncRounds = async (rounds: number, ...group: Device[]): Promise<void> => {
  for (let round = 0; round < rounds; round++) {
    for (const device of group) await pull(device);
  }
};

export const clockOf = (device: Device) => device.m.clockSource.getMindmapClock(device.name);

export const createMap = async (device: Device, title: string): Promise<string> => {
  const file = await device.m.store.useMindmapStore
    .getState()
    .createMap(BOOK, { ...device.m.schema.DEFAULT_MAP_META, title }, clockOf(device));
  return file.mapId;
};

export const openMap = async (device: Device, mapId: string) => {
  const sync = await device.m.runtime.getMindmapSync();
  const opened = await device.m.sessions.openMapSession(sync.fs, BOOK, mapId, clockOf(device));
  if (opened.status !== 'open') throw new Error('expected an open session');
  return opened.session;
};

export const edit = async (
  device: Device,
  mapId: string,
  change: (session: Awaited<ReturnType<typeof openMap>>) => void,
): Promise<void> => {
  const session = await openMap(device, mapId);
  change(session);
  await session.close();
};

export const push = async (device: Device, mapId: string): Promise<string> => {
  const result = await (await device.m.runtime.getMindmapSync()).pusher.pushNow(mapId);
  await settle(device);
  return result;
};

export const localText = async (device: Device, mapId: string): Promise<string> =>
  device.fs.readFile(device.m.maps.mapFilePath(BOOK, mapId), 'Books');

export const localVersion = async (device: Device, mapId: string): Promise<string> =>
  `${mapId}.${device.m.file.md5Hex(await localText(device, mapId))}.json`;

export const entryOf = (device: Device, mapId: string) =>
  device.m.store.useMindmapStore.getState().getEntry(mapId);

const dirFiles = async (device: Device, dir: string): Promise<string[]> =>
  (await device.fs.readDir(dir, 'Books').catch(() => [])).map((item) => item.path);

export const outgoingFiles = (device: Device, mapId: string): Promise<string[]> =>
  dirFiles(device, device.m.versions.outgoingDir(device.m.maps.mapFileDir(BOOK, mapId)));

export const incomingFiles = (device: Device, mapId: string): Promise<string[]> =>
  dirFiles(device, device.m.versions.incomingDir(device.m.maps.mapFileDir(BOOK, mapId)));

export const setMindmapSync = (device: Device, on: boolean): void =>
  device.m.settings.useSettingsStore.setState({
    settings: { replicaDeviceId: device.name, syncCategories: { mindmap: on } } as SystemSettings,
  });

export const createMindmapSim = (holder: SimHolder) => {
  const devices: Device[] = [];
  const cloud = (): FakeReplicaCloud => holder.cloud!;

  const deviceService = (fs: MemoryFileSystem, knobs: Knobs): AppService => {
    const dirs = new Set<string>();
    const createDir = async (path: string, base: BaseDir): Promise<void> => {
      for (let dir = path; dir; dir = parentOf(dir)) dirs.add(`${base}:${dir}`);
    };
    return {
      exists: fs.exists.bind(fs),
      readFile: async (path: string, base: BaseDir, mode: 'text' | 'binary') => {
        const content = await fs.readFile(path, base);
        if (path.includes('/incoming/') && knobs.incomingReadGate) await knobs.incomingReadGate;
        return mode === 'binary' ? utf8Bytes(content) : content;
      },
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
        knobs.uploadAttempts.push(Date.now());
        if (knobs.uploadFailures > 0) {
          knobs.uploadFailures -= 1;
          throw new Error('Network error');
        }
        const body = await fs.readFile(lfp, base);
        const path = cloudPath(kind, replicaId, filename);
        const signed = cloud().signUpload(USER, path, byteLength(body), kind, replicaId);
        cloud().put(signed.fileKey, signed.signedSize, body);
      },
      downloadReplicaFile: async (
        kind: string,
        replicaId: string,
        filename: string,
        lfp: string,
        base: BaseDir,
      ) => {
        if (knobs.downloadFailures > 0) {
          knobs.downloadFailures -= 1;
          throw new Error('Network error');
        }
        const body = cloud().download(USER, cloudPath(kind, replicaId, filename));
        if (!dirs.has(`${base}:${parentOf(lfp)}`)) throw new Error(`ENOENT: ${parentOf(lfp)}`);
        await fs.writeFile(lfp, base, body);
      },
    } as unknown as AppService;
  };

  const wireDevice = async (device: Device): Promise<void> => {
    const { m, name, service, knobs } = device;
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
    await m.store.useMindmapStore.getState().hydrate((await m.runtime.getMindmapSync()).fs);
  };

  const startDevice = async (name: string, disk?: MemoryFileSystem): Promise<Device> => {
    vi.resetModules();
    localStorage.clear();
    const fs = disk ?? new MemoryFileSystem();
    const knobs = newKnobs();
    const service = deviceService(fs, knobs);
    holder.service = service;
    const m = await loadModules();
    const device: Device = { name, fs, service, knobs, m, toasts: [], handled: 0 };
    await wireDevice(device);
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

  const stopAll = (): void => {
    for (const device of devices.splice(0)) quit(device);
  };

  const serverVersion = (mapId: string): string | undefined =>
    cloud().row(USER, 'mindmap', mapId)?.manifest_jsonb?.files[0]?.filename;

  const serverText = (mapId: string): string | undefined => {
    const filename = serverVersion(mapId);
    return filename
      ? cloud().objects.get(`${USER}/${cloudPath('mindmap', mapId, filename)}`)
      : undefined;
  };

  const storedVersions = (mapId: string) => cloud().fileRows('mindmap', mapId);

  const expectConverged = async (mapId: string, ...group: Device[]): Promise<string> => {
    const texts = await Promise.all(group.map((device) => localText(device, mapId)));
    expect(new Set(texts).size).toBe(1);
    const text = texts[0]!;
    const { file } = group[0]!.m;
    expect(file.canonicalStringify(JSON.parse(text) as MapFile)).toBe(text);
    const md5 = file.md5Hex(text);
    for (const device of group) {
      expect(entryOf(device, mapId)!.syncedMd5).toBe(md5);
      expect(await outgoingFiles(device, mapId)).toEqual([]);
      expect(await incomingFiles(device, mapId)).toEqual([]);
    }
    const fileKey = `${USER}/${cloudPath('mindmap', mapId, `${mapId}.${md5}.json`)}`;
    expect(serverVersion(mapId)).toBe(`${mapId}.${md5}.json`);
    expect(storedVersions(mapId).map((row) => row.file_key)).toEqual([fileKey]);
    expect(storedVersions(mapId)[0]!.file_size).toBe(byteLength(text));
    expect(cloud().objects.get(fileKey)).toBe(text);
    return md5;
  };

  return {
    cloud,
    startDevice,
    quit,
    stopAll,
    serverVersion,
    serverText,
    storedVersions,
    expectConverged,
  };
};
