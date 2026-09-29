import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import { MINDMAP_BASE_DIR, isSafeMindmapId, mapTrashDir } from '@/services/mindmap/persist/mapFile';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';

export const MINDMAP_TRASH_FILENAME = 'mindmap-trash.json';

export interface TrashedMap {
  bookHash: string;
  mapId: string;
}

let ledger: TrashedMap[] | null = null;
let queue: Promise<unknown> = Promise.resolve();

const isTrashedMap = (value: unknown): value is TrashedMap => {
  if (typeof value !== 'object' || value === null) return false;
  const { bookHash, mapId } = value as Record<string, unknown>;
  return (
    typeof bookHash === 'string' &&
    typeof mapId === 'string' &&
    isSafeMindmapId(bookHash) &&
    isSafeMindmapId(mapId)
  );
};

const sameMap = (a: TrashedMap, b: TrashedMap): boolean =>
  a.bookHash === b.bookHash && a.mapId === b.mapId;

const serialized = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
};

const load = async (fs: MindmapFs): Promise<TrashedMap[]> => {
  if (!ledger) {
    const stored = await safeLoadJSON<unknown>(fs, MINDMAP_TRASH_FILENAME, 'Data', []);
    ledger = (Array.isArray(stored) ? stored : []).filter(isTrashedMap);
  }
  return ledger;
};

const save = async (fs: MindmapFs, next: TrashedMap[]): Promise<void> => {
  ledger = next;
  await safeSaveJSON(fs, MINDMAP_TRASH_FILENAME, 'Data', next);
};

export const recordTrashedMap = (fs: MindmapFs, bookHash: string, mapId: string): Promise<void> =>
  serialized(async () => {
    const current = await load(fs);
    const trashed = { bookHash, mapId };
    if (!current.some((map) => sameMap(map, trashed))) await save(fs, [...current, trashed]);
  });

export const listTrashedMaps = (fs: MindmapFs): Promise<TrashedMap[]> =>
  serialized(async () => [...(await load(fs))]);

export const sweepTrashedMaps = (fs: MindmapFs, maps: TrashedMap[]): Promise<void> =>
  serialized(async () => {
    const current = await load(fs);
    const doomed = current.filter((map) => maps.some((swept) => sameMap(map, swept)));
    for (const map of doomed) {
      try {
        await fs.removeDir(mapTrashDir(map.bookHash, map.mapId), MINDMAP_BASE_DIR, true);
      } catch (error) {
        console.warn('mindmap: could not empty the trash', { ...map, error });
      }
    }
    if (doomed.length > 0)
      await save(
        fs,
        current.filter((map) => !doomed.includes(map)),
      );
  });

export const __resetMindmapTrashForTests = (): void => {
  ledger = null;
  queue = Promise.resolve();
};
