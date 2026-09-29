import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { mapTrashDir } from '@/services/mindmap/persist/mapFile';
import {
  MINDMAP_TRASH_FILENAME,
  __resetMindmapTrashForTests,
  listTrashedMaps,
  sweepTrashedMaps,
} from '@/services/mindmap/persist/mindmapTrash';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { __resetMapSessionsForTests } from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';

const BOOK = 'book1';
const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
let fs: MemoryFileSystem;

const trashedMap = async (): Promise<string> => {
  const { mapId } = await useMindmapStore
    .getState()
    .createMap(BOOK, { ...DEFAULT_MAP_META, title: 'Old' }, clock);
  await useMindmapStore.getState().moveToTrash(mapId);
  return mapId;
};

const inTrash = async (mapId: string): Promise<boolean> =>
  (await fs.readDir(mapTrashDir(BOOK, mapId), 'Books')).length > 0;

beforeEach(async () => {
  fs = new MemoryFileSystem();
  await useMindmapStore.getState().hydrate(fs);
});

afterEach(() => {
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
});

describe('mindmap trash', () => {
  it('records every map moved to the trash in a ledger that survives a restart', async () => {
    const mapId = await trashedMap();
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId }]);
    expect(JSON.parse(await fs.readFile(MINDMAP_TRASH_FILENAME, 'Data'))).toEqual([
      { bookHash: BOOK, mapId },
    ]);
    __resetMindmapTrashForTests();
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId }]);
  });

  it('removes only the maps that were in the trash before the sync cycle began', async () => {
    const before = await trashedMap();
    const snapshot = await listTrashedMaps(fs);
    const during = await trashedMap();
    await sweepTrashedMaps(fs, snapshot);
    expect(await inTrash(before)).toBe(false);
    expect(await inTrash(during)).toBe(true);
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId: during }]);
  });

  it('drops ledger entries it cannot parse', async () => {
    await fs.writeFile(
      MINDMAP_TRASH_FILENAME,
      'Data',
      JSON.stringify([
        { bookHash: '../x', mapId: 'm' },
        { bookHash: BOOK },
        { bookHash: BOOK, mapId: 'ok' },
      ]),
    );
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId: 'ok' }]);
  });
});
