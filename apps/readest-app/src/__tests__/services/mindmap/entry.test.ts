import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import {
  type NewMapChoices,
  bookMapCount,
  createBookMap,
  currentUserPlan,
  resolveMapEntry,
} from '@/services/mindmap/entry';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { MINDMAP_BASE_DIR, mapFilePath } from '@/services/mindmap/persist/mapFile';
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
});

afterEach(() => {
  __resetMindmapStoreForTests();
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
