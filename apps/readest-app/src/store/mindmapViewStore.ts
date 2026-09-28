import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RevealSummary } from '@/app/reader/components/mindmap/RevealChip';
import environmentConfig from '@/services/environment';
import { resolveMapEntry } from '@/services/mindmap/entry';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import { useBookDataStore } from '@/store/bookDataStore';

export type MindmapLayout = 'fullscreen' | 'docked';

export const DEFAULT_DOCK_WIDTH = '40%';

interface MindmapViewState {
  bookKey: string | null;
  mapId: string | null;
  sheetOpen: boolean;
  layout: MindmapLayout;
  dockWidth: string;
  wheelZooms: boolean;
  reveal: RevealSummary | null;
  announcement: string;
  openEntry(bookKey: string): Promise<void>;
  showMap(bookKey: string, mapId: string): void;
  showSheet(bookKey: string): void;
  closeSheet(): void;
  close(): void;
  setLayout(layout: MindmapLayout): void;
  setDockWidth(width: string): void;
  setWheelZooms(wheelZooms: boolean): void;
  setReveal(reveal: RevealSummary | null): void;
  announce(message: string): void;
}

export const useMindmapViewStore = create<MindmapViewState>()(
  persist(
    (set, get) => ({
      bookKey: null,
      mapId: null,
      sheetOpen: false,
      layout: 'fullscreen',
      dockWidth: DEFAULT_DOCK_WIDTH,
      wheelZooms: false,
      reveal: null,
      announcement: '',
      openEntry: async (bookKey) => {
        const bookHash = useBookDataStore.getState().getBookData(bookKey)?.book?.hash;
        if (!bookHash) throw new Error('mindmap: book has no hash');
        const appService = await environmentConfig.getAppService();
        const target = await resolveMapEntry(mindmapFsFromAppService(appService), bookHash);
        if (target.kind === 'map') get().showMap(bookKey, target.mapId);
        else get().showSheet(bookKey);
      },
      showMap: (bookKey, mapId) => set({ bookKey, mapId, sheetOpen: false, reveal: null }),
      showSheet: (bookKey) => set({ bookKey, sheetOpen: true }),
      closeSheet: () =>
        set(get().mapId ? { sheetOpen: false } : { sheetOpen: false, bookKey: null }),
      close: () => set({ bookKey: null, mapId: null, sheetOpen: false, reveal: null }),
      setLayout: (layout) => set({ layout }),
      setDockWidth: (dockWidth) => set({ dockWidth }),
      setWheelZooms: (wheelZooms) => set({ wheelZooms }),
      setReveal: (reveal) => set({ reveal }),
      announce: (announcement) => set({ announcement }),
    }),
    {
      name: 'mindmap-view',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ layout, dockWidth, wheelZooms }) => ({ layout, dockWidth, wheelZooms }),
    },
  ),
);
