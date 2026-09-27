import { describe, expect, it } from 'vitest';
import type { FieldEnvelope, Hlc } from '@/types/replica';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { mapFileDir, mapTrashDir, saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  buildIndexEntry,
  loadMindmapIndex,
  rebuildMindmapIndex,
  removeFromMindmapIndex,
  updateMindmapIndex,
} from '@/services/mindmap/persist/mindmapIndex';
import type { MapFile } from '@/services/mindmap/schema/types';

const BOOK = 'book1';
const INDEX = 'book1/mindmaps/index.json';

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

describe('buildIndexEntry', () => {
  it('reads title, style and source and dates the entry by its newest clock', () => {
    expect(buildIndexEntry(mapFile('m1', 'My Map', 5))).toEqual({
      mapId: 'm1',
      title: 'My Map',
      style: 'paper',
      source: 'generated',
      updatedAt: 6,
    });
  });
});

describe('mindmap index', () => {
  it('rebuilds a missing index from map files and ignores backups, trash and transfers', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, mapFile('m1', 'One', 5));
    await saveMapFile(fs, BOOK, mapFile('m1', 'One', 5));
    await fs.writeFile(`${mapFileDir(BOOK, 'm1')}/incoming/m1.abc.json`, 'Books', '{}');
    await fs.writeFile(`${mapTrashDir(BOOK, 'm9')}/m9.json`, 'Books', '{}');
    const entries = await loadMindmapIndex(fs, BOOK);
    expect(entries.map((entry) => entry.mapId)).toEqual(['m1']);
    expect(JSON.parse(await fs.readFile(INDEX, 'Books'))).toEqual(entries);
  });

  it('lists a map from its backup without rewriting the unreadable main file', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, mapFile('m1', 'One', 5));
    await saveMapFile(fs, BOOK, mapFile('m1', 'One', 5));
    const main = `${mapFileDir(BOOK, 'm1')}/m1.json`;
    await fs.writeFile(main, 'Books', 'written by a newer build');
    const entries = await loadMindmapIndex(fs, BOOK);
    expect(entries.map((entry) => entry.mapId)).toEqual(['m1']);
    expect(await fs.readFile(main, 'Books')).toBe('written by a newer build');
  });

  it('skips a directory name that is not a safe id instead of throwing', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, mapFile('m1', 'One', 5));
    await fs.writeFile(
      `${BOOK}/mindmaps/a.b/a.b.json`,
      'Books',
      JSON.stringify(mapFile('a.b', 'Unsafe', 5)),
    );
    const entries = await loadMindmapIndex(fs, BOOK);
    expect(entries.map((entry) => entry.mapId)).toEqual(['m1']);
  });

  it('rebuilds an index that does not validate', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, mapFile('m1', 'One', 5));
    await fs.writeFile(INDEX, 'Books', '[{"mapId":1}]');
    expect((await loadMindmapIndex(fs, BOOK)).map((entry) => entry.title)).toEqual(['One']);
  });

  it('updates and removes single entries and rescans on rebuild', async () => {
    const fs = new MemoryFileSystem();
    const file = mapFile('m1', 'One', 5);
    await saveMapFile(fs, BOOK, file);
    expect(await updateMindmapIndex(fs, BOOK, file)).toEqual([buildIndexEntry(file)]);
    expect(await removeFromMindmapIndex(fs, BOOK, 'm1')).toEqual([]);
    expect((await rebuildMindmapIndex(fs, BOOK)).map((entry) => entry.mapId)).toEqual(['m1']);
  });
});
