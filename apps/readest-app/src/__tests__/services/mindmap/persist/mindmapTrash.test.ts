import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { mapTrashDir } from '@/services/mindmap/persist/mapFile';
import {
  MINDMAP_TRASH_FILENAME,
  __resetMindmapTrashForTests,
  confirmTombstones,
  hasPendingTombstone,
  listTrashedMaps,
  recordTrashedMap,
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
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId, tombstone: false }]);
    expect(JSON.parse(await fs.readFile(MINDMAP_TRASH_FILENAME, 'Data'))).toEqual([
      { bookHash: BOOK, mapId, tombstone: false },
    ]);
    __resetMindmapTrashForTests();
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId, tombstone: false }]);
  });

  it('removes only the maps that were in the trash before the sync cycle began', async () => {
    const before = await trashedMap();
    const snapshot = await listTrashedMaps(fs);
    const during = await trashedMap();
    await sweepTrashedMaps(fs, snapshot);
    expect(await inTrash(before)).toBe(false);
    expect(await inTrash(during)).toBe(true);
    expect(await listTrashedMaps(fs)).toEqual([
      { bookHash: BOOK, mapId: during, tombstone: false },
    ]);
  });

  it('drops ledger entries it cannot parse', async () => {
    await fs.writeFile(
      MINDMAP_TRASH_FILENAME,
      'Data',
      JSON.stringify([
        { bookHash: '../x', mapId: 'm' },
        { bookHash: BOOK },
        { bookHash: BOOK, mapId: 'ok' },
        { bookHash: BOOK, mapId: 'bad-flag', tombstone: 'yes' },
        { bookHash: BOOK, mapId: 'pending', tombstone: true },
      ]),
    );
    expect(await listTrashedMaps(fs)).toEqual([
      { bookHash: BOOK, mapId: 'ok', tombstone: false },
      { bookHash: BOOK, mapId: 'pending', tombstone: true },
    ]);
  });

  it('keeps a map whose tombstone is pending in the ledger after its content is swept', async () => {
    const mapId = await trashedMap();
    await recordTrashedMap(fs, BOOK, mapId, true);
    expect(hasPendingTombstone(mapId)).toBe(true);
    await sweepTrashedMaps(fs, await listTrashedMaps(fs));
    expect(await inTrash(mapId)).toBe(false);
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId, tombstone: true }]);
    __resetMindmapTrashForTests();
    await listTrashedMaps(fs);
    expect(hasPendingTombstone(mapId)).toBe(true);
  });

  it('drops a map from the ledger at the sweep after its tombstone is confirmed', async () => {
    const mapId = await trashedMap();
    await recordTrashedMap(fs, BOOK, mapId, true);
    const snapshot = await listTrashedMaps(fs);
    await confirmTombstones(fs, [mapId]);
    expect(hasPendingTombstone(mapId)).toBe(false);
    await sweepTrashedMaps(fs, snapshot);
    expect(await listTrashedMaps(fs)).toEqual([]);
  });

  it('confirms a pending tombstone when the server reports the map deleted', async () => {
    const mapId = await trashedMap();
    await recordTrashedMap(fs, BOOK, mapId, true);
    useMindmapStore.getState().softDeleteByContentId(mapId);
    await listTrashedMaps(fs);
    expect(hasPendingTombstone(mapId)).toBe(false);
  });

  it('does not clear a pending tombstone when the same map is trashed again without one', async () => {
    await recordTrashedMap(fs, BOOK, 'm1', true);
    await recordTrashedMap(fs, BOOK, 'm1', false);
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId: 'm1', tombstone: true }]);
  });

  it('sweeps a pending map whose content is already gone without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const removeDir = vi.spyOn(fs, 'removeDir').mockRejectedValue(new Error('ENOENT'));
    await recordTrashedMap(fs, BOOK, 'm1', true);
    await sweepTrashedMaps(fs, await listTrashedMaps(fs));
    await sweepTrashedMaps(fs, await listTrashedMaps(fs));
    expect(removeDir).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId: 'm1', tombstone: true }]);
    warn.mockRestore();
    removeDir.mockRestore();
  });

  it('warns when trash content that still exists cannot be removed', async () => {
    await trashedMap();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exists = vi.spyOn(fs, 'exists').mockResolvedValue(true);
    const removeDir = vi.spyOn(fs, 'removeDir').mockRejectedValue(new Error('locked'));
    await sweepTrashedMaps(fs, await listTrashedMaps(fs));
    expect(warn).toHaveBeenCalledWith('mindmap: could not empty the trash', expect.anything());
    warn.mockRestore();
    exists.mockRestore();
    removeDir.mockRestore();
  });
});
