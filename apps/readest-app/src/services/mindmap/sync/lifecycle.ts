import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import { type MapSession, listOpenMapSessions } from '@/services/mindmap/persist/session';
import { decodeMeta } from '@/services/mindmap/schema/validate';
import { getMindmapSync } from '@/services/mindmap/sync/runtime';

let installed = false;

const report = (error: unknown): void => {
  console.warn('mindmap: sync step failed', error);
};

export const watchMindmapSession = (session: MapSession, mapId: string): (() => void) =>
  session.listenSaved((file) => {
    const store = useMindmapStore.getState();
    const entry = store.getEntry(mapId);
    const title = decodeMeta(file.meta).title;
    if (entry && entry.name !== title) store.upsertEntry({ ...entry, name: title });
    getMindmapSync()
      .then(({ pusher }) => pusher.schedule(mapId))
      .catch(report);
  });

export const pushMindmap = async (mapId: string): Promise<void> => {
  try {
    await (await getMindmapSync()).pusher.pushNow(mapId);
  } catch (error) {
    report(error);
  }
};

export const refetchUnreadableMindmap = (mapId: string): void => {
  const store = useMindmapStore.getState();
  if (!store.getEntry(mapId)?.syncedMd5) return;
  console.warn('mindmap: this map cannot be read; the next pull fetches its synced version', {
    mapId,
  });
  store.setSyncedMd5(mapId, null);
};

export const flushMindmapSync = async (): Promise<void> => {
  try {
    await Promise.all(listOpenMapSessions().map((session) => session.flush()));
    await (await getMindmapSync()).pusher.flushAll();
  } catch (error) {
    report(error);
  }
};

const flushWhenHidden = (): void => {
  if (document.visibilityState === 'hidden') void flushMindmapSync();
};

export const installMindmapLifecycle = (): void => {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('visibilitychange', flushWhenHidden);
};

export const __resetMindmapLifecycleForTests = (): void => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', flushWhenHidden);
  }
  installed = false;
};
