import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  navigateToReader,
  showReaderWindow,
  dispatch,
  updateBook,
  isBookAvailable,
  handleBookDownload,
} = vi.hoisted(() => ({
  navigateToReader: vi.fn(),
  showReaderWindow: vi.fn(),
  dispatch: vi.fn(),
  updateBook: vi.fn(),
  isBookAvailable: vi.fn(),
  handleBookDownload: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/hooks/useAppRouter', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: { env: 'test' }, appService: { isBookAvailable, hasWindow: false } }),
}));
vi.mock('@/store/libraryStore', () => ({ useLibraryStore: () => ({ updateBook }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { openBookInNewWindow: false } }),
}));
vi.mock('@/utils/nav', () => ({ navigateToReader, showReaderWindow }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));

import { useOpenBook } from '@/app/library/hooks/useOpenBook';
import type { Book } from '@/types/book';

const managedBook = {
  hash: 'f0c0bf6a1e5c338faf9e855d630d3e36',
  format: 'EPUB',
  title: 'Zero to One',
  author: 'Peter Thiel',
  createdAt: 1,
  updatedAt: 1,
  uploadedAt: null,
  downloadedAt: 1,
} as unknown as Book;

const cloudBook = {
  ...managedBook,
  hash: 'c2bd82396c077872d1f8f11b2f2c3ed6',
  title: 'The Rust Programming Language',
  uploadedAt: 1,
  downloadedAt: 1,
} as unknown as Book;

const openBookOf = () =>
  renderHook(() => useOpenBook({ setLoading: vi.fn(), handleBookDownload })).result.current
    .openBook;

beforeEach(() => {
  vi.clearAllMocks();
  handleBookDownload.mockResolvedValue(true);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useOpenBook', () => {
  it('opens a managed book whose file is still there', async () => {
    isBookAvailable.mockResolvedValue(true);
    const openBook = openBookOf();
    await act(async () => {
      await openBook(managedBook);
      vi.runAllTimers();
    });
    expect(navigateToReader).toHaveBeenCalledWith(expect.anything(), [managedBook.hash]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not open the reader when the managed book file is gone', async () => {
    isBookAvailable.mockResolvedValue(false);
    const openBook = openBookOf();
    await act(async () => {
      await openBook(managedBook);
      vi.runAllTimers();
    });
    expect(navigateToReader).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('delete-books', { ids: [managedBook.hash] });
  });

  it('re-downloads a cloud book whose downloadedAt outlived its local copy', async () => {
    isBookAvailable.mockResolvedValue(false);
    const book = { ...cloudBook };
    const openBook = openBookOf();
    await act(async () => {
      await openBook(book);
      vi.runAllTimers();
    });
    expect(handleBookDownload).toHaveBeenCalledWith(book, { queued: false });
    expect(book.downloadedAt).toBeNull();
    expect(navigateToReader).toHaveBeenCalledWith(expect.anything(), [book.hash]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('opens a downloaded cloud book without downloading it again', async () => {
    isBookAvailable.mockResolvedValue(true);
    const book = { ...cloudBook };
    const openBook = openBookOf();
    await act(async () => {
      await openBook(book);
      vi.runAllTimers();
    });
    expect(handleBookDownload).not.toHaveBeenCalled();
    expect(navigateToReader).toHaveBeenCalledWith(expect.anything(), [book.hash]);
  });
});
