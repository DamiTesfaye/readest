import clsx from 'clsx';
import React, { useCallback, useMemo } from 'react';

import type { BookNote } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { writeTextToClipboard } from '@/utils/clipboard';
import ToolbarPopover from '@/components/ToolbarPopover';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import { removeBookNoteOverlays } from '../../utils/annotatorUtil';
import BooknoteEntryItem from './BooknoteEntryItem';
import { BOOKMARK_RIBBON_COLOR, BookmarkPlaceholderIcon } from './BooknoteIcons';
import { selectBooknoteEntries } from './selectors';

const POPOVER_WIDTH = 320;
const MAX_POPOVER_HEIGHT = 480;

interface BooknotesPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const BooknotesPopover: React.FC<BooknotesPopoverProps> = ({
  bookKey,
  isOpen,
  anchorEl,
  onClose,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const { isDarkMode } = useThemeStore();
  const { getBookData, getConfig, saveConfig, updateBooknotes } = useBookDataStore();
  const { getView, getViewsById } = useReaderStore();
  const { setNotebookEditAnnotation, setNotebookVisible } = useNotebookStore();

  const booknotes = getConfig(bookKey)?.booknotes;
  const toc = getBookData(bookKey)?.bookDoc?.toc;
  const entries = useMemo(
    () => selectBooknoteEntries(booknotes ?? [], toc ?? []),
    [booknotes, toc],
  );

  const handleNavigate = useCallback(
    (item: BookNote) => {
      eventDispatcher.dispatch('navigate', { bookKey, cfi: item.cfi });
      getView(bookKey)?.goTo(item.cfi);
      onClose();
    },
    [bookKey, getView, onClose],
  );

  const handleCopy = useCallback((item: BookNote) => {
    writeTextToClipboard(item.text || item.note);
  }, []);

  const handleEdit = useCallback(
    (item: BookNote) => {
      setNotebookVisible(true);
      setNotebookEditAnnotation(item);
      onClose();
    },
    [onClose, setNotebookEditAnnotation, setNotebookVisible],
  );

  const handleDelete = useCallback(
    (item: BookNote) => {
      const config = getConfig(bookKey);
      if (!config) return;
      const remaining = (config.booknotes ?? []).map((note) =>
        note.id === item.id ? { ...note, deletedAt: Date.now() } : note,
      );
      getViewsById(bookKey.split('-')[0]!).forEach((view) => removeBookNoteOverlays(view, item));
      const updatedConfig = updateBooknotes(bookKey, remaining);
      if (updatedConfig) saveConfig(envConfig, bookKey, updatedConfig, settings);
    },
    [bookKey, envConfig, getConfig, getViewsById, saveConfig, settings, updateBooknotes],
  );

  const handleBookmarkThisPage = useCallback(() => {
    eventDispatcher.dispatch('toggle-bookmark', { bookKey });
    onClose();
  }, [bookKey, onClose]);

  return (
    <ToolbarPopover
      isOpen={isOpen}
      anchorEl={anchorEl}
      width={POPOVER_WIDTH}
      maxHeight={MAX_POPOVER_HEIGHT}
      className='!overflow-hidden'
      onClose={onClose}
    >
      <div className='flex max-h-full flex-col'>
        <div className='bg-base-200 flex flex-col gap-2 px-4 pb-2 pt-4'>
          <PopoverTitleBar title={_('Bookmarks & Notes')} showDivider />
        </div>
        {entries.length === 0 ? (
          <div className='flex select-none flex-col items-center gap-1 px-6 pb-6 pt-4 text-center'>
            <span
              className='mb-1'
              style={isDarkMode ? undefined : { color: BOOKMARK_RIBBON_COLOR }}
            >
              <BookmarkPlaceholderIcon className='h-20 w-20' />
            </span>
            <p className='popover-title text-base-content text-sm'>{_('No Bookmarks')}</p>
            <p className='text-base-content/55 popover-label leading-relaxed'>
              {_('To bookmark a page, click on the bookmark icon in the toolbar')}
            </p>
            <button
              type='button'
              className={clsx(
                'eink-bordered mt-4 h-9 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90',
                isDarkMode ? 'bg-base-content text-base-100' : 'bg-base-300 text-base-content/70',
              )}
              onClick={handleBookmarkThisPage}
            >
              {_('Bookmark This Page')}
            </button>
          </div>
        ) : (
          <div className='no-scrollbar flex flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1'>
            {entries.map((entry) => (
              <BooknoteEntryItem
                key={entry.id}
                entry={entry}
                onNavigate={handleNavigate}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </ToolbarPopover>
  );
};

export default BooknotesPopover;
