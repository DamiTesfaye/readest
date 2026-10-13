import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import { MINDMAP_BASE_DIR, isSafeMindmapId, mapTrashDir } from '@/services/mindmap/persist/mapFile';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';

export const MINDMAP_TRASH_FILENAME = 'mindmap-trash.json';

export interface TrashedMap {
  bookHash: string;
  mapId: string;
  tombstone: boolean;
}

let ledger: TrashedMap[] | null = null;
let queue: Promise<unknown> = Promise.resolve();

const toTrashedMap = (value: unknown): TrashedMap | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { bookHash, mapId, tombstone } = value as Record<string, unknown>;
  const valid =
    typeof bookHash === 'string' &&
    typeof mapId === 'string' &&
    isSafeMindmapId(bookHash) &&
    isSafeMindmapId(mapId) &&
    (tombstone === undefined || typeof tombstone === 'boolean');
  return valid ? { bookHash, mapId, tombstone: tombstone === true } : null;
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
    ledger = (Array.isArray(stored) ? stored : [])
      .map(toTrashedMap)
      .filter((map): map is TrashedMap => map !== null);
  }
  return ledger;
};

const save = async (fs: MindmapFs, next: TrashedMap[]): Promise<void> => {
  ledger = next;
  await safeSaveJSON(fs, MINDMAP_TRASH_FILENAME, 'Data', next);
};

export const recordTrashedMap = (
  fs: MindmapFs,
  bookHash: string,
  mapId: string,
  tombstone = false,
): Promise<void> =>
  serialized(async () => {
    const current = await load(fs);
    const trashed = { bookHash, mapId, tombstone };
    const existing = current.find((map) => sameMap(map, trashed));
    if (!existing) await save(fs, [...current, trashed]);
    else if (tombstone && !existing.tombstone)
      await save(
        fs,
        current.map((map) => (map === existing ? trashed : map)),
      );
  });

export const listTrashedMaps = (fs: MindmapFs): Promise<TrashedMap[]> =>
  serialized(async () => [...(await load(fs))]);

export const hasPendingTombstone = (mapId: string): boolean =>
  ledger?.some((map) => map.mapId === mapId && map.tombstone) ?? false;

export const confirmTombstones = (fs: MindmapFs, mapIds: string[]): Promise<void> =>
  serialized(async () => {
    const current = await load(fs);
    const confirmed = (map: TrashedMap): boolean => map.tombstone && mapIds.includes(map.mapId);
    if (!current.some(confirmed)) return;
    await save(
      fs,
      current.map((map) => (confirmed(map) ? { ...map, tombstone: false } : map)),
    );
  });

const removeTrashContent = async (fs: MindmapFs, map: TrashedMap): Promise<void> => {
  const dir = mapTrashDir(map.bookHash, map.mapId);
  try {
    await fs.removeDir(dir, MINDMAP_BASE_DIR, true);
  } catch (error) {
    const stillThere = await fs.exists(dir, MINDMAP_BASE_DIR).catch(() => true);
    if (stillThere) console.warn('mindmap: could not empty the trash', { ...map, error });
  }
};

export const sweepTrashedMaps = (fs: MindmapFs, maps: TrashedMap[]): Promise<void> =>
  serialized(async () => {
    const current = await load(fs);
    const swept = current.filter((map) => maps.some((snapshot) => sameMap(map, snapshot)));
    for (const map of swept) await removeTrashContent(fs, map);
    const dropped = swept.filter((map) => !map.tombstone);
    if (dropped.length > 0)
      await save(
        fs,
        current.filter((map) => !dropped.includes(map)),
      );
  });

export const __resetMindmapTrashForTests = (): void => {
  ledger = null;
  queue = Promise.resolve();
};
