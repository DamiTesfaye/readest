import React, { useCallback, useEffect } from 'react';

import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import ToolbarPopover from '@/components/ToolbarPopover';
import SearchBar from './sidebar/SearchBar';
import SearchResults from './sidebar/SearchResults';
import TOCView from './sidebar/TOCView';

interface TocPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const TocPopover: React.FC<TocPopoverProps> = ({ bookKey, isOpen, anchorEl, onClose }) => {
  const _ = useTranslation();
  const { getBookData } = useBookDataStore();
  const { getView } = useReaderStore();
  const { getSearchNavState, setSearchBarVisible, clearSearch } = useSidebarStore();
  const searchNavState = getSearchNavState(bookKey);
  const { searchTerm = '', searchResults = null } = searchNavState || {};

  useEffect(() => {
    if (!isOpen) return;
    const onNavigate = () => onClose();
    eventDispatcher.on('navigate', onNavigate);
    return () => {
      eventDispatcher.off('navigate', onNavigate);
    };
  }, [isOpen, onClose]);

  const handleHideSearchBar = useCallback(() => {
    setSearchBarVisible(false);
    clearSearch(bookKey);
    getView(bookKey)?.clearSearch();
  }, [bookKey, clearSearch, getView, setSearchBarVisible]);

  const handleSearchResultClick = (cfi: string) => {
    getView(bookKey)?.goTo(cfi);
    onClose();
  };

  const bookDoc = getBookData(bookKey)?.bookDoc;
  if (!bookDoc) return null;

  return (
    <ToolbarPopover
      isOpen={isOpen}
      anchorEl={anchorEl}
      width={320}
      maxHeight={640}
      onClose={onClose}
    >
      <div className='flex flex-col pb-2'>
        <div className='bg-base-200 sticky top-0 z-10 flex flex-col gap-2 px-4 pb-2 pt-4'>
          <h2 className='text-base-content popover-title text-center text-sm'>{_('Contents')}</h2>
          <div className='bg-base-content/15 h-px' />
          <SearchBar isVisible={true} bookKey={bookKey} onHideSearchBar={handleHideSearchBar} />
        </div>
        {searchTerm && searchResults ? (
          <SearchResults
            bookKey={bookKey}
            results={searchResults}
            onSelectResult={handleSearchResultClick}
          />
        ) : (
          bookDoc.toc && <TOCView toc={bookDoc.toc} bookKey={bookKey} />
        )}
      </div>
    </ToolbarPopover>
  );
};

export default TocPopover;
