import { describe, expect, it } from 'vitest';
import type { FieldEnvelope, Hlc } from '@/types/replica';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { mapFilePath } from '@/services/mindmap/persist/mapFile';
import { saveMap, trashMap } from '@/services/mindmap/persist/maps';
import { loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import type { MapFile } from '@/services/mindmap/schema/types';

const BOOK = 'book1';

const hlc = (ms: number): Hlc => `${ms.toString(16).padStart(13, '0')}-00000000-d1` as Hlc;

const envelope = (v: unknown, ms: number): FieldEnvelope => ({ v, t: hlc(ms), s: 'd1' });

const mapFile = (mapId: string, title: string, ms: number): MapFile => ({
  schemaVersion: 1,
  mapId,
  meta: {
    title: envelope(title, ms),
    style: envelope('paper', 1),
    source: envelope('generated', 1),
  },
  records: { n1: { x: envelope(1, ms + 1) } },
});

describe('saveMap', () => {
  it('writes the file and keeps the index current, newest first', async () => {
    const fs = new MemoryFileSystem();
    await saveMap(fs, BOOK, mapFile('m1', 'Old', 5));
    await saveMap(fs, BOOK, mapFile('m2', 'New', 9));
    await saveMap(fs, BOOK, mapFile('m1', 'Renamed', 3));
    expect(await loadMindmapIndex(fs, BOOK)).toEqual([
      { mapId: 'm2', title: 'New', style: 'paper', source: 'generated', updatedAt: 10 },
      { mapId: 'm1', title: 'Renamed', style: 'paper', source: 'generated', updatedAt: 4 },
    ]);
  });

  it('keeps every entry when two maps are saved at once over an existing index', async () => {
    const fs = new MemoryFileSystem();
    await saveMap(fs, BOOK, mapFile('m0', 'Zero', 4));
    await Promise.all([
      saveMap(fs, BOOK, mapFile('m1', 'One', 5)),
      saveMap(fs, BOOK, mapFile('m2', 'Two', 6)),
    ]);
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.mapId).sort()).toEqual([
      'm0',
      'm1',
      'm2',
    ]);
  });
});

describe('trashMap', () => {
  it('moves the map directory and drops its index entry', async () => {
    const fs = new MemoryFileSystem();
    await saveMap(fs, BOOK, mapFile('m1', 'One', 5));
    await saveMap(fs, BOOK, mapFile('m2', 'Two', 6));
    await trashMap(fs, BOOK, 'm1');
    expect(await fs.exists(mapFilePath(BOOK, 'm1'), 'Books')).toBe(false);
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.mapId)).toEqual(['m2']);
  });

  it('throws and deletes nothing for an unsafe mapId', async () => {
    const fs = new MemoryFileSystem();
    await saveMap(fs, BOOK, mapFile('m1', 'One', 5));
    await expect(trashMap(fs, BOOK, '../..')).rejects.toThrow('mindmap: unsafe id');
    expect(await fs.exists(mapFilePath(BOOK, 'm1'), 'Books')).toBe(true);
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.mapId)).toEqual(['m1']);
  });
});
