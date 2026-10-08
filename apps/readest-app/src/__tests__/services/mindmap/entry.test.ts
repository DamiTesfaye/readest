import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import {
  type NewMapChoices,
  __resetMindmapEntryForTests,
  bookMapCount,
  createBookMap,
  currentUserPlan,
  resolveMapEntry,
} from '@/services/mindmap/entry';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { MINDMAP_BASE_DIR, mapFilePath, mapTrashDir } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapTrashForTests,
  listTrashedMaps,
} from '@/services/mindmap/persist/mindmapTrash';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { decodeMeta } from '@/services/mindmap/schema/validate';

const access = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('@/utils/access', () => ({
  getAccessToken: async () => access.token,
  getUserProfilePlan: () => 'plus',
}));

const choices: NewMapChoices = {
  title: 'People',
  source: 'generated',
  intent: 'story',
  spoiler: 'grow',
  style: 'paper',
};

let fs: MemoryFileSystem;
const clock = () => createMindmapClock(new HlcGenerator('device-1'), 'device-1');

beforeEach(() => {
  fs = new MemoryFileSystem();
  access.token = null;
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
  __resetMindmapEntryForTests();
  useSettingsStore.setState({ settings: { syncCategories: {} } as unknown as SystemSettings });
});

afterEach(() => {
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
  __resetMindmapEntryForTests();
});

describe('resolveMapEntry', () => {
  it('asks for the new-map sheet when the book has no map', async () => {
    expect(await resolveMapEntry(fs, 'bookhash')).toEqual({ kind: 'sheet' });
  });

  it('opens the most recently edited map', async () => {
    const hlc = clock();
    await createBookMap({
      fs,
      bookHash: 'bookhash',
      plan: 'free',
      choices,
      progress: 0,
      clock: hlc,
    });
    const newest = await createBookMap({
      fs,
      bookHash: 'bookhash',
      plan: 'free',
      choices,
      progress: 0,
      clock: hlc,
    });
    expect(newest.status).toBe('created');
    expect(await resolveMapEntry(fs, 'bookhash')).toEqual({
      kind: 'map',
      mapId: newest.status === 'created' ? newest.mapId : '',
    });
  });
});

describe('resolveMapEntry with a preferred map', () => {
  it('opens the preferred map while the book index still lists it', async () => {
    const hlc = clock();
    await saveMap(fs, 'bookhash', createMapFile(DEFAULT_MAP_META, 'older', hlc));
    await saveMap(fs, 'bookhash', createMapFile(DEFAULT_MAP_META, 'newer', hlc));
    expect(await resolveMapEntry(fs, 'bookhash', 'older')).toEqual({ kind: 'map', mapId: 'older' });
    expect(await resolveMapEntry(fs, 'bookhash', 'gone')).toEqual({ kind: 'map', mapId: 'newer' });
  });
});

describe('createBookMap', () => {
  it('writes the first map file under the book hash with the reading progress', async () => {
    const result = await createBookMap({
      fs,
      bookHash: 'bookhash',
      plan: 'free',
      choices,
      progress: 0.42,
      clock: clock(),
    });
    if (result.status !== 'created') throw new Error('expected a map');
    const text = await fs.readFile(mapFilePath('bookhash', result.mapId), MINDMAP_BASE_DIR);
    expect(decodeMeta(JSON.parse(text).meta)).toMatchObject({ ...choices, lastSeenProgress: 0.42 });
    expect(useMindmapStore.getState().getEntry(result.mapId)).toMatchObject({
      bookHash: 'bookhash',
      syncedMd5: null,
    });
  });

  it('refuses a fourth map on the free plan and writes nothing', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createBookMap({
        fs,
        bookHash: 'bookhash',
        plan: 'free',
        choices,
        progress: 0,
        clock: clock(),
      });
    }
    const writes = fs.writes.length;
    expect(
      await createBookMap({
        fs,
        bookHash: 'bookhash',
        plan: 'free',
        choices,
        progress: 0,
        clock: clock(),
      }),
    ).toEqual({
      status: 'limit',
    });
    expect(fs.writes).toHaveLength(writes);
    expect(
      (
        await createBookMap({
          fs,
          bookHash: 'other',
          plan: 'free',
          choices,
          progress: 0,
          clock: clock(),
        })
      ).status,
    ).toBe('created');
  });

  it('counts maps on disk that the store does not know, such as after a backup restore', async () => {
    const hlc = clock();
    for (const mapId of ['m1', 'm2', 'm3']) {
      await saveMap(fs, 'bookhash', createMapFile(DEFAULT_MAP_META, mapId, hlc));
    }
    expect(await bookMapCount(fs, 'bookhash')).toBe(3);
    expect(
      await createBookMap({
        fs,
        bookHash: 'bookhash',
        plan: 'free',
        choices,
        progress: 0,
        clock: hlc,
      }),
    ).toEqual({ status: 'limit' });
  });

  it('never caps paid plans', async () => {
    for (let i = 0; i < 4; i += 1) {
      const result = await createBookMap({
        fs,
        bookHash: 'bookhash',
        plan: 'plus',
        choices,
        progress: 0,
        clock: clock(),
      });
      expect(result.status).toBe('created');
    }
  });
});

describe('currentUserPlan', () => {
  it('treats a signed-out reader as free and otherwise reads the token', async () => {
    expect(await currentUserPlan()).toBe('free');
    access.token = 'token';
    expect(await currentUserPlan()).toBe('plus');
  });
});

describe('the map trash when mind map sync is not running', () => {
  const trashTwoMaps = async (): Promise<{ plain: string; pending: string }> => {
    await useMindmapStore.getState().hydrate(fs);
    const hlc = clock();
    const store = useMindmapStore.getState();
    const plain = (await store.createMap('bookhash', DEFAULT_MAP_META, hlc)).mapId;
    const pending = (await store.createMap('bookhash', DEFAULT_MAP_META, hlc)).mapId;
    await store.moveToTrash(plain);
    await store.moveToTrash(pending, 'bookhash', { tombstone: true });
    __resetMindmapStoreForTests();
    __resetMindmapTrashForTests();
    return { plain, pending };
  };

  const trashFiles = async (mapId: string) =>
    fs.readDir(mapTrashDir('bookhash', mapId), MINDMAP_BASE_DIR);

  it('empties the trash once per session for a signed-out reader, keeping pending deletes', async () => {
    const { plain, pending } = await trashTwoMaps();
    await resolveMapEntry(fs, 'bookhash');
    expect(await trashFiles(plain)).toEqual([]);
    expect(await trashFiles(pending)).toEqual([]);
    expect(await listTrashedMaps(fs)).toEqual([
      { bookHash: 'bookhash', mapId: pending, tombstone: true },
    ]);
    const later = (
      await useMindmapStore.getState().createMap('bookhash', DEFAULT_MAP_META, clock())
    ).mapId;
    await useMindmapStore.getState().moveToTrash(later);
    await resolveMapEntry(fs, 'bookhash');
    expect(await trashFiles(later)).not.toEqual([]);
  });

  it('empties the trash when the mind map sync category is off', async () => {
    access.token = 'token';
    useSettingsStore.setState({
      settings: { syncCategories: { mindmap: false } } as unknown as SystemSettings,
    });
    const { plain } = await trashTwoMaps();
    await bookMapCount(fs, 'bookhash');
    expect(await trashFiles(plain)).toEqual([]);
  });

  it('leaves the trash to the sync cycle when mind map sync runs', async () => {
    access.token = 'token';
    const { plain } = await trashTwoMaps();
    await resolveMapEntry(fs, 'bookhash');
    expect(await trashFiles(plain)).not.toEqual([]);
    expect(await listTrashedMaps(fs)).toHaveLength(2);
  });
});
