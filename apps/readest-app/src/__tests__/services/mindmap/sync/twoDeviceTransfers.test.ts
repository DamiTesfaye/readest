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
  cloud: null as unknown as import('@/__tests__/helpers/fakeReplicaCloud').FakeReplicaCloud,
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
  uploadFailures: number;
  uploadAttempts: number[];
  downloadFailures: number;
}

const deviceService = (fs: MemoryFileSystem, knobs: Knobs): AppService => {
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
      knobs.uploadAttempts.push(Date.now());
      if (knobs.uploadFailures > 0) {
        knobs.uploadFailures -= 1;
        throw new Error('Network error');
      }
      const body = await fs.readFile(lfp, base);
      const signed = holder.cloud.signUpload(
        USER,
        cloudPath(kind, replicaId, filename),
        byteLength(body),
        kind,
        replicaId,
      );
      holder.cloud.put(signed.fileKey, signed.signedSize, body);
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
      const body = holder.cloud.download(USER, cloudPath(kind, replicaId, filename));
      if (!dirs.has(`${base}:${parentOf(lfp)}`)) throw new Error(`ENOENT: ${parentOf(lfp)}`);
      await fs.writeFile(lfp, base, body);
    },
  } as unknown as AppService;
};

const routeClientFor = (knobs: Knobs) => {
  const client = {
    push: async (rows: ReplicaRow[]): Promise<ReplicaRow[]> => {
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

const startDevice = async (name: string): Promise<Device> => {
  vi.resetModules();
  localStorage.clear();
  const fs = new MemoryFileSystem();
  const knobs: Knobs = {
    dead: false,
    uploadFailures: 0,
    uploadAttempts: [],
    downloadFailures: 0,
  };
  const service = deviceService(fs, knobs);
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

const localText = async (device: Device, mapId: string): Promise<string> =>
  device.fs.readFile(device.m.maps.mapFilePath(BOOK, mapId), 'Books');

const entryOf = (device: Device, mapId: string) =>
  device.m.store.useMindmapStore.getState().getEntry(mapId);

const serverVersion = (mapId: string): string | undefined =>
  holder.cloud.row(USER, 'mindmap', mapId)?.manifest_jsonb?.files[0]?.filename;

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

const localVersion = async (device: Device, mapId: string): Promise<string> =>
  `${mapId}.${device.m.file.md5Hex(await localText(device, mapId))}.json`;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
});
