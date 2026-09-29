import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator, hlcCompare, hlcPack } from '@/libs/crdt';
import { canonicalStringify, md5Hex } from '@/services/mindmap/file/canonicalStringify';
import { type HlcClock, createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { highestHlc } from '@/services/mindmap/file/mergeMapFiles';
import { stampDiff, stampMeta } from '@/services/mindmap/file/stampDiff';
import { mapFileDir, mapFilePath, readMapFile } from '@/services/mindmap/persist/mapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import { loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { __resetMapSessionsForTests, openMapSession } from '@/services/mindmap/persist/session';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META, type MapFile } from '@/services/mindmap/schema/types';
import { type MindmapMergeDeps, mergeIncomingVersion } from '@/services/mindmap/sync/merge';
import {
  __resetMindmapManifestsForTests,
  noteMindmapManifest,
  versionFilename,
} from '@/services/mindmap/sync/versions';
import type { ReplicaTransferFile } from '@/store/transferStore';
import type { Hlc } from '@/types/replica';

const BOOK = 'book1';
const MAP = 'map1';
const DIR = mapFileDir(BOOK, MAP);

let fs: MemoryFileSystem;
let local: HlcClock;
let remoteClock: HlcClock;
let deps: MindmapMergeDeps & {
  schedulePush: ReturnType<typeof vi.fn<(mapId: string) => void>>;
  queueDownload: ReturnType<typeof vi.fn<MindmapMergeDeps['queueDownload']>>;
};

const store = () => useMindmapStore.getState();

const withNode = (file: MapFile, id: string, label: string, clock: HlcClock): MapFile => {
  const node = createNodeRecord({ id, index: 'a0', label });
  return stampDiff(file, { added: [node], changed: [], discarded: [] }, clock, () => node);
};

const relabel = (file: MapFile, id: string, label: string, clock: HlcClock): MapFile =>
  stampDiff(
    file,
    { added: [], changed: [{ id, field: 'label', from: '', to: label }], discarded: [] },
    clock,
    () => undefined,
  );

const base = (): MapFile =>
  withNode(createMapFile({ ...DEFAULT_MAP_META, title: 'Shared' }, MAP, local), 'n1', 'One', local);

const seedLocal = async (file: MapFile, syncedMd5: string | null = null): Promise<void> => {
  await saveMap(fs, BOOK, file);
  store().upsertEntry({ mapId: MAP, bookHash: BOOK, name: 'Shared', bundleDir: DIR, syncedMd5 });
};

const deliver = async (
  text: string,
  name = `${MAP}.${md5Hex(text)}.json`,
): Promise<ReplicaTransferFile[]> => {
  const lfp = `${DIR}/incoming/${name}`;
  await fs.writeFile(lfp, 'Books', text);
  return [{ logical: name, lfp, byteSize: text.length }];
};

const diskFile = async (): Promise<MapFile> => (await readMapFile(fs, BOOK, MAP))!.file;

beforeEach(async () => {
  fs = new MemoryFileSystem();
  local = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
  remoteClock = createMindmapClock(new HlcGenerator('dev-b'), 'dev-b');
  await store().hydrate(fs);
  deps = { fs, clock: () => local, schedulePush: vi.fn(), queueDownload: vi.fn() };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
  __resetMindmapManifestsForTests();
});

describe('mergeIncomingVersion', () => {
  it('discards a download whose bytes do not match its name and keeps syncedMd5', async () => {
    const shared = base();
    await seedLocal(shared, 'old');
    const files = await deliver('{"truncated', versionFilename(MAP, 'a'.repeat(32)));
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('corrupt');
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(false);
    expect(store().getEntry(MAP)!.syncedMd5).toBe('old');
    expect(canonicalStringify(await diskFile())).toBe(canonicalStringify(shared));
  });

  it('marks a version that matches its name but cannot be parsed as seen, and pushes past it', async () => {
    await seedLocal(base(), 'old');
    const files = await deliver('not json');
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('unparseable');
    expect(store().getEntry(MAP)!.syncedMd5).toBe(md5Hex('not json'));
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(false);
    expect(deps.schedulePush).toHaveBeenCalledWith(MAP);
  });

  it('keeps a version from a newer app and leaves syncedMd5 alone', async () => {
    await seedLocal(base(), 'old');
    const files = await deliver(canonicalStringify({ ...base(), schemaVersion: 99 }));
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('newer-schema');
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(true);
    expect(store().getEntry(MAP)!.syncedMd5).toBe('old');
  });

  it('merges a closed map field by field, writes it canonically and pushes the result', async () => {
    const shared = base();
    await seedLocal(relabel(shared, 'n1', 'Local label', local));
    const remote = stampMeta(shared, { title: 'Remote title' }, remoteClock);
    const text = canonicalStringify(remote);
    const files = await deliver(text);
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('merged');
    const merged = await diskFile();
    expect(merged.records['n1']!['label']!.v).toBe('Local label');
    expect(merged.meta['title']!.v).toBe('Remote title');
    expect(await fs.readFile(mapFilePath(BOOK, MAP), 'Books')).toBe(canonicalStringify(merged));
    expect(store().getEntry(MAP)).toMatchObject({ syncedMd5: md5Hex(text), name: 'Remote title' });
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(false);
    expect(deps.schedulePush).toHaveBeenCalledWith(MAP);
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.title)).toEqual([
      'Remote title',
    ]);
  });

  it('does not push when the merged file is the version it received', async () => {
    const shared = base();
    await seedLocal(shared);
    const files = await deliver(
      canonicalStringify(stampMeta(shared, { title: 'Newer' }, remoteClock)),
    );
    await mergeIncomingVersion(deps, MAP, files);
    expect(deps.schedulePush).not.toHaveBeenCalled();
  });

  it('observes the remote clock so later local edits win over it', async () => {
    await seedLocal(base());
    const ahead = createMindmapClock(
      {
        next: () => hlcPack(Date.now() + 3_600_000, 0, 'dev-b') as Hlc,
        observe: () => {},
      },
      'dev-b',
    );
    const remote = stampMeta(base(), { title: 'From the future' }, ahead);
    await mergeIncomingVersion(deps, MAP, await deliver(canonicalStringify(remote)));
    expect(hlcCompare(local.next(), highestHlc(remote)!)).toBeGreaterThan(0);
  });

  it('writes a map that is new to this device and lists it', async () => {
    store().upsertEntry({ mapId: MAP, bookHash: BOOK, name: MAP, bundleDir: DIR, syncedMd5: null });
    const text = canonicalStringify(base());
    expect(await mergeIncomingVersion(deps, MAP, await deliver(text))).toBe('merged');
    expect(await fs.readFile(mapFilePath(BOOK, MAP), 'Books')).toBe(text);
    expect(store().getEntry(MAP)).toMatchObject({ name: 'Shared', syncedMd5: md5Hex(text) });
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.mapId)).toEqual([MAP]);
  });

  it('merges into an open map through its session so autosave keeps the remote edit', async () => {
    const shared = base();
    await seedLocal(shared);
    const opened = await openMapSession(fs, BOOK, MAP, local);
    if (opened.status !== 'open') throw new Error('expected an open session');
    const { session } = opened;
    session.store.update('n1', { label: 'Typed locally' });
    const remote = withNode(shared, 'n2', 'From device B', remoteClock);
    expect(await mergeIncomingVersion(deps, MAP, await deliver(canonicalStringify(remote)))).toBe(
      'merged',
    );
    expect(session.store.get('n2')).toMatchObject({ label: 'From device B' });
    await session.close();
    const saved = await diskFile();
    expect(saved.records['n1']!['label']!.v).toBe('Typed locally');
    expect(saved.records['n2']!['label']!.v).toBe('From device B');
  });

  it('waits for a map that is still opening and merges through that session', async () => {
    await seedLocal(base());
    const opening = openMapSession(fs, BOOK, MAP, local);
    const merging = mergeIncomingVersion(
      deps,
      MAP,
      await deliver(canonicalStringify(withNode(base(), 'n2', 'Late', remoteClock))),
    );
    const opened = await opening;
    expect(await merging).toBe('merged');
    if (opened.status !== 'open') throw new Error('expected an open session');
    expect(opened.session.store.get('n2')).toMatchObject({ label: 'Late' });
  });

  it('re-merges into a session that opened while the closed-map write was pending', async () => {
    const shared = base();
    await seedLocal(shared);
    const files = await deliver(
      canonicalStringify(withNode(shared, 'n2', 'From device B', remoteClock)),
    );
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => {};
    const writing = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const realWrite = fs.writeFile.bind(fs);
    let armed = true;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (path, baseDir, content) => {
      if (armed && path === mapFilePath(BOOK, MAP)) {
        armed = false;
        reached();
        await held;
      }
      return realWrite(path, baseDir, content);
    });
    const merging = mergeIncomingVersion(deps, MAP, files);
    await writing;
    const opened = await openMapSession(fs, BOOK, MAP, local);
    if (opened.status !== 'open') throw new Error('expected an open session');
    const { session } = opened;
    session.store.update('n1', { label: 'Typed locally' });
    release();
    expect(await merging).toBe('merged');
    expect(session.store.get('n2')).toMatchObject({ label: 'From device B' });
    await session.close();
    const saved = await diskFile();
    expect(saved.records['n1']!['label']!.v).toBe('Typed locally');
    expect(saved.records['n2']!['label']!.v).toBe('From device B');
  });

  it('reports save-failed and keeps the incoming copy when the closed-map write fails', async () => {
    await seedLocal(base(), 'old');
    const files = await deliver(
      canonicalStringify(withNode(base(), 'n2', 'From device B', remoteClock)),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('disk full'));
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('save-failed');
    expect(error).toHaveBeenCalled();
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(true);
    expect(store().getEntry(MAP)!.syncedMd5).toBe('old');
    expect(deps.schedulePush).not.toHaveBeenCalled();
  });

  it('leaves a read-only open map and its incoming copy untouched', async () => {
    await seedLocal({ ...base(), schemaVersion: 99 }, 'old');
    const opened = await openMapSession(fs, BOOK, MAP, local);
    expect(opened.status === 'open' && opened.session.readOnly).toBe(true);
    const files = await deliver(canonicalStringify(base()));
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('read-only');
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(true);
    expect(store().getEntry(MAP)!.syncedMd5).toBe('old');
  });

  it('moves a local file it cannot read aside, byte for byte, and restores the map from the download', async () => {
    await seedLocal(base(), 'old');
    await fs.writeFile(mapFilePath(BOOK, MAP), 'Books', '{');
    await fs.removeFile(`${mapFilePath(BOOK, MAP)}.bak`, 'Books');
    const remote = stampMeta(base(), { title: 'Remote title' }, remoteClock);
    const text = canonicalStringify(remote);
    const files = await deliver(text);
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('merged');
    expect(await fs.readFile(`${mapFilePath(BOOK, MAP)}.unreadable`, 'Books')).toBe('{');
    expect(await fs.readFile(mapFilePath(BOOK, MAP), 'Books')).toBe(text);
    expect(store().getEntry(MAP)).toMatchObject({ syncedMd5: md5Hex(text), name: 'Remote title' });
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(false);
    expect(deps.schedulePush).not.toHaveBeenCalled();
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.title)).toEqual([
      'Remote title',
    ]);
  });

  it('keeps an older copy moved aside as unreadable instead of overwriting it', async () => {
    await seedLocal(base(), 'old');
    await fs.writeFile(`${mapFilePath(BOOK, MAP)}.unreadable`, 'Books', 'first');
    await fs.writeFile(mapFilePath(BOOK, MAP), 'Books', 'second');
    await fs.removeFile(`${mapFilePath(BOOK, MAP)}.bak`, 'Books');
    const text = canonicalStringify(base());
    expect(await mergeIncomingVersion(deps, MAP, await deliver(text))).toBe('merged');
    expect(await fs.readFile(`${mapFilePath(BOOK, MAP)}.unreadable`, 'Books')).toBe('first');
    expect(await fs.readFile(mapFilePath(BOOK, MAP), 'Books')).toBe(text);
  });

  it('never overwrites a local file it cannot read or move aside', async () => {
    await seedLocal(base(), 'old');
    await fs.writeFile(mapFilePath(BOOK, MAP), 'Books', '{');
    await fs.removeFile(`${mapFilePath(BOOK, MAP)}.bak`, 'Books');
    const files = await deliver(canonicalStringify(base()));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'copyFile').mockRejectedValue(new Error('disk full'));
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('local-unreadable');
    expect(error).toHaveBeenCalled();
    expect(await fs.readFile(mapFilePath(BOOK, MAP), 'Books')).toBe('{');
    expect(await fs.exists(files[0]!.lfp, 'Books')).toBe(true);
    expect(store().getEntry(MAP)!.syncedMd5).toBe('old');
  });

  it('queues the newer version a pull saw while this one was downloading', async () => {
    await seedLocal(base());
    const newer = { filename: versionFilename(MAP, 'e'.repeat(32)), byteSize: 5, partialMd5: 'x' };
    noteMindmapManifest(MAP, newer);
    await mergeIncomingVersion(deps, MAP, await deliver(canonicalStringify(base())));
    expect(deps.queueDownload).toHaveBeenCalledWith(store().getEntry(MAP), newer);
  });

  it('queues nothing more when the manifest still names the version it merged', async () => {
    await seedLocal(base());
    const text = canonicalStringify(base());
    noteMindmapManifest(MAP, {
      filename: versionFilename(MAP, md5Hex(text)),
      byteSize: 5,
      partialMd5: 'x',
    });
    await mergeIncomingVersion(deps, MAP, await deliver(text));
    expect(deps.queueDownload).not.toHaveBeenCalled();
  });

  it('ignores a download for a map this device no longer has', async () => {
    const files = await deliver(canonicalStringify(base()));
    expect(await mergeIncomingVersion(deps, MAP, files)).toBe('unknown-map');
    expect(await fs.exists(mapFilePath(BOOK, MAP), 'Books')).toBe(false);
  });
});
