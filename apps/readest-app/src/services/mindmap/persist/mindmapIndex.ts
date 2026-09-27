import { hlcParse } from '@/libs/crdt';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { highestHlc } from '@/services/mindmap/file/mergeMapFiles';
import {
  MINDMAP_BASE_DIR,
  isSafeMindmapId,
  mindmapsDir,
  readMapFile,
} from '@/services/mindmap/persist/mapFile';
import type { MapFile, MapSource, MapStyle } from '@/services/mindmap/schema/types';
import { decodeMeta } from '@/services/mindmap/schema/validate';

export interface MindmapIndexEntry {
  mapId: string;
  title: string;
  style: MapStyle;
  source: MapSource;
  updatedAt: number;
}

const MAP_FILE_PATTERN = /^([^/.][^/]*)\/\1\.json$/;
const STYLES: readonly string[] = ['sticker', 'paper', 'ink'];
const SOURCES: readonly string[] = ['generated', 'blank'];
const queues = new Map<string, Promise<unknown>>();

const indexPath = (bookHash: string): string => `${mindmapsDir(bookHash)}/index.json`;

export const buildIndexEntry = (file: MapFile): MindmapIndexEntry => {
  const meta = decodeMeta(file.meta);
  const newest = highestHlc(file);
  return {
    mapId: file.mapId,
    title: meta.title,
    style: meta.style,
    source: meta.source,
    updatedAt: newest ? hlcParse(newest).physicalMs : 0,
  };
};

const isIndexEntry = (value: unknown): value is MindmapIndexEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const style = entry['style'];
  const source = entry['source'];
  return (
    typeof entry['mapId'] === 'string' &&
    typeof entry['title'] === 'string' &&
    typeof style === 'string' &&
    STYLES.includes(style) &&
    typeof source === 'string' &&
    SOURCES.includes(source) &&
    typeof entry['updatedAt'] === 'number'
  );
};

const byRecency = (a: MindmapIndexEntry, b: MindmapIndexEntry): number => {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  if (a.mapId === b.mapId) return 0;
  return a.mapId < b.mapId ? -1 : 1;
};

const serialized = <T>(bookHash: string, task: () => Promise<T>): Promise<T> => {
  const run = (queues.get(bookHash) ?? Promise.resolve()).then(task);
  queues.set(
    bookHash,
    run.catch(() => undefined),
  );
  return run;
};

const readIndex = async (fs: MindmapFs, bookHash: string): Promise<MindmapIndexEntry[] | null> => {
  try {
    if (!(await fs.exists(indexPath(bookHash), MINDMAP_BASE_DIR))) return null;
    const text = await fs.readFile(indexPath(bookHash), MINDMAP_BASE_DIR, 'text');
    const parsed: unknown = typeof text === 'string' ? JSON.parse(text) : null;
    return Array.isArray(parsed) && parsed.every(isIndexEntry) ? parsed : null;
  } catch {
    return null;
  }
};

const writeIndex = async (
  fs: MindmapFs,
  bookHash: string,
  entries: MindmapIndexEntry[],
): Promise<MindmapIndexEntry[]> => {
  const sorted = [...entries].sort(byRecency);
  await fs.createDir(mindmapsDir(bookHash), MINDMAP_BASE_DIR, true);
  await fs.writeFile(indexPath(bookHash), MINDMAP_BASE_DIR, JSON.stringify(sorted));
  return sorted;
};

const listMapIds = async (fs: MindmapFs, bookHash: string): Promise<string[]> => {
  try {
    const items = await fs.readDir(mindmapsDir(bookHash), MINDMAP_BASE_DIR);
    return items.flatMap((item) => {
      const match = MAP_FILE_PATTERN.exec(item.path.replace(/\\/g, '/'));
      return match && isSafeMindmapId(match[1]!) ? [match[1]!] : [];
    });
  } catch {
    return [];
  }
};

const scan = async (fs: MindmapFs, bookHash: string): Promise<MindmapIndexEntry[]> => {
  const entries: MindmapIndexEntry[] = [];
  for (const mapId of await listMapIds(fs, bookHash)) {
    const read = await readMapFile(fs, bookHash, mapId);
    if (read) entries.push(buildIndexEntry(read.file));
  }
  return writeIndex(fs, bookHash, entries);
};

const currentIndex = async (fs: MindmapFs, bookHash: string): Promise<MindmapIndexEntry[]> =>
  (await readIndex(fs, bookHash)) ?? (await scan(fs, bookHash));

export const loadMindmapIndex = (fs: MindmapFs, bookHash: string): Promise<MindmapIndexEntry[]> =>
  serialized(bookHash, () => currentIndex(fs, bookHash));

export const rebuildMindmapIndex = (
  fs: MindmapFs,
  bookHash: string,
): Promise<MindmapIndexEntry[]> => serialized(bookHash, () => scan(fs, bookHash));

export const updateMindmapIndex = (
  fs: MindmapFs,
  bookHash: string,
  file: MapFile,
): Promise<MindmapIndexEntry[]> =>
  serialized(bookHash, async () => {
    const entries = await currentIndex(fs, bookHash);
    const others = entries.filter((entry) => entry.mapId !== file.mapId);
    return writeIndex(fs, bookHash, [...others, buildIndexEntry(file)]);
  });

export const removeFromMindmapIndex = (
  fs: MindmapFs,
  bookHash: string,
  mapId: string,
): Promise<MindmapIndexEntry[]> =>
  serialized(bookHash, async () => {
    const entries = await currentIndex(fs, bookHash);
    return writeIndex(
      fs,
      bookHash,
      entries.filter((entry) => entry.mapId !== mapId),
    );
  });
