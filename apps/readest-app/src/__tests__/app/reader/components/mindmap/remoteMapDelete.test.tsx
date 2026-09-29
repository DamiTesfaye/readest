import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { memoryAppService } from '@/__tests__/app/reader/components/mindmap/memoryAppService';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { __resetMindmapTrashForTests } from '@/services/mindmap/persist/mindmapTrash';
import { __resetMapSessionsForTests } from '@/services/mindmap/persist/session';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { deleteMindmap } from '@/services/mindmap/sync/deleteMap';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';
import { useRemoteMapDelete } from '@/app/reader/components/mindmap/useBookMaps';
import { useMindmapSession } from '@/app/reader/components/mindmap/useMindmapSession';

const h = vi.hoisted(() => ({ appService: null as AppService | null }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.appService }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: <T,>(select: (s: { settings: { replicaDeviceId?: string } }) => T) =>
    select({ settings: { replicaDeviceId: 'device-1' } }),
}));
vi.mock('@/services/mindmap/sync/lifecycle', () => ({
  watchMindmapSession: () => () => {},
  pushMindmap: async () => {},
  refetchUnreadableMindmap: () => {},
}));
vi.mock('@/services/sync/replicaPublish', () => ({ publishReplicaDelete: async () => true }));

const BOOK = 'bookhash';
const BOOK_KEY = 'bookhash-key';
const SAVE_ERROR = 'Could not save the mind map';
const DELETED_ELSEWHERE = 'This map was deleted on another device';

let fs: MemoryFileSystem;
let toasts: { type: string; message: string }[];

const onToast = (event: CustomEvent): void => {
  toasts.push(event.detail as { type: string; message: string });
};

const createMap = async (title: string): Promise<string> => {
  const clock = createMindmapClock(new HlcGenerator('device-0'), 'device-0');
  const file = await useMindmapStore
    .getState()
    .createMap(BOOK, { ...DEFAULT_MAP_META, title }, clock);
  return file.mapId;
};

const renderView = async (mapId: string) => {
  useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
  const rendered = renderHook(() => {
    const shown = useMindmapViewStore((state) => state.mapId);
    useRemoteMapDelete(BOOK_KEY, BOOK, shown);
    return { shown, session: useMindmapSession(shown ? BOOK : null, shown) };
  });
  await waitFor(() => expect(rendered.result.current.session.status).toBe('open'));
  return rendered;
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(async () => {
  fs = new MemoryFileSystem();
  h.appService = memoryAppService(fs);
  toasts = [];
  eventDispatcher.on('toast', onToast);
  await useMindmapStore.getState().hydrate(fs);
});

afterEach(() => {
  cleanup();
  eventDispatcher.off('toast', onToast);
  useMindmapViewStore.getState().close();
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
});

describe('a map deleted while it is open', () => {
  it('closes the view with a notice when another device deleted the only map', async () => {
    const mapId = await createMap('Open');
    const { result } = await renderView(mapId);
    const state = result.current.session;
    if (state.status !== 'open') throw new Error('expected open');

    useMindmapStore.getState().softDeleteByContentId(mapId);

    await waitFor(() => expect(useMindmapViewStore.getState().mapId).toBeNull());
    state.session.store.put([createNodeRecord({ id: 'n1', index: 'a1', label: 'Lost' })]);
    await settle();
    expect(toasts).toEqual([{ type: 'info', message: DELETED_ELSEWHERE }]);
    expect(await fs.exists(`${BOOK}/mindmaps/${mapId}`, 'Books')).toBe(false);
  });

  it('switches to another map of the book when another device deleted the open one', async () => {
    const other = await createMap('Other');
    const mapId = await createMap('Open');
    const { result } = await renderView(mapId);

    useMindmapStore.getState().softDeleteByContentId(mapId);

    await waitFor(() => expect(result.current.shown).toBe(other));
    await waitFor(() => expect(result.current.session.status).toBe('open'));
    await settle();
    expect(toasts.map((toast) => toast.message)).toEqual([DELETED_ELSEWHERE]);
  });

  it('shows no notice and no save error when the map is deleted here', async () => {
    const mapId = await createMap('Open');
    const { unmount } = await renderView(mapId);

    await deleteMindmap(mapId, BOOK);
    unmount();
    await settle();
    useMindmapStore.getState().softDeleteByContentId(mapId);
    await settle();

    expect(toasts.map((toast) => toast.message)).not.toContain(SAVE_ERROR);
    expect(toasts.map((toast) => toast.message)).not.toContain(DELETED_ELSEWHERE);
  });

  it('ignores a remote delete of a map that is not open', async () => {
    const other = await createMap('Other');
    const mapId = await createMap('Open');
    const { result } = await renderView(mapId);

    useMindmapStore.getState().softDeleteByContentId(other);
    await waitFor(() => expect(useMindmapStore.getState().getEntry(other)).toBeUndefined());
    await settle();

    expect(result.current.shown).toBe(mapId);
    expect(result.current.session.status).toBe('open');
    expect(toasts).toEqual([]);
  });
});
