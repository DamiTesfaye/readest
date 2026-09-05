import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/libs/storage', () => ({ downloadFile: vi.fn() }));
vi.mock('@/app/opds/utils/opdsReq', () => ({ probeFilename: vi.fn() }));
vi.mock('@/store/libraryStore', () => {
  const { create } = require('zustand');
  return {
    useLibraryStore: create(() => ({
      library: [] as unknown[],
      setLibrary: vi.fn(),
    })),
  };
});

import { downloadFile } from '@/libs/storage';
import { probeFilename } from '@/app/opds/utils/opdsReq';
import { useLibraryStore } from '@/store/libraryStore';
import { ImportError } from '@/services/errors';
import { downloadAndImportBook } from '@/services/bookDownload';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';

const mockDownloadFile = vi.mocked(downloadFile);
const mockProbeFilename = vi.mocked(probeFilename);

const importedBook = {
  hash: 'abc123',
  title: 'Moby Dick',
  author: 'Herman Melville',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
} as Book;

const makeAppService = () =>
  ({
    resolveFilePath: vi.fn(async (name: string) => `/cache/${name}`),
    copyFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    importBook: vi.fn(async (_path: string, books: Book[]) => {
      books.push(importedBook);
      return importedBook;
    }),
    saveLibraryBooks: vi.fn(async () => undefined),
  }) as unknown as AppService & {
    resolveFilePath: ReturnType<typeof vi.fn>;
    copyFile: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    importBook: ReturnType<typeof vi.fn>;
    saveLibraryBooks: ReturnType<typeof vi.fn>;
  };

const url = 'https://www.gutenberg.org/ebooks/9.epub3.images';

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({ library: [], setLibrary: vi.fn() });
  mockDownloadFile.mockResolvedValue({});
  mockProbeFilename.mockResolvedValue('');
});

describe('downloadAndImportBook', () => {
  test('downloads to a Cache path named from the URL and media type, imports it and persists the library', async () => {
    const appService = makeAppService();

    const book = await downloadAndImportBook({
      appService,
      url,
      mediaType: 'application/epub+zip',
      headers: { Accept: '*/*' },
    });

    expect(book).toBe(importedBook);
    expect(appService.resolveFilePath).toHaveBeenCalledWith('_ebooks_9.epub3.images.epub', 'Cache');
    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        appService,
        dst: '/cache/_ebooks_9.epub3.images.epub',
        url,
        headers: { Accept: '*/*' },
        singleThreaded: true,
        skipSslVerification: true,
      }),
    );
    expect(appService.importBook).toHaveBeenCalledWith(
      '/cache/_ebooks_9.epub3.images.epub',
      expect.any(Array),
    );
    const { setLibrary } = useLibraryStore.getState();
    expect(setLibrary).toHaveBeenCalledWith([importedBook]);
    expect(appService.saveLibraryBooks).toHaveBeenCalledWith([importedBook]);
  });

  test('fetches from downloadUrl when it differs from the canonical url', async () => {
    const appService = makeAppService();

    await downloadAndImportBook({
      appService,
      url,
      downloadUrl: 'https://proxy.example/fetch?u=1',
      mediaType: 'application/epub+zip',
    });

    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://proxy.example/fetch?u=1' }),
    );
  });

  test('renames the download when the response names the file', async () => {
    const appService = makeAppService();
    mockProbeFilename.mockResolvedValue('pg9-images-3.epub');

    await downloadAndImportBook({ appService, url });

    expect(appService.copyFile).toHaveBeenCalledWith(
      '/cache/_ebooks_9.epub3.images',
      'None',
      '/cache/pg9-images-3.epub',
      'None',
    );
    expect(appService.deleteFile).toHaveBeenCalledWith('/cache/_ebooks_9.epub3.images', 'None');
    expect(appService.importBook).toHaveBeenCalledWith(
      '/cache/pg9-images-3.epub',
      expect.any(Array),
    );
  });

  test('replaces the imported book with its decorated copy before persisting, without mutating it', async () => {
    const appService = makeAppService();

    const book = await downloadAndImportBook({
      appService,
      url,
      decorate: (imported) => ({ ...imported, tags: ['decorated'] }),
    });

    expect(book?.tags).toEqual(['decorated']);
    expect(importedBook.tags).toBeUndefined();
    const { setLibrary } = useLibraryStore.getState();
    expect(setLibrary).toHaveBeenCalledWith([expect.objectContaining({ tags: ['decorated'] })]);
    expect(appService.saveLibraryBooks).toHaveBeenCalledWith([
      expect.objectContaining({ tags: ['decorated'] }),
    ]);
  });

  test('runs onImported with the book before the library is persisted', async () => {
    const appService = makeAppService();
    const order: string[] = [];
    appService.saveLibraryBooks.mockImplementation(async () => {
      order.push('save');
    });

    await downloadAndImportBook({
      appService,
      url,
      onImported: async (book) => {
        order.push(`imported:${book.hash}`);
      },
    });

    expect(order).toEqual(['imported:abc123', 'save']);
  });

  test('wraps an import failure in ImportError', async () => {
    const appService = makeAppService();
    appService.importBook.mockRejectedValue(new Error('unsupported format'));

    await expect(downloadAndImportBook({ appService, url })).rejects.toBeInstanceOf(ImportError);
    expect(useLibraryStore.getState().setLibrary).not.toHaveBeenCalled();
  });
});
