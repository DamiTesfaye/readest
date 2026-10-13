import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryAppService } from '@/__tests__/app/reader/components/mindmap/memoryAppService';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { DEFAULT_DOCK_WIDTH, useMindmapViewStore } from '@/store/mindmapViewStore';
import type { AppService } from '@/types/system';

const h = vi.hoisted(() => ({
  appService: null as AppService | null,
  hash: 'bookhash' as string | undefined,
}));
vi.mock('@/services/environment', () => ({
  default: {
    getAppService: async () => {
      if (!h.appService) throw new Error('no app service');
      return h.appService;
    },
  },
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({ getBookData: () => (h.hash ? { book: { hash: h.hash } } : null) }),
  },
}));

let fs: MemoryFileSystem;

const createMap = async (title: string): Promise<string> => {
  await useMindmapStore.getState().hydrate(fs);
  const clock = createMindmapClock(new HlcGenerator('device-0'), 'device-0');
  return (
    await useMindmapStore.getState().createMap('bookhash', { ...DEFAULT_MAP_META, title }, clock)
  ).mapId;
};

beforeEach(() => {
  fs = new MemoryFileSystem();
  h.appService = memoryAppService(fs);
  h.hash = 'bookhash';
  __resetMindmapStoreForTests();
});

afterEach(() => {
  useMindmapViewStore.getState().close();
  useMindmapViewStore.setState({
    layout: 'fullscreen',
    dockWidth: DEFAULT_DOCK_WIDTH,
    wheelZooms: false,
    lastOpened: {},
  });
  localStorage.clear();
  __resetMindmapStoreForTests();
});

describe('mindmapViewStore', () => {
  it('opens a map for a book and closes the sheet', () => {
    const view = useMindmapViewStore.getState();
    view.showSheet('book-1');
    expect(useMindmapViewStore.getState()).toMatchObject({
      bookKey: 'book-1',
      sheetOpen: true,
      mapId: null,
    });
    view.showMap('book-1', 'map-1');
    expect(useMindmapViewStore.getState()).toMatchObject({
      bookKey: 'book-1',
      mapId: 'map-1',
      sheetOpen: false,
    });
  });

  it('keeps the open map when the sheet is dismissed and forgets the book otherwise', () => {
    const view = useMindmapViewStore.getState();
    view.showMap('book-1', 'map-1');
    view.showSheet('book-1');
    view.closeSheet();
    expect(useMindmapViewStore.getState()).toMatchObject({ bookKey: 'book-1', mapId: 'map-1' });
    view.close();
    view.showSheet('book-2');
    view.closeSheet();
    expect(useMindmapViewStore.getState().bookKey).toBeNull();
  });

  it('clears reveal data when another map opens', () => {
    const view = useMindmapViewStore.getState();
    view.setReveal({ chapter: 2, revealed: 1, total: 4, newCount: 0 });
    view.showMap('book-1', 'map-2');
    expect(useMindmapViewStore.getState().reveal).toBeNull();
  });

  it('clears a reveal announcement when another map opens or the view closes', () => {
    const view = useMindmapViewStore.getState();
    view.showMap('book-1', 'map-1');
    view.announce('3 new nodes revealed');
    view.showMap('book-1', 'map-2');
    expect(useMindmapViewStore.getState().announcement).toBe('');
    view.announce('2 new nodes revealed');
    view.close();
    expect(useMindmapViewStore.getState().announcement).toBe('');
  });

  it('numbers each announcement so a repeat is announced again', () => {
    const view = useMindmapViewStore.getState();
    view.announce('1 new node revealed');
    const first = useMindmapViewStore.getState().announcementId;
    view.announce('1 new node revealed');
    expect(useMindmapViewStore.getState().announcementId).toBe(first + 1);
  });

  it('persists only the layout preferences', () => {
    const view = useMindmapViewStore.getState();
    view.setLayout('docked');
    view.setDockWidth('55%');
    view.setWheelZooms(true);
    view.showMap('book-1', 'map-1');
    view.announce('hello');
    const stored = JSON.parse(localStorage.getItem('mindmap-view')!).state;
    expect(stored).toEqual({
      layout: 'docked',
      dockWidth: '55%',
      wheelZooms: true,
      lastOpened: { bookhash: 'map-1' },
    });
  });
});

describe('openEntry', () => {
  it('shows the new-map sheet when the book has no map yet', async () => {
    await useMindmapViewStore.getState().openEntry('book-1');
    expect(useMindmapViewStore.getState()).toMatchObject({
      bookKey: 'book-1',
      mapId: null,
      sheetOpen: true,
    });
  });

  it('opens the most recently edited map of the book', async () => {
    await createMap('Older');
    const newest = await createMap('Newest');
    await useMindmapViewStore.getState().openEntry('book-1');
    expect(useMindmapViewStore.getState()).toMatchObject({
      bookKey: 'book-1',
      mapId: newest,
      sheetOpen: false,
    });
  });

  it('reopens the map used last, not the one edited last', async () => {
    const older = await createMap('Older');
    await createMap('Newest');
    useMindmapViewStore.getState().showMap('book-1', older);
    useMindmapViewStore.getState().close();
    await useMindmapViewStore.getState().openEntry('book-1');
    expect(useMindmapViewStore.getState().mapId).toBe(older);
  });

  it('falls back to the newest map when the one used last is gone', async () => {
    const newest = await createMap('Newest');
    useMindmapViewStore.getState().showMap('book-1', 'deleted-map');
    useMindmapViewStore.getState().close();
    await useMindmapViewStore.getState().openEntry('book-1');
    expect(useMindmapViewStore.getState().mapId).toBe(newest);
  });

  it('rejects and leaves the view unchanged for a book without a hash', async () => {
    h.hash = undefined;
    await expect(useMindmapViewStore.getState().openEntry('book-1')).rejects.toThrow();
    expect(useMindmapViewStore.getState()).toMatchObject({ bookKey: null, sheetOpen: false });
  });

  it('rejects and leaves the view closed when the app service fails', async () => {
    h.appService = null;
    await expect(useMindmapViewStore.getState().openEntry('book-1')).rejects.toThrow(
      'no app service',
    );
    expect(useMindmapViewStore.getState()).toMatchObject({ bookKey: null, sheetOpen: false });
  });
});
