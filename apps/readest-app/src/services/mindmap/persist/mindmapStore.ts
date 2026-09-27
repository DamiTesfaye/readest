import { create } from 'zustand';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import type { ReplicaLocalRecord } from '@/services/sync/replicaPullAndApply';
import { uniqueId } from '@/utils/misc';
import type { HlcClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { mapFileDir } from '@/services/mindmap/persist/mapFile';
import { saveMap, trashMap } from '@/services/mindmap/persist/maps';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import type { MapFile, MapMeta } from '@/services/mindmap/schema/types';

export interface MindmapEntry extends ReplicaLocalRecord {
  mapId: string;
  bookHash: string;
  name: string;
  bundleDir: string;
  syncedMd5: string | null;
}

export interface MindmapStoreState {
  entries: MindmapEntry[];
  hydrated: boolean;
  hydrate(fs: MindmapFs): Promise<void>;
  whenPersisted(): Promise<void>;
  getEntry(mapId: string): MindmapEntry | undefined;
  entriesForBook(bookHash: string): MindmapEntry[];
  upsertEntry(entry: MindmapEntry): void;
  removeEntry(mapId: string): void;
  applyRemoteMap(entry: MindmapEntry): void;
  setSyncedMd5(mapId: string, md5: string): void;
  softDeleteByContentId(mapId: string): void;
  moveToTrash(mapId: string): Promise<void>;
  removeByBookHash(bookHash: string): void;
  createMap(bookHash: string, meta: MapMeta, clock: HlcClock): Promise<MapFile>;
}

export const MINDMAP_STORE_FILENAME = 'mindmap-store.json';

let storeFs: MindmapFs | null = null;
let hydration: Promise<void> | null = null;
let persistQueue: Promise<void> = Promise.resolve();
let removedBeforeHydration = new Set<string>();
let purgedBeforeHydration = new Set<string>();

const reportError = (error: unknown): void => {
  console.error('mindmap store:', error);
};

const isMindmapEntry = (value: unknown): value is MindmapEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const md5 = entry['syncedMd5'];
  return (
    typeof entry['mapId'] === 'string' &&
    typeof entry['bookHash'] === 'string' &&
    typeof entry['name'] === 'string' &&
    typeof entry['bundleDir'] === 'string' &&
    (md5 === null || typeof md5 === 'string')
  );
};

const persist = (entries: MindmapEntry[]): void => {
  const fs = storeFs;
  if (!fs) return;
  persistQueue = persistQueue
    .then(() => safeSaveJSON(fs, MINDMAP_STORE_FILENAME, 'Data', entries))
    .catch(reportError);
};

const requireFs = (): MindmapFs => {
  if (!storeFs) throw new Error('mindmapStore is not hydrated');
  return storeFs;
};

export const useMindmapStore = create<MindmapStoreState>((set, get) => {
  const setEntries = (entries: MindmapEntry[]): void => {
    set({ entries });
    persist(entries);
  };

  const loadStoredEntries = async (fs: MindmapFs): Promise<void> => {
    const stored = await safeLoadJSON<unknown>(fs, MINDMAP_STORE_FILENAME, 'Data', []);
    const current = get().entries;
    const known = new Set(current.map((entry) => entry.mapId));
    const fromDisk = (Array.isArray(stored) ? stored : [])
      .filter(isMindmapEntry)
      .filter(
        (entry) =>
          !known.has(entry.mapId) &&
          !removedBeforeHydration.has(entry.mapId) &&
          !purgedBeforeHydration.has(entry.bookHash),
      );
    storeFs = fs;
    removedBeforeHydration = new Set();
    purgedBeforeHydration = new Set();
    set({ hydrated: true });
    setEntries([...fromDisk, ...current]);
  };

  return {
    entries: [],
    hydrated: false,
    hydrate: (fs) => {
      hydration ??= loadStoredEntries(fs);
      return hydration;
    },
    whenPersisted: () => persistQueue,
    getEntry: (mapId) => get().entries.find((entry) => entry.mapId === mapId),
    entriesForBook: (bookHash) => get().entries.filter((entry) => entry.bookHash === bookHash),
    upsertEntry: (entry) => {
      const entries = get().entries;
      const exists = entries.some((e) => e.mapId === entry.mapId);
      setEntries(
        exists ? entries.map((e) => (e.mapId === entry.mapId ? entry : e)) : [...entries, entry],
      );
    },
    removeEntry: (mapId) => {
      if (!get().hydrated) removedBeforeHydration.add(mapId);
      setEntries(get().entries.filter((entry) => entry.mapId !== mapId));
    },
    applyRemoteMap: (entry) => {
      if (get().getEntry(entry.mapId)) return;
      setEntries([...get().entries, entry]);
    },
    setSyncedMd5: (mapId, md5) => {
      const entries = get().entries;
      if (!entries.some((entry) => entry.mapId === mapId)) return;
      setEntries(
        entries.map((entry) => (entry.mapId === mapId ? { ...entry, syncedMd5: md5 } : entry)),
      );
    },
    softDeleteByContentId: (mapId) => {
      get().moveToTrash(mapId).catch(reportError);
    },
    moveToTrash: async (mapId) => {
      const entry = get().getEntry(mapId);
      if (!entry) return;
      await trashMap(requireFs(), entry.bookHash, mapId);
      get().removeEntry(mapId);
    },
    removeByBookHash: (bookHash) => {
      if (!get().hydrated) purgedBeforeHydration.add(bookHash);
      setEntries(get().entries.filter((entry) => entry.bookHash !== bookHash));
    },
    createMap: async (bookHash, meta, clock) => {
      const fs = requireFs();
      const mapId = uniqueId();
      const file = createMapFile(meta, mapId, clock);
      await saveMap(fs, bookHash, file);
      get().upsertEntry({
        mapId,
        bookHash,
        name: meta.title,
        bundleDir: mapFileDir(bookHash, mapId),
        syncedMd5: null,
      });
      return file;
    },
  };
});

export const findMindmapByContentId = (contentId: string): MindmapEntry | undefined =>
  contentId ? useMindmapStore.getState().getEntry(contentId) : undefined;

export const __resetMindmapStoreForTests = (): void => {
  storeFs = null;
  hydration = null;
  persistQueue = Promise.resolve();
  removedBeforeHydration = new Set();
  purgedBeforeHydration = new Set();
  useMindmapStore.setState({ entries: [], hydrated: false });
};
