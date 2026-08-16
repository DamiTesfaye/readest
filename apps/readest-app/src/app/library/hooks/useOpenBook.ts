import { Dispatch, SetStateAction, useCallback } from 'react';
import { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useAppRouter } from '@/hooks/useAppRouter';
import { eventDispatcher } from '@/utils/event';
import { navigateToReader, showReaderWindow } from '@/utils/nav';

interface UseOpenBookOptions {
  setLoading: Dispatch<SetStateAction<boolean>>;
  handleBookDownload: (
    book: Book,
    options?: { redownload?: boolean; queued?: boolean },
  ) => Promise<boolean>;
}

/**
 * Shared "open this book" flow used both by per-item taps (`BookshelfItem`) and
 * the recently-read shelf. Centralizing it keeps the availability handling in
 * one place: cloud-synced books (which arrive on other devices as metadata +
 * progress without the file blob) are downloaded on demand, and a stale
 * in-place record is dropped instead of bouncing the user into a broken reader.
 */
export const useOpenBook = ({ setLoading, handleBookDownload }: UseOpenBookOptions) => {
  const _ = useTranslation();
  const router = useAppRouter();
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { updateBook } = useLibraryStore();

  const makeBookAvailable = useCallback(
    async (book: Book) => {
      if (!book.uploadedAt) return true;
      if (await appService?.isBookAvailable(book)) {
        if (!book.downloadedAt || !book.coverDownloadedAt) {
          book.downloadedAt = Date.now();
          book.coverDownloadedAt = Date.now();
          await updateBook(envConfig, book);
        }
        return true;
      }
      // The file is not on this device: it either never arrived or the local
      // copy went away while `downloadedAt` kept claiming otherwise. Clear the
      // stale stamp so the card stops advertising a local copy, then pull it
      // down again.
      book.downloadedAt = null;
      let available = false;
      const loadingTimeout = setTimeout(() => setLoading(true), 200);
      try {
        available = await handleBookDownload(book, { queued: false });
        await updateBook(envConfig, book);
      } finally {
        if (loadingTimeout) clearTimeout(loadingTimeout);
        setLoading(false);
      }
      return available;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appService, envConfig, handleBookDownload, setLoading],
  );

  const openBook = useCallback(
    async (book: Book) => {
      // A local-only book can lose its file between sessions: in-place books
      // point outside Books/<hash>/ where the user (or another app) may move,
      // rename or delete it, and a managed copy can be evicted by browser
      // storage pressure while its sidecars (config, cover, nav) survive.
      // `downloadedAt` keeps claiming the file is here either way, so probe the
      // source before navigating: if it's gone, drop the stale record instead of
      // opening the reader only to fail and bounce back. Cloud-synced books
      // (`uploadedAt`) still go through `makeBookAvailable`'s download path.
      if (!book.uploadedAt && !book.deletedAt) {
        const available = await appService?.isBookAvailable(book);
        if (!available) {
          eventDispatcher.dispatch('toast', {
            message: _(
              'Book file no longer exists. Confirm deletion to remove it from the library.',
            ),
            type: 'info',
          });
          eventDispatcher.dispatch('delete-books', { ids: [book.hash] });
          return;
        }
      }
      const available = await makeBookAvailable(book);
      if (!available) return;
      if (appService?.hasWindow && settings.openBookInNewWindow) {
        showReaderWindow(appService, [book.hash]);
      } else {
        setTimeout(() => {
          navigateToReader(router, [book.hash]);
        }, 0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appService, makeBookAvailable, settings.openBookInNewWindow],
  );

  return { openBook, makeBookAvailable };
};
