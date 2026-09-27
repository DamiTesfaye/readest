import { describe, expect, it } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { canonicalStringify } from '@/services/mindmap/file/canonicalStringify';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { stampDiff } from '@/services/mindmap/file/stampDiff';
import {
  isSafeMindmapId,
  loadMapFile,
  mapFileDir,
  mapFilePath,
  mapTrashDir,
  mindmapsDir,
  moveMapDirToTrash,
  saveMapFile,
} from '@/services/mindmap/persist/mapFile';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import {
  CURRENT_RECORD_VERSION,
  type MigrationConfig,
  RECORD_MIGRATIONS,
} from '@/services/mindmap/schema/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_MAP_META,
  type MapFile,
} from '@/services/mindmap/schema/types';

const BOOK = 'book1';
const MAP = 'm1';
const MAIN = mapFilePath(BOOK, MAP);

const clock = () => createMindmapClock(new HlcGenerator('device-1'), 'device-1');

const mapWithNode = (): MapFile => {
  const c = clock();
  const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'Elizabeth' });
  return stampDiff(
    createMapFile(DEFAULT_MAP_META, MAP, c),
    { added: [node], changed: [], discarded: [] },
    c,
    () => node,
  );
};

const nodeToV2 = (
  migration: (fields: Record<string, unknown>) => Record<string, unknown>,
): MigrationConfig => ({
  migrations: { ...RECORD_MIGRATIONS, node: [migration] },
  targetVersions: { ...CURRENT_RECORD_VERSION, node: 2 },
});

describe('map file paths', () => {
  it('places each map in its own directory under the book', () => {
    expect(mapFileDir(BOOK, MAP)).toBe('book1/mindmaps/m1');
    expect(MAIN).toBe('book1/mindmaps/m1/m1.json');
    expect(mapTrashDir(BOOK, MAP)).toBe('book1/mindmaps/.trash/m1');
  });
});

describe('saveMapFile and loadMapFile', () => {
  it('writes canonical bytes and loads them back', async () => {
    const fs = new MemoryFileSystem();
    const file = mapWithNode();
    const text = await saveMapFile(fs, BOOK, file);
    expect(text).toBe(canonicalStringify(file));
    expect(await fs.readFile(MAIN, 'Books')).toBe(text);
    const loaded = await loadMapFile(fs, BOOK, MAP, clock());
    expect(loaded).toMatchObject({ status: 'ok', restoredFromBackup: false, migrated: false });
    expect(loaded.status === 'ok' && canonicalStringify(loaded.file)).toBe(text);
  });

  it('copies the previous file to .bak and writes the main file once per save', async () => {
    const fs = new MemoryFileSystem();
    const first = await saveMapFile(fs, BOOK, createMapFile(DEFAULT_MAP_META, MAP, clock()));
    await saveMapFile(fs, BOOK, mapWithNode());
    expect(await fs.readFile(`${MAIN}.bak`, 'Books')).toBe(first);
    expect(fs.writesTo(MAIN)).toBe(2);
    expect(fs.writesTo(`${MAIN}.bak`)).toBe(0);
  });

  it('restores from .bak when the main file fails to parse or has the wrong shape', async () => {
    const broken = [
      'not json',
      '{"schemaVersion":1,"mapId":"m1","meta":{},"records":{"n1":{"label":null}}}',
    ];
    for (const text of broken) {
      const fs = new MemoryFileSystem();
      const good = await saveMapFile(fs, BOOK, mapWithNode());
      await fs.writeFile(`${MAIN}.bak`, 'Books', good);
      await fs.writeFile(MAIN, 'Books', text);
      const loaded = await loadMapFile(fs, BOOK, MAP, clock());
      expect(loaded).toMatchObject({ status: 'ok', restoredFromBackup: true });
      expect(await fs.readFile(MAIN, 'Books')).toBe(good);
    }
  });

  it('reports unreadable and keeps the raw file when no usable copy exists', async () => {
    const fs = new MemoryFileSystem();
    expect(await loadMapFile(fs, BOOK, 'missing', clock())).toEqual({ status: 'unreadable' });
    await fs.writeFile(MAIN, 'Books', 'not json');
    expect(await loadMapFile(fs, BOOK, MAP, clock())).toEqual({ status: 'unreadable' });
    expect(await fs.readFile(MAIN, 'Books')).toBe('not json');
  });

  it('opens a newer schema read-only without migrating it', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, { ...mapWithNode(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const loaded = await loadMapFile(
      fs,
      BOOK,
      MAP,
      clock(),
      nodeToV2((fields) => fields),
    );
    expect(loaded).toMatchObject({
      status: 'read-only',
      reason: 'newer-schema',
      restoredFromBackup: false,
    });
    expect(loaded.status === 'read-only' && loaded.file.schemaVersion).toBe(
      CURRENT_SCHEMA_VERSION + 1,
    );
    expect(loaded.status === 'read-only' && loaded.file.records['n1']!['version']!.v).toBe(1);
  });

  it('opens read-only with the error when a migration throws', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, mapWithNode());
    const loaded = await loadMapFile(
      fs,
      BOOK,
      MAP,
      clock(),
      nodeToV2(() => {
        throw new Error('bad migration');
      }),
    );
    expect(loaded).toMatchObject({ status: 'read-only', reason: 'migration-failed' });
    expect(loaded.status === 'read-only' && loaded.error).toEqual(new Error('bad migration'));
  });

  it('reports a migrated file so the caller saves it', async () => {
    const fs = new MemoryFileSystem();
    await saveMapFile(fs, BOOK, mapWithNode());
    const loaded = await loadMapFile(
      fs,
      BOOK,
      MAP,
      clock(),
      nodeToV2((fields) => fields),
    );
    expect(loaded).toMatchObject({ status: 'ok', migrated: true });
    expect(loaded.status === 'ok' && loaded.file.records['n1']!['version']!.v).toBe(2);
  });
});

describe('moveMapDirToTrash', () => {
  it('moves the whole map directory, including .bak, incoming and outgoing', async () => {
    const fs = new MemoryFileSystem();
    const dir = mapFileDir(BOOK, MAP);
    const names = ['m1.json', 'm1.json.bak', 'incoming/m1.abc.json', 'outgoing/m1.def.json'];
    for (const name of names) await fs.writeFile(`${dir}/${name}`, 'Books', name);
    await fs.writeFile(mapFilePath(BOOK, 'm2'), 'Books', 'other');

    await moveMapDirToTrash(fs, BOOK, MAP);

    for (const name of names) {
      expect(await fs.exists(`${dir}/${name}`, 'Books')).toBe(false);
      expect(await fs.readFile(`${mapTrashDir(BOOK, MAP)}/${name}`, 'Books')).toBe(name);
    }
    expect(await fs.exists(mapFilePath(BOOK, 'm2'), 'Books')).toBe(true);
  });

  it('does nothing for a map with no directory', async () => {
    await expect(
      moveMapDirToTrash(new MemoryFileSystem(), BOOK, 'missing'),
    ).resolves.toBeUndefined();
  });

  it('throws and deletes nothing for an unsafe mapId', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(mapFilePath(BOOK, MAP), 'Books', 'kept');
    await expect(moveMapDirToTrash(fs, BOOK, '../..')).rejects.toThrow('mindmap: unsafe id');
    expect(await fs.readFile(mapFilePath(BOOK, MAP), 'Books')).toBe('kept');
  });
});

describe('isSafeMindmapId', () => {
  const unsafeIds = ['', '..', '../..', 'a/b'];

  it('rejects unsafe ids', () => {
    for (const id of unsafeIds) expect(isSafeMindmapId(id)).toBe(false);
  });

  it('accepts uniqueId and md5 hash shapes', () => {
    expect(isSafeMindmapId('ab12cd3')).toBe(true);
    expect(isSafeMindmapId('d41d8cd98f00b204e9800998ecf8427e')).toBe(true);
  });

  it('path helpers throw for an unsafe bookHash or mapId', () => {
    for (const id of unsafeIds) {
      expect(() => mindmapsDir(id)).toThrow('mindmap: unsafe id');
      expect(() => mapFileDir(BOOK, id)).toThrow('mindmap: unsafe id');
      expect(() => mapFileDir(id, MAP)).toThrow('mindmap: unsafe id');
      expect(() => mapFilePath(BOOK, id)).toThrow('mindmap: unsafe id');
      expect(() => mapFilePath(id, MAP)).toThrow('mindmap: unsafe id');
      expect(() => mapTrashDir(BOOK, id)).toThrow('mindmap: unsafe id');
      expect(() => mapTrashDir(id, MAP)).toThrow('mindmap: unsafe id');
    }
  });
});
