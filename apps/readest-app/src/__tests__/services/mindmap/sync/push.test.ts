import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { canonicalStringify, md5Hex } from '@/services/mindmap/file/canonicalStringify';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { readMapFile } from '@/services/mindmap/persist/mapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { __resetMapSessionsForTests, openMapSession } from '@/services/mindmap/persist/session';
import { stampMeta } from '@/services/mindmap/file/stampDiff';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import {
  type MindmapPushDeps,
  type MindmapPusher,
  PUSH_DEBOUNCE_MS,
  REPUSH_DELAY_MS,
  createMindmapPusher,
} from '@/services/mindmap/sync/push';
import type { MindmapReplicaRecord } from '@/services/sync/adapters/mindmap';

const BOOK = 'book1';
const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');

let fs: MemoryFileSystem;
let pusher: MindmapPusher;
let pending: Set<string>;
let deps: {
  canPush: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  publishRow: ReturnType<typeof vi.fn<MindmapPushDeps['publishRow']>>;
  queueUpload: ReturnType<typeof vi.fn<(record: MindmapReplicaRecord) => Promise<string | null>>>;
  confirmManifest: ReturnType<typeof vi.fn<MindmapPushDeps['confirmManifest']>>;
};

const store = () => useMindmapStore.getState();

const createMap = async (title = 'Characters'): Promise<string> =>
  (await store().createMap(BOOK, { ...DEFAULT_MAP_META, title }, clock)).mapId;

const rename = async (mapId: string, title: string): Promise<void> => {
  const read = await readMapFile(fs, BOOK, mapId);
  await saveMap(fs, BOOK, stampMeta(read!.file, { title }, clock));
};

const localMd5 = async (mapId: string): Promise<string> =>
  md5Hex(canonicalStringify((await readMapFile(fs, BOOK, mapId))!.file));

const outgoingFiles = async (mapId: string): Promise<string[]> =>
  (await fs.readDir(`${BOOK}/mindmaps/${mapId}/outgoing`, 'Books')).map((item) => item.path);

const held = <T>() => {
  let release: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release: (value: T) => release(value) };
};

const uploaded = (call = 0): MindmapReplicaRecord => deps.queueUpload.mock.calls[call]![0];

beforeEach(async () => {
  fs = new MemoryFileSystem();
  await store().hydrate(fs);
  pending = new Set();
  deps = {
    canPush: vi.fn(async () => true),
    publishRow: vi.fn(async () => {}),
    queueUpload: vi.fn(async (record: MindmapReplicaRecord) => {
      pending.add(record.mapId);
      return `upload-${record.mapId}`;
    }),
    confirmManifest: vi.fn(async () => true),
  };
  pusher = createMindmapPusher({
    fs,
    ...deps,
    isUploadPending: (mapId) => pending.has(mapId),
  });
});

afterEach(() => {
  pusher.dispose();
  vi.useRealTimers();
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
});

describe('mindmap push', () => {
  it('writes a content-named outgoing copy, publishes the row, then queues its upload', async () => {
    const mapId = await createMap('Carte mentale é');
    expect(await pusher.pushNow(mapId)).toBe('queued');
    const md5 = await localMd5(mapId);
    const text = await fs.readFile(`${BOOK}/mindmaps/${mapId}/${mapId}.json`, 'Books');
    expect(await outgoingFiles(mapId)).toEqual([`${mapId}.${md5}.json`]);
    expect(deps.publishRow).toHaveBeenCalledWith(store().getEntry(mapId));
    expect(uploaded()).toMatchObject({
      mapId,
      contentId: mapId,
      outgoing: {
        filename: `${mapId}.${md5}.json`,
        byteSize: new TextEncoder().encode(text).length,
      },
    });
    expect(uploaded().outgoing!.byteSize).toBeGreaterThan(text.length);
  });

  it('pushes nothing when the local file is the version the server already has', async () => {
    const mapId = await createMap();
    store().setSyncedMd5(mapId, await localMd5(mapId));
    expect(await pusher.pushNow(mapId)).toBe('current');
    expect(deps.queueUpload).not.toHaveBeenCalled();
    expect(await outgoingFiles(mapId)).toEqual([]);
  });

  it('waits for 30 s without changes before pushing', async () => {
    vi.useFakeTimers();
    const mapId = await createMap();
    pusher.schedule(mapId);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    pusher.schedule(mapId);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    expect(deps.queueUpload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pusher.idle();
    expect(deps.queueUpload).toHaveBeenCalledOnce();
  });

  it('never rewrites the outgoing copy while its upload is pending, and pushes again after the commit', async () => {
    vi.useFakeTimers();
    const mapId = await createMap('Ab');
    await pusher.pushNow(mapId);
    const first = uploaded().outgoing!.filename;
    await rename(mapId, 'Cd');
    expect(await pusher.pushNow(mapId)).toBe('pending');
    expect(await outgoingFiles(mapId)).toEqual([first]);
    pending.delete(mapId);
    await pusher.committed(mapId, [{ logical: first, lfp: '', byteSize: 1 }]);
    expect(store().getEntry(mapId)!.syncedMd5).toBe(first.split('.')[1]);
    expect(await outgoingFiles(mapId)).toEqual([]);
    await vi.advanceTimersByTimeAsync(REPUSH_DELAY_MS);
    await pusher.idle();
    expect(deps.queueUpload).toHaveBeenCalledTimes(2);
    const second = uploaded(1).outgoing!.filename;
    expect(second).not.toBe(first);
    expect(second.length).toBe(first.length);
    expect(second).toBe(`${mapId}.${await localMd5(mapId)}.json`);
  });

  it('does not push again after a commit when nothing changed since', async () => {
    vi.useFakeTimers();
    const mapId = await createMap();
    await pusher.pushNow(mapId);
    pending.delete(mapId);
    await pusher.committed(mapId, [
      { logical: uploaded().outgoing!.filename, lfp: '', byteSize: 1 },
    ]);
    await vi.advanceTimersByTimeAsync(REPUSH_DELAY_MS);
    await pusher.idle();
    expect(deps.queueUpload).toHaveBeenCalledOnce();
  });

  it('deletes only the committed copy, never a newer copy already waiting to upload', async () => {
    const mapId = await createMap('Ab');
    await pusher.pushNow(mapId);
    const first = uploaded().outgoing!.filename;
    pending.delete(mapId);
    await rename(mapId, 'Cd');
    await pusher.pushNow(mapId);
    const second = uploaded(1).outgoing!.filename;
    await pusher.committed(mapId, [{ logical: first, lfp: '', byteSize: 1 }]);
    expect(await outgoingFiles(mapId)).toEqual([second]);
  });

  it('keeps the copy a fresh upload of the same version needs when an earlier commit arrives late', async () => {
    const mapId = await createMap();
    await pusher.pushNow(mapId);
    const copy = uploaded().outgoing!.filename;
    pending.delete(mapId);
    expect(await pusher.pushNow(mapId)).toBe('queued');
    expect(uploaded(1).outgoing!.filename).toBe(copy);
    await pusher.committed(mapId, [{ logical: copy, lfp: '', byteSize: 1 }]);
    expect(await outgoingFiles(mapId)).toEqual([copy]);
    pending.delete(mapId);
    await pusher.committed(mapId, [{ logical: copy, lfp: '', byteSize: 1 }]);
    expect(await outgoingFiles(mapId)).toEqual([]);
  });

  it('keeps the copy a running push is about to upload when an earlier commit of it arrives', async () => {
    const mapId = await createMap();
    await pusher.pushNow(mapId);
    const copy = uploaded().outgoing!.filename;
    pending.delete(mapId);
    let release: () => void = () => {};
    deps.publishRow.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const result = pusher.pushNow(mapId);
    await vi.waitFor(() => expect(deps.publishRow).toHaveBeenCalledTimes(2));
    await pusher.committed(mapId, [{ logical: copy, lfp: '', byteSize: 1 }]);
    release();
    expect(await result).toBe('queued');
    expect(uploaded(1).outgoing!.filename).toBe(copy);
    expect(await outgoingFiles(mapId)).toEqual([copy]);
  });

  it('skips a push whose version a commit recorded while it was checking', async () => {
    const mapId = await createMap();
    let release: (value: boolean) => void = () => {};
    deps.canPush.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (release = resolve)),
    );
    const result = pusher.pushNow(mapId);
    store().setSyncedMd5(mapId, await localMd5(mapId));
    release(true);
    expect(await result).toBe('current');
    expect(deps.queueUpload).not.toHaveBeenCalled();
  });

  it('keeps a version unsynced with its copy when the server did not take its manifest, and pushes it again later', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mapId = await createMap();
    await pusher.pushNow(mapId);
    const copy = uploaded().outgoing!.filename;
    pending.delete(mapId);
    deps.confirmManifest.mockResolvedValueOnce(false);
    await pusher.committed(mapId, [{ logical: copy, lfp: '', byteSize: 1 }]);
    expect(deps.confirmManifest).toHaveBeenCalledWith(mapId);
    expect(store().getEntry(mapId)!.syncedMd5).toBeNull();
    expect(await outgoingFiles(mapId)).toEqual([copy]);
    expect(pusher.unpushed()).toEqual([mapId]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('mindmap'),
      expect.objectContaining({ mapId, md5: copy.split('.')[1] }),
    );
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    expect(deps.queueUpload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await pusher.idle();
    expect(deps.queueUpload).toHaveBeenCalledTimes(2);
    expect(uploaded(1).outgoing!.filename).toBe(copy);
    expect(pusher.unpushed()).toEqual([]);
  });

  it('marks a version synced only once its manifest is confirmed', async () => {
    const mapId = await createMap();
    await pusher.pushNow(mapId);
    const copy = uploaded().outgoing!.filename;
    pending.delete(mapId);
    const confirm = held<boolean>();
    deps.confirmManifest.mockReturnValueOnce(confirm.promise);
    const commit = pusher.committed(mapId, [{ logical: copy, lfp: '', byteSize: 1 }]);
    await vi.waitFor(() => expect(deps.confirmManifest).toHaveBeenCalledOnce());
    expect(store().getEntry(mapId)!.syncedMd5).toBeNull();
    expect(await outgoingFiles(mapId)).toEqual([copy]);
    confirm.release(true);
    await commit;
    expect(store().getEntry(mapId)!.syncedMd5).toBe(copy.split('.')[1]);
    expect(await outgoingFiles(mapId)).toEqual([]);
  });

  it('applies the commits of one map in the order they arrive', async () => {
    const mapId = await createMap('Ab');
    await pusher.pushNow(mapId);
    const first = uploaded().outgoing!.filename;
    pending.delete(mapId);
    await rename(mapId, 'Cd');
    await pusher.pushNow(mapId);
    const second = uploaded(1).outgoing!.filename;
    pending.delete(mapId);
    const confirm = held<boolean>();
    deps.confirmManifest.mockReturnValueOnce(confirm.promise);
    const early = pusher.committed(mapId, [{ logical: first, lfp: '', byteSize: 1 }]);
    const late = pusher.committed(mapId, [{ logical: second, lfp: '', byteSize: 1 }]);
    confirm.release(true);
    await Promise.all([early, late]);
    expect(store().getEntry(mapId)!.syncedMd5).toBe(second.split('.')[1]);
  });

  it('ignores a commit for a file that is not a version of the map', async () => {
    const mapId = await createMap();
    await pusher.committed(mapId, [{ logical: 'other.json', lfp: '', byteSize: 1 }]);
    expect(store().getEntry(mapId)!.syncedMd5).toBeNull();
  });

  it('writes nothing while signed out, offline or with mind map sync turned off', async () => {
    deps.canPush.mockResolvedValue(false);
    const mapId = await createMap();
    expect(await pusher.pushNow(mapId)).toBe('skipped');
    expect(deps.publishRow).not.toHaveBeenCalled();
    expect(await outgoingFiles(mapId)).toEqual([]);
  });

  it('saves an open map before reading it, so a pending edit is pushed', async () => {
    const mapId = await createMap();
    const opened = await openMapSession(fs, BOOK, mapId, clock);
    if (opened.status !== 'open') throw new Error('expected an open session');
    opened.session.updateMeta({ title: 'Edited just now' });
    await pusher.pushNow(mapId);
    const pushed = await fs.readFile(
      `${BOOK}/mindmaps/${mapId}/outgoing/${uploaded().outgoing!.filename}`,
      'Books',
    );
    expect(pushed).toContain('Edited just now');
  });

  it('runs one push per map at a time', async () => {
    const mapId = await createMap();
    const results = await Promise.all([pusher.pushNow(mapId), pusher.pushNow(mapId)]);
    expect(results).toEqual(['queued', 'pending']);
    expect(deps.queueUpload).toHaveBeenCalledOnce();
  });

  it('clears an outgoing copy left by an upload that failed before writing the next one', async () => {
    const mapId = await createMap('Ab');
    await pusher.pushNow(mapId);
    const stale = uploaded().outgoing!.filename;
    pending.delete(mapId);
    await rename(mapId, 'Cd');
    await pusher.pushNow(mapId);
    expect(await outgoingFiles(mapId)).toEqual([uploaded(1).outgoing!.filename]);
    expect(await outgoingFiles(mapId)).not.toContain(stale);
  });

  it('pushes every scheduled map at once on flush', async () => {
    const first = await createMap('One');
    const second = await createMap('Two');
    pusher.schedule(first);
    pusher.schedule(second);
    await pusher.flushAll();
    expect(deps.queueUpload.mock.calls.map(([record]) => record.mapId).sort()).toEqual(
      [first, second].sort(),
    );
  });

  it('remembers maps it could not push until a later push succeeds', async () => {
    deps.canPush.mockResolvedValue(false);
    const mapId = await createMap();
    await pusher.pushNow(mapId);
    expect(pusher.unpushed()).toEqual([mapId]);
    deps.canPush.mockResolvedValue(true);
    await pusher.pushNow(mapId);
    expect(pusher.unpushed()).toEqual([]);
  });

  it('reports a map it does not know and a map whose file cannot be read', async () => {
    expect(await pusher.pushNow('missing')).toBe('unknown-map');
    const mapId = await createMap();
    await fs.writeFile(`${BOOK}/mindmaps/${mapId}/${mapId}.json`, 'Books', '{');
    await fs.removeFile(`${BOOK}/mindmaps/${mapId}/${mapId}.json.bak`, 'Books');
    expect(await pusher.pushNow(mapId)).toBe('unreadable');
  });
});
