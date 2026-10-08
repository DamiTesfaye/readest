import clsx from 'clsx';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

import type { Book } from '@/types/book';
import { FIXED_LAYOUT_FORMATS } from '@/types/book';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { POPOVER_EDGE_PADDING } from '@/utils/popover';
import ToolbarPopover from '@/components/ToolbarPopover';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import useBooksManager from '../../hooks/useBooksManager';
import LibraryBookItem from './LibraryBookItem';
import LibrarySearchInput from './LibrarySearchInput';
import ParallelReadPrompt from './ParallelReadPrompt';
import { selectLibraryPopoverBooks } from './selectors';

const MAX_POPOVER_WIDTH = 720;
const MAX_POPOVER_HEIGHT = 520;

interface LibraryPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const LibraryPopover: React.FC<LibraryPopoverProps> = ({ bookKey, isOpen, anchorEl, onClose }) => {
  const _ = useTranslation();
  const { visibleLibrary } = useLibraryStore();
  const { bookKeys } = useReaderStore();
  const { setSideBarBookKey } = useSidebarStore();
  const { getBookData } = useBookDataStore();
  const { openParallelView } = useBooksManager();

  const [query, setQuery] = useState('');
  const [pendingBook, setPendingBook] = useState<Book | null>(null);
  const [width, setWidth] = useState(MAX_POPOVER_WIDTH);

  useEffect(() => {
    const update = () =>
      setWidth(Math.min(MAX_POPOVER_WIDTH, window.innerWidth - 2 * POPOVER_EDGE_PADDING));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const deferredQuery = useDeferredValue(query);
  const { reading, others } = useMemo(
    () => selectLibraryPopoverBooks(visibleLibrary, deferredQuery),
    [visibleLibrary, deferredQuery],
  );

  const openHashes = useMemo(() => new Set(bookKeys.map((key) => key.split('-')[0]!)), [bookKeys]);

  const handleSelect = useCallback(
    (book: Book) => {
      const existing = bookKeys.find((key) => key.split('-')[0] === book.hash);
      if (existing) {
        setSideBarBookKey(existing);
        onClose();
        return;
      }
      setPendingBook(book);
      onClose();
    },
    [bookKeys, onClose, setSideBarBookKey],
  );

  const currentBook = getBookData(bookKey)?.book;
  const canReadParallel = Boolean(
    pendingBook &&
      !FIXED_LAYOUT_FORMATS.has(pendingBook.format) &&
      currentBook &&
      !FIXED_LAYOUT_FORMATS.has(currentBook.format),
  );

  const isEmpty = reading.length === 0 && others.length === 0;
  const showLabels = reading.length > 0 && others.length > 0;

  return (
    <>
      <ToolbarPopover
        isOpen={isOpen}
        anchorEl={anchorEl}
        width={width}
        maxHeight={MAX_POPOVER_HEIGHT}
        className='!overflow-hidden'
        onClose={onClose}
      >
        <div className='flex max-h-full flex-col'>
          <div className='bg-base-200 flex flex-col gap-2 px-4 pb-2 pt-4'>
            <PopoverTitleBar
              title={_('Library')}
              showDivider
              end={<LibrarySearchInput value={query} onChange={setQuery} onEscape={onClose} />}
            />
          </div>
          <div className='no-scrollbar flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-2'>
            {reading.length > 0 && (
              <div className='flex flex-col gap-1'>
                {showLabels && (
                  <span className='text-base-content/70 popover-label'>
                    {_('Currently reading')}
                  </span>
                )}
                <div
                  className={clsx(
                    'no-scrollbar -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4',
                    showLabels && '-mt-2',
                  )}
                >
                  {reading.map((book) => (
                    <LibraryBookItem
                      key={book.hash}
                      book={book}
                      isOpen={openHashes.has(book.hash)}
                      showProgress
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            )}
            {others.length > 0 && (
              <div className='flex flex-col gap-1'>
                {showLabels && (
                  <span className='text-base-content/70 popover-label'>{_('On the shelf')}</span>
                )}
                <div
                  className={clsx(
                    'no-scrollbar -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4',
                    showLabels && '-mt-2',
                  )}
                >
                  {others.map((book) => (
                    <LibraryBookItem
                      key={book.hash}
                      book={book}
                      isOpen={openHashes.has(book.hash)}
                      showProgress={false}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            )}
            {isEmpty && (
              <span className='text-base-content/60 py-6 text-center text-sm'>
                {_('No books match')}
              </span>
            )}
          </div>
        </div>
      </ToolbarPopover>
      {pendingBook && (
        <ParallelReadPrompt
          book={pendingBook}
          canReadParallel={canReadParallel}
          onReadParallel={() => {
            openParallelView(pendingBook.hash);
            setPendingBook(null);
          }}
          onReadSingle={() => {
            eventDispatcher.dispatch('open-book-single', { bookHash: pendingBook.hash });
            setPendingBook(null);
          }}
          onCancel={() => setPendingBook(null)}
        />
      )}
    </>
  );
};

export default LibraryPopover;
