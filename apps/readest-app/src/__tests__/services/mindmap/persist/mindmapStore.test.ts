import { afterEach, describe, expect, it, vi } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import {
  mapFileDir,
  mapFilePath,
  mapTrashDir,
  readMapFile,
} from '@/services/mindmap/persist/mapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import { loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import {
  __resetMapSessionsForTests,
  getOpenMapSession,
  openMapSession,
} from '@/services/mindmap/persist/session';
import {
  MINDMAP_STORE_FILENAME,
  type MindmapEntry,
  __resetMindmapStoreForTests,
  findMindmapByContentId,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { decodeMeta } from '@/services/mindmap/schema/validate';

const entry = (mapId: string, bookHash = 'b1', syncedMd5: string | null = null): MindmapEntry => ({
  mapId,
  bookHash,
  name: `Map ${mapId}`,
  bundleDir: mapFileDir(bookHash, mapId),
  syncedMd5,
});

const unsafeEntry = (
  mapId: string,
  bookHash = 'b1',
  syncedMd5: string | null = null,
): MindmapEntry => ({
  mapId,
  bookHash,
  name: `Map ${mapId}`,
  bundleDir: `${bookHash}/mindmaps/${mapId}`,
  syncedMd5,
});

const store = () => useMindmapStore.getState();

const clock = () => createMindmapClock(new HlcGenerator('device-1'), 'device-1');

const stored = async (fs: MemoryFileSystem): Promise<unknown> =>
  JSON.parse(await fs.readFile(MINDMAP_STORE_FILENAME, 'Data'));

afterEach(() => {
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
});

describe('useMindmapStore', () => {
  it('hydrates to no entries when nothing is stored', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    expect(store().entries).toEqual([]);
    expect(store().hydrated).toBe(true);
  });

  it('persists every change and hydrates it into a fresh store', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    store().upsertEntry(entry('m1'));
    store().setSyncedMd5('m1', 'abc');
    await store().whenPersisted();
    expect(await stored(fs)).toEqual([entry('m1', 'b1', 'abc')]);

    __resetMindmapStoreForTests();
    await store().hydrate(fs);
    expect(store().entries).toEqual([entry('m1', 'b1', 'abc')]);
  });

  it('keeps a syncedMd5 set while hydrate is still reading the stored one', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(MINDMAP_STORE_FILENAME, 'Data', JSON.stringify([entry('m1', 'b1', 'old')]));
    const hydrating = store().hydrate(fs);
    store().upsertEntry(entry('m1', 'b1', 'new'));
    await hydrating;
    await store().whenPersisted();
    expect(store().getEntry('m1')!.syncedMd5).toBe('new');
    expect(await stored(fs)).toEqual([entry('m1', 'b1', 'new')]);
  });

  it('leaves the stored entries on disk when reading them fails at hydrate', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(MINDMAP_STORE_FILENAME, 'Data', JSON.stringify([entry('m1', 'b1', 'abc')]));
    const readFile = vi
      .spyOn(fs, 'readFile')
      .mockRejectedValueOnce(new Error('EIO'))
      .mockRejectedValueOnce(new Error('EIO'));
    await store().hydrate(fs);
    await store().whenPersisted();
    readFile.mockRestore();
    expect(await stored(fs)).toEqual([entry('m1', 'b1', 'abc')]);
  });

  it('keeps purges, removals and entries made before hydration', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(
      MINDMAP_STORE_FILENAME,
      'Data',
      JSON.stringify([entry('m1', 'b1'), entry('m2', 'b2', 'disk'), entry('m3', 'b2')]),
    );
    store().removeByBookHash('b1');
    store().removeEntry('m3');
    store().upsertEntry(entry('m2', 'b2', 'memory'));
    await store().hydrate(fs);
    await store().whenPersisted();
    expect(store().entries).toEqual([entry('m2', 'b2', 'memory')]);
    expect(await stored(fs)).toEqual([entry('m2', 'b2', 'memory')]);
  });

  it('applyRemoteMap adds new maps and never changes an existing entry', () => {
    store().applyRemoteMap(entry('m1', 'b1', 'remote'));
    expect(store().getEntry('m1')!.syncedMd5).toBe('remote');
    store().upsertEntry(entry('m2', 'b1', 'local'));
    store().applyRemoteMap({ ...entry('m2', 'b1', 'remote'), name: 'other' });
    expect(store().getEntry('m2')).toEqual(entry('m2', 'b1', 'local'));
  });

  it('applyRemoteMap ignores an entry with an unsafe mapId or bookHash', () => {
    store().applyRemoteMap(unsafeEntry('../..', 'b1', 'remote'));
    expect(store().getEntry('../..')).toBeUndefined();
    store().applyRemoteMap(unsafeEntry('m1', '../..', 'remote'));
    expect(store().getEntry('m1')).toBeUndefined();
    expect(store().entries).toEqual([]);
  });

  it('drops stored entries with an unsafe mapId or bookHash at hydrate', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(
      MINDMAP_STORE_FILENAME,
      'Data',
      JSON.stringify([entry('m1', 'b1'), unsafeEntry('../..', 'b1'), unsafeEntry('m2', '../..')]),
    );
    await store().hydrate(fs);
    expect(store().entries).toEqual([entry('m1', 'b1')]);
  });

  it('setSyncedMd5 ignores unknown maps', () => {
    store().setSyncedMd5('missing', 'abc');
    expect(store().entries).toEqual([]);
  });

  it('lists a book, finds a map by content id and drops a purged book', () => {
    store().upsertEntry(entry('m1', 'b1'));
    store().upsertEntry(entry('m2', 'b2'));
    expect(store().entriesForBook('b1')).toEqual([entry('m1', 'b1')]);
    expect(findMindmapByContentId('m2')).toEqual(entry('m2', 'b2'));
    expect(findMindmapByContentId('')).toBeUndefined();
    store().removeByBookHash('b1');
    expect(store().entries).toEqual([entry('m2', 'b2')]);
  });

  it('createMap writes the file and the index and registers an unsynced entry', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    const file = await store().createMap(
      'b1',
      { ...DEFAULT_MAP_META, title: 'Family', source: 'generated' },
      clock(),
    );
    expect(decodeMeta(file.meta)).toMatchObject({ title: 'Family', source: 'generated' });
    expect((await readMapFile(fs, 'b1', file.mapId))!.file.mapId).toBe(file.mapId);
    expect(await loadMindmapIndex(fs, 'b1')).toEqual([
      expect.objectContaining({ mapId: file.mapId, title: 'Family', source: 'generated' }),
    ]);
    expect(store().getEntry(file.mapId)).toEqual({
      mapId: file.mapId,
      bookHash: 'b1',
      name: 'Family',
      bundleDir: mapFileDir('b1', file.mapId),
      syncedMd5: null,
    });
  });

  it('createMap rejects before hydration', async () => {
    await expect(store().createMap('b1', DEFAULT_MAP_META, clock())).rejects.toThrow(
      'not hydrated',
    );
  });

  it('moveToTrash moves the whole map directory and drops the entry and index entry', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    const { mapId } = await store().createMap('b1', DEFAULT_MAP_META, clock());
    const dir = mapFileDir('b1', mapId);
    await fs.writeFile(`${dir}/incoming/x.json`, 'Books', 'in');
    await fs.writeFile(`${dir}/outgoing/y.json`, 'Books', 'out');

    await store().moveToTrash(mapId);

    expect(store().getEntry(mapId)).toBeUndefined();
    expect(await fs.exists(mapFilePath('b1', mapId), 'Books')).toBe(false);
    expect(await fs.readFile(`${mapTrashDir('b1', mapId)}/incoming/x.json`, 'Books')).toBe('in');
    expect(await fs.readFile(`${mapTrashDir('b1', mapId)}/outgoing/y.json`, 'Books')).toBe('out');
    expect(await loadMindmapIndex(fs, 'b1')).toEqual([]);
  });

  it('moveToTrash discards an open session so its autosave cannot bring the map back', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    const c = clock();
    const { mapId } = await store().createMap('b1', DEFAULT_MAP_META, c);
    const opened = await openMapSession(fs, 'b1', mapId, c);
    if (opened.status !== 'open') throw new Error('expected an open session');
    opened.session.updateMeta({ title: 'Pending' });

    await store().moveToTrash(mapId);
    await opened.session.close();
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(await fs.exists(mapFileDir('b1', mapId), 'Books')).toBe(false);
    expect(await loadMindmapIndex(fs, 'b1')).toEqual([]);
    expect(getOpenMapSession(mapId)).toBeUndefined();
  });

  it('moveToTrash trashes a map that is on disk but missing from the store', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    const c = clock();
    const file = createMapFile(DEFAULT_MAP_META, 'restored', c);
    await saveMap(fs, 'b1', file);
    expect(store().getEntry('restored')).toBeUndefined();

    await store().moveToTrash('restored', 'b1');

    expect(await fs.exists(mapFilePath('b1', 'restored'), 'Books')).toBe(false);
    expect(await loadMindmapIndex(fs, 'b1')).toEqual([]);
  });

  it('softDeleteByContentId trashes the map without blocking the caller', async () => {
    const fs = new MemoryFileSystem();
    await store().hydrate(fs);
    const { mapId } = await store().createMap('b1', DEFAULT_MAP_META, clock());
    store().softDeleteByContentId(mapId);
    await vi.waitFor(() => expect(store().getEntry(mapId)).toBeUndefined());
    expect(await fs.exists(mapFilePath('b1', mapId), 'Books')).toBe(false);
  });
});
