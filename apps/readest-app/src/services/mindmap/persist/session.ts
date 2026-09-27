import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { type HlcClock, observeFileClock } from '@/services/mindmap/file/clock';
import { fileToRecords } from '@/services/mindmap/file/fileToRecords';
import { mergeMapFiles } from '@/services/mindmap/file/mergeMapFiles';
import { stampDiff, stampMeta } from '@/services/mindmap/file/stampDiff';
import { type ReadOnlyReason, loadMapFile } from '@/services/mindmap/persist/mapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import type { MigrationConfig } from '@/services/mindmap/schema/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  type MapFile,
  type MapMeta,
} from '@/services/mindmap/schema/types';
import { decodeMeta } from '@/services/mindmap/schema/validate';
import {
  type MapStore,
  createMapStore,
  diffRecords,
  fieldsEqual,
} from '@/services/mindmap/store/mapStore';

const SAVE_DEBOUNCE_MS = 300;

export interface MapSessionHooks {
  onError?(error: unknown): void;
}

export type SavedListener = (file: MapFile, text: string) => void;

export type MergeRemoteResult = 'merged' | 'newer-schema' | 'read-only';

export interface OpenMapSessionOptions {
  hooks?: MapSessionHooks;
  migration?: MigrationConfig;
}

export interface MapSession {
  readonly store: MapStore;
  readonly readOnly: boolean;
  readonly readOnlyReason: ReadOnlyReason | null;
  readonly restoredFromBackup: boolean;
  file(): MapFile;
  meta(): MapMeta;
  invalid(): string[];
  listenMeta(listener: (meta: MapMeta) => void): () => void;
  listenSaved(listener: SavedListener): () => void;
  updateMeta(patch: Partial<MapMeta>): void;
  mergeRemote(remote: MapFile): MergeRemoteResult;
  flush(): Promise<boolean>;
  close(): Promise<void>;
  discard(): Promise<void>;
}

export type OpenMapSessionResult =
  | { status: 'open'; session: MapSession }
  | { status: 'unreadable' }
  | { status: 'already-open' };

interface Autosave {
  schedule(): void;
  flush(): Promise<boolean>;
  stop(): void;
}

const openSessions = new Map<string, MapSession>();

export const getOpenMapSession = (mapId: string): MapSession | undefined => openSessions.get(mapId);

export const __resetMapSessionsForTests = (): void => {
  openSessions.clear();
};

const reportSaveError = (error: unknown): void => {
  console.error('mindmap: failed to save map', error);
};

const warnInvalid = (ids: string[]): void => {
  if (ids.length > 0) console.warn('mindmap: skipped invalid records', ids);
};

const createAutosave = (saveNow: () => Promise<boolean>): Autosave => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<boolean> = Promise.resolve(true);
  let stopped = false;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const enqueue = (): Promise<boolean> => {
    queue = queue.catch(() => false).then(saveNow);
    return queue;
  };
  return {
    schedule: () => {
      if (stopped) return;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        void enqueue();
      }, SAVE_DEBOUNCE_MS);
    },
    flush: () => {
      cancel();
      return enqueue();
    },
    stop: () => {
      stopped = true;
      cancel();
    },
  };
};

export const openMapSession = async (
  fs: MindmapFs,
  bookHash: string,
  mapId: string,
  clock: HlcClock,
  options: OpenMapSessionOptions = {},
): Promise<OpenMapSessionResult> => {
  if (openSessions.has(mapId)) return { status: 'already-open' };
  const loaded = await loadMapFile(fs, bookHash, mapId, clock, options.migration);
  if (loaded.status === 'unreadable') return { status: 'unreadable' };
  if (openSessions.has(mapId)) return { status: 'already-open' };
  const readOnlyReason = loaded.status === 'read-only' ? loaded.reason : null;
  const onError = options.hooks?.onError ?? reportSaveError;
  const report = (error: unknown): void => {
    try {
      onError(error);
    } catch {
      reportSaveError(error);
    }
  };
  let file = loaded.file;
  const decoded = fileToRecords(file);
  let invalid = decoded.invalid;
  warnInvalid(invalid);
  const store = createMapStore(decoded.records);
  const metaListeners = new Set<(meta: MapMeta) => void>();
  const savedListeners = new Set<SavedListener>();
  let dirty = false;
  let discarded = false;

  const saveNow = async (): Promise<boolean> => {
    if (discarded) return false;
    if (!dirty) return true;
    dirty = false;
    const snapshot = file;
    let text: string;
    try {
      text = await saveMap(fs, bookHash, snapshot);
    } catch (error) {
      dirty = true;
      report(error);
      return false;
    }
    for (const listener of [...savedListeners]) {
      try {
        listener(snapshot, text);
      } catch (error) {
        report(error);
      }
    }
    return true;
  };
  const autosave = createAutosave(saveNow);

  const commit = (next: MapFile): void => {
    file = next;
    if (readOnlyReason !== null) return;
    dirty = true;
    autosave.schedule();
  };

  const notifyMeta = (before: MapMeta): void => {
    const after = decodeMeta(file.meta);
    if (fieldsEqual(before, after)) return;
    for (const listener of [...metaListeners]) listener(after);
  };

  const unlisten = store.listen((diff, source) => {
    if (source === 'remote' || readOnlyReason !== null) return;
    commit(stampDiff(file, diff, clock, store.get));
  });

  const release = (): void => {
    unlisten();
    metaListeners.clear();
    savedListeners.clear();
    autosave.stop();
    if (openSessions.get(mapId) === session) openSessions.delete(mapId);
  };

  const session: MapSession = {
    store,
    readOnly: readOnlyReason !== null,
    readOnlyReason,
    restoredFromBackup: loaded.restoredFromBackup,
    file: () => file,
    meta: () => decodeMeta(file.meta),
    invalid: () => invalid,
    listenMeta: (listener) => {
      metaListeners.add(listener);
      return () => {
        metaListeners.delete(listener);
      };
    },
    listenSaved: (listener) => {
      savedListeners.add(listener);
      return () => {
        savedListeners.delete(listener);
      };
    },
    updateMeta: (patch) => {
      if (readOnlyReason !== null) return;
      const before = decodeMeta(file.meta);
      commit(stampMeta(file, patch, clock));
      notifyMeta(before);
    },
    mergeRemote: (remote) => {
      if (remote.schemaVersion > CURRENT_SCHEMA_VERSION) {
        report(new Error('mindmap: remote map needs a newer app version'));
        return 'newer-schema';
      }
      if (readOnlyReason !== null) return 'read-only';
      observeFileClock(clock, remote);
      const before = decodeMeta(file.meta);
      const merged = mergeMapFiles(file, remote);
      const next = fileToRecords(merged);
      invalid = next.invalid;
      warnInvalid(invalid);
      commit(merged);
      store.applyRemote(diffRecords(store.all(), next.records));
      notifyMeta(before);
      return 'merged';
    },
    flush: () => autosave.flush(),
    close: async () => {
      autosave.stop();
      await autosave.flush();
      release();
    },
    discard: async () => {
      discarded = true;
      release();
      await autosave.flush();
    },
  };
  openSessions.set(mapId, session);
  if (loaded.status === 'ok' && loaded.migrated) {
    dirty = true;
    void autosave.flush();
  }
  return { status: 'open', session };
};
