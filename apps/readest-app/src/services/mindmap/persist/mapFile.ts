import type { BaseDir } from '@/types/system';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { canonicalStringify } from '@/services/mindmap/file/canonicalStringify';
import { type HlcClock, observeFileClock } from '@/services/mindmap/file/clock';
import { parseMapFile } from '@/services/mindmap/file/parseMapFile';
import {
  DEFAULT_MIGRATION_CONFIG,
  type MigrationConfig,
  migrateMapFile,
} from '@/services/mindmap/schema/migrations';
import { CURRENT_SCHEMA_VERSION, type MapFile } from '@/services/mindmap/schema/types';

export const MINDMAP_BASE_DIR: BaseDir = 'Books';

export type ReadOnlyReason = 'newer-schema' | 'migration-failed';

const SAFE_ID = /^[0-9A-Za-z_-]{1,64}$/;

export const isSafeMindmapId = (id: string): boolean => SAFE_ID.test(id);

const assertSafeId = (id: string): void => {
  if (!isSafeMindmapId(id)) throw new Error('mindmap: unsafe id');
};

export const mindmapsDir = (bookHash: string): string => {
  assertSafeId(bookHash);
  return `${bookHash}/mindmaps`;
};

export const mapFileDir = (bookHash: string, mapId: string): string => {
  assertSafeId(mapId);
  return `${mindmapsDir(bookHash)}/${mapId}`;
};

export const mapFilePath = (bookHash: string, mapId: string): string =>
  `${mapFileDir(bookHash, mapId)}/${mapId}.json`;

export const mapTrashDir = (bookHash: string, mapId: string): string => {
  assertSafeId(mapId);
  return `${mindmapsDir(bookHash)}/.trash/${mapId}`;
};

export interface ReadMapFileResult {
  file: MapFile;
  restoredFromBackup: boolean;
}

export type LoadMapFileResult =
  | { status: 'ok'; file: MapFile; restoredFromBackup: boolean; migrated: boolean }
  | {
      status: 'read-only';
      reason: ReadOnlyReason;
      file: MapFile;
      restoredFromBackup: boolean;
      error: unknown;
    }
  | { status: 'unreadable' };

const readText = async (fs: MindmapFs, path: string): Promise<string | null> => {
  try {
    if (!(await fs.exists(path, MINDMAP_BASE_DIR))) return null;
    const content = await fs.readFile(path, MINDMAP_BASE_DIR, 'text');
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
};

export const readMapFile = async (
  fs: MindmapFs,
  bookHash: string,
  mapId: string,
  restore = false,
): Promise<ReadMapFileResult | null> => {
  const path = mapFilePath(bookHash, mapId);
  const main = await readText(fs, path);
  const mainFile = main === null ? null : parseMapFile(main, mapId);
  if (mainFile) return { file: mainFile, restoredFromBackup: false };
  const backup = await readText(fs, `${path}.bak`);
  if (backup === null) return null;
  const backupFile = parseMapFile(backup, mapId);
  if (!backupFile) return null;
  if (restore) await fs.writeFile(path, MINDMAP_BASE_DIR, backup);
  return { file: backupFile, restoredFromBackup: true };
};

export const loadMapFile = async (
  fs: MindmapFs,
  bookHash: string,
  mapId: string,
  clock: HlcClock,
  migration: MigrationConfig = DEFAULT_MIGRATION_CONFIG,
): Promise<LoadMapFileResult> => {
  const read = await readMapFile(fs, bookHash, mapId, true);
  if (!read) return { status: 'unreadable' };
  const { file, restoredFromBackup } = read;
  observeFileClock(clock, file);
  if (file.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { status: 'read-only', reason: 'newer-schema', file, restoredFromBackup, error: null };
  }
  try {
    const migrated = migrateMapFile(file, clock, migration);
    return { status: 'ok', file: migrated, restoredFromBackup, migrated: migrated !== file };
  } catch (error) {
    return { status: 'read-only', reason: 'migration-failed', file, restoredFromBackup, error };
  }
};

export const saveMapFile = async (
  fs: MindmapFs,
  bookHash: string,
  file: MapFile,
): Promise<string> => {
  const path = mapFilePath(bookHash, file.mapId);
  const text = canonicalStringify(file);
  await fs.createDir(mapFileDir(bookHash, file.mapId), MINDMAP_BASE_DIR, true);
  if (await fs.exists(path, MINDMAP_BASE_DIR)) {
    await fs.copyFile(path, MINDMAP_BASE_DIR, `${path}.bak`, MINDMAP_BASE_DIR);
  }
  await fs.writeFile(path, MINDMAP_BASE_DIR, text);
  return text;
};

const listFiles = async (fs: MindmapFs, dir: string): Promise<string[]> => {
  try {
    const items = await fs.readDir(dir, MINDMAP_BASE_DIR);
    return items.map((item) => item.path.replace(/\\/g, '/'));
  } catch {
    return [];
  }
};

export const moveMapDirToTrash = async (
  fs: MindmapFs,
  bookHash: string,
  mapId: string,
): Promise<void> => {
  const source = mapFileDir(bookHash, mapId);
  const target = mapTrashDir(bookHash, mapId);
  const files = await listFiles(fs, source);
  if (files.length === 0) return;
  for (const relative of files) {
    const destination = `${target}/${relative}`;
    await fs.createDir(destination.slice(0, destination.lastIndexOf('/')), MINDMAP_BASE_DIR, true);
    await fs.copyFile(`${source}/${relative}`, MINDMAP_BASE_DIR, destination, MINDMAP_BASE_DIR);
  }
  await fs.removeDir(source, MINDMAP_BASE_DIR, true);
};
