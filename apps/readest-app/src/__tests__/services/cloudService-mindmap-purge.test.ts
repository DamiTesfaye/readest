import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { deleteBook } from '@/services/cloudService';
import { mapFileDir } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import type { Book } from '@/types/book';

const book = (hash: string): Book =>
  ({ hash, format: 'EPUB', title: 'T', author: 'A', createdAt: 1, updatedAt: 1 }) as Book;

const entryOf = (mapId: string, bookHash: string) => ({
  mapId,
  bookHash,
  name: mapId,
  bundleDir: mapFileDir(bookHash, mapId),
  syncedMd5: 'abc',
});

let fs: MemoryFileSystem;

beforeEach(() => {
  fs = new MemoryFileSystem();
});

afterEach(() => {
  __resetMindmapStoreForTests();
});

describe('purging a book', () => {
  it('drops its mind maps from the sync store so they download again later', async () => {
    await useMindmapStore.getState().hydrate(fs);
    useMindmapStore.getState().upsertEntry(entryOf('m1', 'book1'));
    useMindmapStore.getState().upsertEntry(entryOf('m2', 'book2'));
    await deleteBook(fs, book('book1'), 'purge');
    expect(useMindmapStore.getState().entries.map((entry) => entry.mapId)).toEqual(['m2']);
  });

  it('keeps a book purged before the store loads from coming back after a restart', async () => {
    await fs.writeFile(
      'mindmap-store.json',
      'Data',
      JSON.stringify([entryOf('m1', 'book1'), entryOf('m2', 'book2')]),
    );
    await deleteBook(fs, book('book1'), 'purge');
    await useMindmapStore.getState().hydrate(fs);
    await useMindmapStore.getState().whenPersisted();
    __resetMindmapStoreForTests();
    await useMindmapStore.getState().hydrate(fs);
    expect(useMindmapStore.getState().entries.map((entry) => entry.mapId)).toEqual(['m2']);
  });

  it('leaves mind maps alone for the other delete actions', async () => {
    await useMindmapStore.getState().hydrate(fs);
    useMindmapStore.getState().upsertEntry(entryOf('m1', 'book1'));
    await deleteBook(fs, book('book1'), 'local');
    expect(useMindmapStore.getState().entries).toHaveLength(1);
  });
});
