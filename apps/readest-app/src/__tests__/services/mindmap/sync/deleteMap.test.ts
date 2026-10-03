import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/sync/replicaPublish', () => ({
  publishReplicaDelete: vi.fn(async () => {}),
}));
vi.mock('@/services/transferManager', () => ({
  transferManager: { cancelTransfer: vi.fn() },
}));

import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { mapFilePath } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import {
  __resetMindmapTrashForTests,
  listTrashedMaps,
} from '@/services/mindmap/persist/mindmapTrash';
import { __resetMapSessionsForTests } from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { deleteMindmap, deleteMindmapLocally } from '@/services/mindmap/sync/deleteMap';
import { publishReplicaDelete } from '@/services/sync/replicaPublish';
import { transferManager } from '@/services/transferManager';
import { useTransferStore } from '@/store/transferStore';

const BOOK = 'book1';
let fs: MemoryFileSystem;

beforeEach(async () => {
  fs = new MemoryFileSystem();
  await useMindmapStore.getState().hydrate(fs);
});

afterEach(() => {
  vi.clearAllMocks();
  useTransferStore.setState({ transfers: {} });
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
});

describe('deleteMindmap', () => {
  it('moves the map to the trash and tombstones its replica row', async () => {
    const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
    const { mapId } = await useMindmapStore
      .getState()
      .createMap(BOOK, { ...DEFAULT_MAP_META, title: 'Gone' }, clock);
    await deleteMindmap(mapId, BOOK);
    expect(await fs.exists(mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    expect(useMindmapStore.getState().getEntry(mapId)).toBeUndefined();
    expect(publishReplicaDelete).toHaveBeenCalledWith('mindmap', mapId);
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId, tombstone: true }]);
  });

  it('publishes no tombstone when the local delete fails', async () => {
    await expect(deleteMindmap('../escape', BOOK)).rejects.toThrow();
    expect(publishReplicaDelete).not.toHaveBeenCalled();
  });

  it('deletes a map from this device only, leaving its replica row alone', async () => {
    const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
    const { mapId } = await useMindmapStore
      .getState()
      .createMap(BOOK, { ...DEFAULT_MAP_META, title: 'Local' }, clock);
    await deleteMindmapLocally(mapId, BOOK);
    expect(await fs.exists(mapFilePath(BOOK, mapId), 'Books')).toBe(false);
    expect(useMindmapStore.getState().getEntry(mapId)).toBeUndefined();
    expect(publishReplicaDelete).not.toHaveBeenCalled();
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: BOOK, mapId, tombstone: false }]);
  });

  it('cancels the waiting upload and download of the deleted map only', async () => {
    const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
    const { mapId } = await useMindmapStore
      .getState()
      .createMap(BOOK, { ...DEFAULT_MAP_META, title: 'Busy' }, clock);
    const transfers = useTransferStore.getState();
    const upload = transfers.addReplicaTransfer('mindmap', mapId, 'Busy', 'upload');
    const download = transfers.addReplicaTransfer('mindmap', mapId, 'Busy', 'download');
    transfers.addReplicaTransfer('mindmap', 'other', 'Other', 'download');
    transfers.addReplicaTransfer('font', mapId, 'Font', 'download');
    transfers.addReplicaTransfer('mindmap', mapId, 'Busy', 'delete');

    await deleteMindmap(mapId, BOOK);

    const cancelled = vi.mocked(transferManager.cancelTransfer).mock.calls.map(([id]) => id);
    expect(cancelled.sort()).toEqual([upload, download].sort());
  });

  it('cancels the transfers of a map deleted from this device only', async () => {
    const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
    const { mapId } = await useMindmapStore
      .getState()
      .createMap(BOOK, { ...DEFAULT_MAP_META, title: 'Busy' }, clock);
    const download = useTransferStore
      .getState()
      .addReplicaTransfer('mindmap', mapId, 'Busy', 'download');

    await deleteMindmapLocally(mapId, BOOK);

    expect(transferManager.cancelTransfer).toHaveBeenCalledWith(download);
  });

  it('cancels nothing when the local delete fails', async () => {
    useTransferStore.getState().addReplicaTransfer('mindmap', '../escape', 'Bad', 'download');
    await expect(deleteMindmap('../escape', BOOK)).rejects.toThrow();
    expect(transferManager.cancelTransfer).not.toHaveBeenCalled();
  });
});
