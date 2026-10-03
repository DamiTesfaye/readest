import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import type { Hlc } from '@/types/replica';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { canonicalStringify } from '@/services/mindmap/file/canonicalStringify';
import { type HlcClock, createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { highestHlc } from '@/services/mindmap/file/mergeMapFiles';
import { stampDiff } from '@/services/mindmap/file/stampDiff';
import { createHistory } from '@/services/mindmap/history/history';
import { mapFilePath, readMapFile, saveMapFile } from '@/services/mindmap/persist/mapFile';
import { loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import {
  type MapSession,
  type OpenMapSessionOptions,
  __resetMapSessionsForTests,
  getOpenMapSession,
  isMapSessionOpening,
  openMapSession,
  whenMapSessionSettled,
} from '@/services/mindmap/persist/session';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import {
  CURRENT_RECORD_VERSION,
  type MigrationConfig,
  RECORD_MIGRATIONS,
} from '@/services/mindmap/schema/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_MAP_META,
  type MapFile,
  type NodeRecord,
} from '@/services/mindmap/schema/types';
import type { MapStore } from '@/services/mindmap/store/mapStore';

const BOOK = 'book1';
const MAP = 'm1';
const MAIN = mapFilePath(BOOK, MAP);

const nodeIn = (store: MapStore, id: string): NodeRecord => store.get(id) as NodeRecord;

const deviceClock = (device = 'device-1'): HlcClock =>
  createMindmapClock(new HlcGenerator(device), device);

const blankFile = (): MapFile =>
  createMapFile({ ...DEFAULT_MAP_META, title: 'Family' }, MAP, deviceClock());

const withNode = (file: MapFile, id: string, label: string, clock: HlcClock): MapFile => {
  const node = createNodeRecord({ id, index: 'a0', label });
  return stampDiff(file, { added: [node], changed: [], discarded: [] }, clock, () => node);
};

const seed = async (fs: MemoryFileSystem, file: MapFile = blankFile()): Promise<void> => {
  await saveMapFile(fs, BOOK, file);
  fs.clearWrites();
};

const open = async (
  fs: MemoryFileSystem,
  options: OpenMapSessionOptions = {},
  clock: HlcClock = deviceClock(),
): Promise<MapSession> => {
  const result = await openMapSession(fs, BOOK, MAP, clock, options);
  if (result.status !== 'open') throw new Error('expected an open session');
  return result.session;
};

const onDisk = async (fs: MemoryFileSystem): Promise<MapFile> => {
  const read = await readMapFile(fs, BOOK, MAP);
  if (!read) throw new Error('expected a readable map file');
  return read.file;
};

const nodeToV2 = (
  migration: (fields: Record<string, unknown>) => Record<string, unknown>,
): MigrationConfig => ({
  migrations: { ...RECORD_MIGRATIONS, node: [migration] },
  targetVersions: { ...CURRENT_RECORD_VERSION, node: 2 },
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  __resetMapSessionsForTests();
  vi.useRealTimers();
});

describe('openMapSession', () => {
  it('opens the persisted records and meta', async () => {
    const fs = new MemoryFileSystem();
    const clock = deviceClock();
    await seed(fs, withNode(blankFile(), 'n1', 'Elizabeth', clock));
    const session = await open(fs);
    expect(session.store.get('n1')).toEqual(
      createNodeRecord({ id: 'n1', index: 'a0', label: 'Elizabeth' }),
    );
    expect(session.meta().title).toBe('Family');
    expect(session).toMatchObject({
      readOnly: false,
      readOnlyReason: null,
      restoredFromBackup: false,
    });
    expect(session.invalid()).toEqual([]);
    await session.close();
  });

  it('logs records that fail validation and keeps them out of the store', async () => {
    const fs = new MemoryFileSystem();
    const file = withNode(blankFile(), 'n1', 'Elizabeth', deviceClock());
    const kind = file.records['n1']!['kind']!;
    await seed(fs, {
      ...file,
      records: { n1: { ...file.records['n1']!, kind: { ...kind, v: 'wizard' } } },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = await open(fs);
    expect(session.invalid()).toEqual(['n1']);
    expect(session.store.get('n1')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('mindmap: skipped invalid records', ['n1']);
    warn.mockRestore();
    await session.close();
  });

  it('reports a map with no usable file as unreadable', async () => {
    expect(await openMapSession(new MemoryFileSystem(), BOOK, MAP, deviceClock())).toEqual({
      status: 'unreadable',
    });
  });

  it('saves a local edit after the debounce and not before', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'Elizabeth' })]);
    await vi.advanceTimersByTimeAsync(299);
    expect(fs.writesTo(MAIN)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fs.writesTo(MAIN)).toBe(1);
    expect((await onDisk(fs)).records['n1']!['label']!.v).toBe('Elizabeth');
    await session.close();
  });

  it('coalesces rapid edits into one save', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'a' })]);
    await vi.advanceTimersByTimeAsync(100);
    session.store.update('n1', { label: 'b' });
    await vi.advanceTimersByTimeAsync(300);
    expect(fs.writesTo(MAIN)).toBe(1);
    expect((await onDisk(fs)).records['n1']!['label']!.v).toBe('b');
    await session.close();
  });

  it('never stamps or saves a remote diff applied to the store directly', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.applyRemote({
      added: [createNodeRecord({ id: 'n1', index: 'a0' })],
      changed: [],
      discarded: [],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fs.writesTo(MAIN)).toBe(0);
    expect(session.file().records['n1']).toBeUndefined();
    await session.close();
  });

  it('stamps and saves generated diffs', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.applyGenerated({
      added: [createNodeRecord({ id: 'n1', index: 'a0', label: 'Chapter 1' })],
      changed: [],
      discarded: [],
    });
    await vi.advanceTimersByTimeAsync(300);
    expect((await onDisk(fs)).records['n1']!['label']!.v).toBe('Chapter 1');
    await session.close();
  });

  it('stamps meta updates, saves them and notifies meta listeners', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    const listener = vi.fn();
    session.listenMeta(listener);
    session.updateMeta({ title: 'Renamed' });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed' }));
    await vi.advanceTimersByTimeAsync(300);
    expect((await onDisk(fs)).meta['title']!.v).toBe('Renamed');
    await session.close();
  });

  it('close flushes a pending save and stops listening', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    await session.close();
    expect(fs.writesTo(MAIN)).toBe(1);
    session.store.put([createNodeRecord({ id: 'n2', index: 'a1' })]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fs.writesTo(MAIN)).toBe(1);
    expect(session.file().records['n2']).toBeUndefined();
  });

  it('restamps restored content when a saved delete is undone', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    const history = createHistory(session.store);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'keep me' })]);
    await session.flush();
    const mark = history.mark();
    session.store.remove(['n1'], 'user');
    history.squashToMark(mark);
    await session.flush();
    const afterDelete = (await onDisk(fs)).records['n1']!;
    expect(afterDelete['label']!.v).toBeNull();

    history.undo();
    await session.flush();

    const restored = (await onDisk(fs)).records['n1']!;
    expect(restored['deleted']!.v).toBeNull();
    expect(restored['label']!.v).toBe('keep me');
    expect(restored['label']!.t > afterDelete['deleted']!.t).toBe(true);
    await session.close();
  });

  it('leaves no record in the file after bailing out of a creating gesture', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    const history = createHistory(session.store);
    const mark = history.mark();
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    await vi.advanceTimersByTimeAsync(300);
    expect((await onDisk(fs)).records['n1']).toBeDefined();
    history.bailToMark(mark);
    await session.flush();
    expect((await onDisk(fs)).records['n1']).toBeUndefined();
    await session.close();
  });

  it('runs one save at a time and flush waits for the save in flight', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const write = fs.writeFile.bind(fs);
    let active = 0;
    let peak = 0;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (path, base, content) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await write(path, base, content);
      active -= 1;
    });
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'a' })]);
    await vi.advanceTimersByTimeAsync(310);
    session.store.update('n1', { label: 'b' });
    const flushed = session.flush();
    await vi.advanceTimersByTimeAsync(1000);
    await flushed;
    expect(peak).toBe(1);
    expect((await onDisk(fs)).records['n1']!['label']!.v).toBe('b');
    await session.close();
  });

  it('reports a failed save through onError and retries on the next flush', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const onError = vi.fn();
    const session = await open(fs, { hooks: { onError } });
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    await session.flush();
    expect(onError).toHaveBeenCalledWith(new Error('disk full'));
    expect((await onDisk(fs)).records['n1']).toBeUndefined();
    await session.flush();
    expect((await onDisk(fs)).records['n1']).toBeDefined();
    await session.close();
  });

  it('keeps the save queue usable when a throwing onError hook fails a save', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const onError = vi.fn(() => {
      throw new Error('hook broke');
    });
    const session = await open(fs, { hooks: { onError } });
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    await expect(session.flush()).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(new Error('disk full'));
    expect((await onDisk(fs)).records['n1']).toBeUndefined();
    await session.flush();
    expect((await onDisk(fs)).records['n1']).toBeDefined();
    await session.close();
  });

  it('does not leave an unhandled rejection on the debounced path when onError throws', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const onError = vi.fn(() => {
      throw new Error('hook broke');
    });
    const session = await open(fs, { hooks: { onError } });
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    await vi.advanceTimersByTimeAsync(300);
    expect(onError).toHaveBeenCalledTimes(1);
    await session.flush();
    expect((await onDisk(fs)).records['n1']).toBeDefined();
    await session.close();
  });

  it('opens read-only with no autosave when a migration fails', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs, withNode(blankFile(), 'n1', 'Elizabeth', deviceClock()));
    const session = await open(fs, {
      migration: nodeToV2(() => {
        throw new Error('bad');
      }),
    });
    expect(session).toMatchObject({ readOnly: true, readOnlyReason: 'migration-failed' });
    session.store.update('n1', { label: 'edited' });
    session.updateMeta({ title: 'Renamed' });
    await vi.advanceTimersByTimeAsync(1000);
    await session.close();
    expect(fs.writesTo(MAIN)).toBe(0);
  });

  it('opens a newer schema read-only', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs, { ...blankFile(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const session = await open(fs);
    expect(session).toMatchObject({ readOnly: true, readOnlyReason: 'newer-schema' });
    session.updateMeta({ title: 'Renamed' });
    await session.close();
    expect(fs.writesTo(MAIN)).toBe(0);
  });

  it('flags a map restored from its backup', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    await fs.writeFile(`${MAIN}.bak`, 'Books', await fs.readFile(MAIN, 'Books'));
    await fs.writeFile(MAIN, 'Books', 'not json');
    const session = await open(fs);
    expect(session.restoredFromBackup).toBe(true);
    await session.close();
  });

  it('saves a migrated file once it is opened', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs, withNode(blankFile(), 'n1', 'x', deviceClock()));
    const session = await open(fs, { migration: nodeToV2((fields) => fields) });
    await session.flush();
    expect((await onDisk(fs)).records['n1']!['version']!.v).toBe(2);
    await session.close();
  });

  it('merges a remote file so autosave keeps both sides', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'mine' })]);
    const remoteClock = deviceClock('device-2');
    const remote = withNode(
      createMapFile(DEFAULT_MAP_META, MAP, remoteClock),
      'n2',
      'theirs',
      remoteClock,
    );
    const listener = vi.fn();
    session.store.listen(listener);

    expect(session.mergeRemote(remote)).toBe('merged');

    expect(nodeIn(session.store, 'n2').label).toBe('theirs');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ added: [expect.objectContaining({ id: 'n2' })] }),
      'remote',
    );
    session.store.update('n1', { label: 'after' });
    expect(session.file().records['n1']!['label']!.t > highestHlc(remote)!).toBe(true);
    await session.flush();
    const disk = await onDisk(fs);
    expect(disk.records['n1']!['label']!.v).toBe('after');
    expect(disk.records['n2']!['label']!.v).toBe('theirs');
    await session.close();
  });

  it('catches the clock up to the file on open so a local edit beats the value it replaces', async () => {
    const fs = new MemoryFileSystem();
    const ahead = createMindmapClock(
      new HlcGenerator('device-2', () => Date.now() + 3_600_000),
      'device-2',
    );
    const seeded = withNode(blankFile(), 'n1', 'old', ahead);
    await seed(fs, seeded);
    const session = await open(fs);
    session.store.update('n1', { label: 'new' });
    expect(session.file().records['n1']!['label']!.t > seeded.records['n1']!['label']!.t).toBe(
      true,
    );
    session.mergeRemote(seeded);
    expect(nodeIn(session.store, 'n1').label).toBe('new');
    await session.close();
  });

  it('ignores a far-future clock in a remote file and keeps stamping and saving', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'mine' })]);
    const theirs = withNode(blankFile(), 'n2', 'theirs', deviceClock('device-2'));
    const poisoned: MapFile = {
      ...theirs,
      records: {
        n2: Object.fromEntries(
          Object.entries(theirs.records['n2']!).map(([key, envelope]) => [
            key,
            { ...envelope, t: 'fffffffffffff-ffffffff-evil' as Hlc },
          ]),
        ),
      },
    };

    session.mergeRemote(poisoned);
    expect(() => session.store.update('n1', { label: 'after' })).not.toThrow();
    expect(session.file().records['n1']!['label']!.t < 'fffffffffffff').toBe(true);
    await session.flush();
    expect((await onDisk(fs)).records['n1']!['label']!.v).toBe('after');
    await session.close();
  });

  it('refuses to merge a remote map from a newer schema and reports it as an error', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const onError = vi.fn();
    const session = await open(fs, { hooks: { onError } });
    const before = session.file();
    const beforeStore = session.store.all();
    const remote: MapFile = {
      ...blankFile(),
      mapId: MAP,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    };

    expect(session.mergeRemote(remote)).toBe('newer-schema');

    expect(session.file()).toBe(before);
    expect(session.store.all()).toEqual(beforeStore);
    expect(onError).toHaveBeenCalledWith(
      new Error('mindmap: remote map needs a newer app version'),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(fs.writesTo(MAIN)).toBe(0);
    await session.close();
  });

  it('tells save listeners the saved file and its bytes and keeps index.json current', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const onSaved = vi.fn();
    const session = await open(fs);
    const unlisten = session.listenSaved(onSaved);
    session.updateMeta({ title: 'Indexed' });
    await session.flush();
    const [file, text] = onSaved.mock.calls[0]!;
    expect(text).toBe(canonicalStringify(file));
    expect(text).toBe(await fs.readFile(MAIN, 'Books'));
    expect((await loadMindmapIndex(fs, BOOK))[0]).toMatchObject({ mapId: MAP, title: 'Indexed' });
    unlisten();
    session.updateMeta({ title: 'Quiet' });
    await session.flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
    await session.close();
  });

  it('reports whether a flush left the file on disk current', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs, { hooks: { onError: vi.fn() } });
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    const write = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    expect(await session.flush()).toBe(false);
    write.mockRestore();
    expect(await session.flush()).toBe(true);
    await session.close();
  });

  it('refuses to merge into a read-only session and leaves it untouched', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs, withNode(blankFile(), 'n1', 'Elizabeth', deviceClock()));
    const session = await open(fs, {
      migration: nodeToV2(() => {
        throw new Error('bad');
      }),
    });
    const before = session.file();
    const remote = withNode(blankFile(), 'n2', 'theirs', deviceClock('device-2'));
    expect(session.mergeRemote(remote)).toBe('read-only');
    expect(session.file()).toBe(before);
    expect(session.store.get('n2')).toBeUndefined();
    await session.close();
  });

  it('allows one open session per map and finds it', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    expect(getOpenMapSession(MAP)).toBe(session);
    expect((await openMapSession(fs, BOOK, MAP, deviceClock())).status).toBe('already-open');
    await session.close();
    expect(getOpenMapSession(MAP)).toBeUndefined();
    await (await open(fs)).close();
  });

  it('discard stops the session without saving and waits for a save in flight', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    let unblock = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    vi.spyOn(fs, 'createDir').mockImplementationOnce(() => gate);
    const inFlight = session.flush();
    await vi.advanceTimersByTimeAsync(0);
    session.store.put([createNodeRecord({ id: 'n2', index: 'a1' })]);
    let discardDone = false;
    const discarding = session.discard().then(() => {
      discardDone = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(discardDone).toBe(false);
    unblock();
    await discarding;
    await inFlight;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fs.writesTo(MAIN)).toBe(1);
    expect((await onDisk(fs)).records['n2']).toBeUndefined();
    expect(getOpenMapSession(MAP)).toBeUndefined();
    expect(await session.flush()).toBe(false);
  });

  it('closes a discarded session without reporting a failed save', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    session.store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    await session.discard();
    session.updateMeta({ title: 'After the delete' });
    expect(await session.close()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fs.writesTo(MAIN)).toBe(0);
  });
});

describe('whenMapSessionSettled', () => {
  it('lets a merge that arrives while the map is loading go through the session', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs, withNode(blankFile(), 'a', 'Local', deviceClock()));
    const opening = openMapSession(fs, BOOK, MAP, deviceClock());
    expect(isMapSessionOpening(MAP)).toBe(true);
    const remote = withNode(await onDisk(fs), 'r', 'Remote', deviceClock('device-2'));
    const session = await whenMapSessionSettled(MAP);
    expect(isMapSessionOpening(MAP)).toBe(false);
    expect(session).toBeDefined();
    expect(session!.mergeRemote(remote)).toBe('merged');
    const result = await opening;
    if (result.status !== 'open') throw new Error('expected an open session');
    expect(result.session).toBe(session);
    session!.store.update('a', { label: 'Edited' });
    await session!.close();
    expect(Object.keys((await onDisk(fs)).records).sort()).toEqual(['a', 'r']);
  });

  it('settles to undefined when the map cannot be opened', async () => {
    const fs = new MemoryFileSystem();
    const opening = openMapSession(fs, BOOK, MAP, deviceClock());
    expect(await whenMapSessionSettled(MAP)).toBeUndefined();
    expect(await opening).toEqual({ status: 'unreadable' });
  });

  it('returns an already open session at once', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs);
    expect(isMapSessionOpening(MAP)).toBe(false);
    expect(await whenMapSessionSettled(MAP)).toBe(session);
    await session.close();
  });
});

describe('close result', () => {
  it('reports whether the final flush saved', async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const session = await open(fs, { hooks: { onError: () => undefined } });
    session.updateMeta({ title: 'Lost' });
    vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('disk full'));
    expect(await session.close()).toBe(false);
    const other = await open(fs);
    expect(await other.close()).toBe(true);
  });
});
