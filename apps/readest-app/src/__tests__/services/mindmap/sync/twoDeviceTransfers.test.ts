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
  incomingReadGate: Promise<void> | null;
}

const deviceService = (fs: MemoryFileSystem, knobs: Knobs): AppService => {
  const dirs = new Set<string>();
  const createDir = async (path: string, base: BaseDir): Promise<void> => {
    for (let dir = path; dir; dir = parentOf(dir)) dirs.add(`${base}:${dir}`);
  };
  return {
    exists: fs.exists.bind(fs),
    readFile: async (path: string, base: BaseDir) => {
      const content = await fs.readFile(path, base);
      if (path.includes('/incoming/') && knobs.incomingReadGate) await knobs.incomingReadGate;
      return content;
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
  index: await import('@/services/mindmap/persist/mindmapIndex'),
  deleteMap: await import('@/services/mindmap/sync/deleteMap'),
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
    incomingReadGate: null,
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

const serverText = (mapId: string): string | undefined => {
  const filename = serverVersion(mapId);
  return filename
    ? holder.cloud.objects.get(`${USER}/${cloudPath('mindmap', mapId, filename)}`)
    : undefined;
};

const nodeFromB = {
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
} as const;

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

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
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
    await edit(b, mapId, (session) => session.store.put([{ ...nodeFromB }] as never));
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
    holder.cloud.objects.delete(`${USER}/${cloudPath('mindmap', mapId, serverVersion(mapId)!)}`);
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
