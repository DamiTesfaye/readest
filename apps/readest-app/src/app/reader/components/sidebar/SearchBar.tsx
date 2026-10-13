import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IoMdCloseCircle } from 'react-icons/io';
import { MdDeleteOutline } from 'react-icons/md';

import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import {
  createLibrarySearchSession,
  resolveSearchResultCfis,
  searchLibraryBooks,
  type LibrarySearchSession,
} from '@/services/librarySearchService';
import { BookSearchConfig, BookSearchMatch, BookSearchResult } from '@/types/book';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { resolveUIAnimationsEnabled } from '@/utils/animation';
import { debounce } from '@/utils/debounce';
import { isCJKStr } from '@/utils/lang';
import { getToolbarIconSrc } from '@/utils/toolbarIcons';
import ToolbarPopover from '@/components/ToolbarPopover';
import SearchBarRive from './SearchBarRive';
import SearchFilter from './SearchFilter';

const MINIMUM_SEARCH_TERM_LENGTH_DEFAULT = 2;
const MINIMUM_SEARCH_TERM_LENGTH_CJK = 1;
const SEARCH_HISTORY_KEY = 'search-history';
// Pre-search.db per-(term,config) JSON caches lived here; wiped once at
// startup now that reader search runs on the shared per-book search.db.
const LEGACY_SEARCH_CACHE_DIR = 'search';
let legacySearchCacheCleared = false;
const MAX_SEARCH_HISTORY = 10;

interface SearchBarProps {
  isVisible: boolean;
  bookKey: string;
  onHideSearchBar: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ isVisible, bookKey, onHideSearchBar }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { getBookData } = useBookDataStore();
  const { getConfig, setConfig, saveConfig } = useBookDataStore();
  const { getView, getProgress, getViewSettings } = useReaderStore();
  const { setSearchTerm, setSearchResults, setSearchProgress, setSearchError } = useSidebarStore();
  const { getSearchNavState, getSearchStatus, setSearchStatus } = useSidebarStore();
  const viewSettings = getViewSettings(bookKey);
  const searchNavState = getSearchNavState(bookKey);

  const { themeColor, isDarkMode } = useThemeStore();

  const { searchTerm, searchError } = searchNavState;
  const queuedSearchTerm = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputFocusedRef = useRef(false);
  const [successfulSearchTerm, setSuccessfulSearchTerm] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPupLoaded, setIsPupLoaded] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const bookHash = useMemo(() => bookKey.split('-')[0]!, [bookKey]);
  const historyStorageKey = useMemo(() => `${SEARCH_HISTORY_KEY}-${bookHash}`, [bookHash]);

  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(historyStorageKey);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  useEffect(() => {
    const saved = localStorage.getItem(historyStorageKey);
    setSearchHistory(saved ? JSON.parse(saved) : []);
  }, [historyStorageKey]);

  const addToHistory = useCallback(
    (term: string) => {
      const filtered = searchHistory.filter((t) => t !== term);
      const updated = [term, ...filtered].slice(0, MAX_SEARCH_HISTORY);
      localStorage.setItem(historyStorageKey, JSON.stringify(updated));
      setSearchHistory(updated);
    },
    [historyStorageKey, searchHistory],
  );

  const handleHistoryClick = (term: string) => {
    setSearchTerm(bookKey, term);
    handleSearchTermChange(term);
  };

  const handleClearInput = () => {
    setSearchTerm(bookKey, '');
    resetSearch();
    inputRef.current?.focus();
  };

  const handleClearHistory = async () => {
    setSearchHistory([]);
    localStorage.removeItem(historyStorageKey);
  };

  const view = getView(bookKey)!;
  // Reader search runs against the same per-book search.db the library page
  // uses; the session caches the opened book and index handle across queries.
  const searchSessionRef = useRef<LibrarySearchSession | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!legacySearchCacheCleared && appService) {
      legacySearchCacheCleared = true;
      void appService.deleteDir(LEGACY_SEARCH_CACHE_DIR, 'Cache', true).catch(() => {});
    }
  }, [appService]);
  useEffect(
    () => () => {
      searchControllerRef.current?.abort();
      void searchSessionRef.current?.close();
      searchSessionRef.current = null;
    },
    [],
  );
  const config = getConfig(bookKey)!;
  const bookData = getBookData(bookKey)!;
  const progress = getProgress(bookKey);
  const searchMode = (config.searchConfig as BookSearchConfig).mode;

  const iconSize16 = useResponsiveSize(16);
  const iconSize20 = useResponsiveSize(20);
  const isEink = !!viewSettings?.isEink;
  const animationsEnabled = resolveUIAnimationsEnabled(settings);
  const showPup = !isEink && animationsEnabled;
  const isPupDrawn = showPup && isPupLoaded;
  const hasResults = successfulSearchTerm !== null && successfulSearchTerm === searchTerm;

  useEffect(() => {
    handleSearchTermChange(searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey, searchTerm]);

  useEffect(() => {
    if (isVisible && inputRef.current && !appService?.isMobile) {
      inputRef.current.focus();
    }
    if (isVisible && searchTerm) {
      handleSearchTermChange(searchTerm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, isVisible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inputRef.current && inputFocusedRef.current) {
          inputRef.current.blur();
        } else {
          onHideSearchBar();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onHideSearchBar]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(bookKey, value);
    handleSearchTermChange(value);
  };

  const handleSearchConfigChange = (searchConfig: BookSearchConfig) => {
    setConfig(bookKey, { searchConfig: { ...searchConfig } });
    // setConfig is synchronous, so getConfig now returns the merged config to persist.
    saveConfig(envConfig, bookKey, getConfig(bookKey)!, settings);
    handleSearchTermChange(searchTerm);
  };

  const exceedMinSearchTermLength = (searchTerm: string) => {
    // Regex patterns can be a single character (e.g. \d), so bypass the gate.
    if (searchMode === 'regex') return searchTerm.length >= 1;
    const minLength = isCJKStr(searchTerm)
      ? MINIMUM_SEARCH_TERM_LENGTH_CJK
      : MINIMUM_SEARCH_TERM_LENGTH_DEFAULT;

    return searchTerm.length >= minLength;
  };

  const handleSearch = useCallback(
    async (term: string) => {
      console.log('searching for:', term);
      const book = bookData.book;
      if (!book || !appService) return;

      // Read the latest config from the store, not the render closure: an option
      // change (e.g. "within N words") calls setConfig then triggers this search
      // synchronously, before this callback is recreated — so the closure's
      // `config` is stale by one change. getConfig reflects the just-set value.
      const searchConfig = getConfig(bookKey)!.searchConfig as BookSearchConfig;

      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      const session = (searchSessionRef.current ??= createLibrarySearchSession(appService));

      setSearchProgress(bookKey, 0);
      setSearchStatus(bookKey, 'searching');
      setSuccessfulSearchTerm(null);
      setSearchError(bookKey, null);
      view.clearSearch();

      // progress is null until the book emits its first relocate event, so a
      // search fired right after opening has no current section to scope to.
      // Fall back to searching the whole book rather than throwing.
      const sectionIndex = searchConfig.scope === 'section' ? progress?.section.current : undefined;

      const results: BookSearchResult[] = [];
      const stopped = () =>
        controller.signal.aborted ||
        getSearchStatus(bookKey) === 'terminated' ||
        queuedSearchTerm.current !== term;

      try {
        for await (const event of searchLibraryBooks(appService, [book], term, {
          config: searchConfig.fuzzy ? { ...searchConfig, mode: 'fuzzy' } : searchConfig,
          signal: controller.signal,
          session,
          sectionIndex,
          // The library sweep caps each book so no single book floods the
          // shared results list; in-book search has no such competition and
          // must report every match.
          maxResultsPerBook: Infinity,
        })) {
          if (stopped()) return;
          if (event.type === 'progress') {
            setSearchProgress(bookKey, event.bookProgress);
          } else if (event.type === 'result') {
            // Results carry text-offset locators; resolve them to CFIs section
            // by section so the list and in-page highlights can address the DOM.
            const resolved = await resolveSearchResultCfis(
              session,
              book,
              event.result.subitems.map((match) => match.locator),
            );
            if (stopped()) return;
            const subitems: BookSearchMatch[] = [];
            event.result.subitems.forEach((match, index) => {
              const entry = resolved[index];
              if (!entry) return;
              subitems.push({
                cfi: entry.cfi,
                ...(entry.cfis ? { cfis: entry.cfis } : {}),
                excerpt: match.excerpt,
              });
            });
            if (subitems.length) {
              results.push({ index: event.result.index, label: event.result.label, subitems });
              setSearchResults(bookKey, [...results]);
            }
          } else if (event.type === 'book-error' || event.type === 'book-skipped') {
            const code = event.type === 'book-error' ? event.code : undefined;
            const message =
              code === 'INVALID_REGEX'
                ? _('Invalid regular expression')
                : code === 'NEARBY_NEEDS_TWO_WORDS'
                  ? _('Enter at least two words')
                  : code === 'FUZZY_QUERY_TOO_LONG'
                    ? _('Search query is too long')
                    : _('Search failed');
            if (event.type === 'book-error' && !code) {
              console.error('search failed:', event.error);
            }
            setSearchError(bookKey, message);
            setSearchResults(bookKey, []);
            setSearchStatus(bookKey, 'completed');
            setSearchProgress(bookKey, 1);
            return;
          } else if (event.type === 'book-completed') {
            setSearchStatus(bookKey, 'completed');
            setSearchResults(bookKey, [...results]);
            setSearchProgress(bookKey, 1);
            if (results.length > 0) {
              setSuccessfulSearchTerm(term);
              addToHistory(term);
            }
            console.log('search done');
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        // Replay the resolved matches through the view so every CFI gets its
        // search highlight; the view does no searching of its own here.
        if (!stopped() && results.length > 0) {
          for await (const item of view.search({ ...searchConfig, query: term, results })) {
            if (stopped()) return;
            if (item === 'done') break;
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('search failed:', err);
        setSearchError(bookKey, _('Search failed'));
        setSearchResults(bookKey, []);
        setSearchStatus(bookKey, 'completed');
        setSearchProgress(bookKey, 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      progress,
      bookKey,
      bookData,
      appService,
      getConfig,
      setSearchResults,
      setSearchProgress,
      setSearchError,
      addToHistory,
    ],
  );

  const resetSearch = useCallback(() => {
    setSuccessfulSearchTerm(null);
    searchControllerRef.current?.abort();
    setSearchResults(bookKey, []);
    view?.clearSearch();
  }, [bookKey, view, setSearchResults]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearchTermChange = useCallback(
    debounce((term: string) => {
      queuedSearchTerm.current = term;
      if (exceedMinSearchTermLength(term)) {
        handleSearch(term);
      } else {
        resetSearch();
      }
    }, 500),
    [handleSearch, resetSearch],
  );

  return (
    <div className='relative flex flex-col gap-3 p-2'>
      <div className='flex items-end gap-2'>
        <div className={clsx('relative flex-1', showPup ? 'aspect-[602/280]' : 'h-9')}>
          {showPup && (
            <SearchBarRive
              hasResults={hasResults}
              isEmpty={searchTerm.length === 0}
              onLoadedChange={setIsPupLoaded}
            />
          )}

          <div
            className={clsx(
              'absolute flex items-center rounded-full',
              isEink && 'eink-bordered inset-0',
              !isEink &&
                isPupDrawn &&
                'focus-within:ring-base-content/30 bottom-0 left-[1.66%] h-[42.86%] w-[89.37%] focus-within:ring-2',
              !isEink &&
                !isPupDrawn &&
                clsx(
                  'inset-x-0 bottom-0 border-2 border-[#353535] bg-white',
                  showPup ? 'h-[43%]' : 'h-full',
                ),
            )}
          >
            <input
              ref={inputRef}
              type='text'
              value={searchTerm}
              spellCheck={false}
              onChange={handleInputChange}
              onFocus={() => {
                inputFocusedRef.current = true;
              }}
              onBlur={() => {
                inputFocusedRef.current = false;
              }}
              placeholder={
                searchMode === 'regex'
                  ? _('Search with regex')
                  : searchMode === 'nearby-words'
                    ? _('Words to find near each other')
                    : _('Search...')
              }
              className={clsx(
                'search-input w-full bg-transparent font-sans text-sm font-light focus:outline-none',
                isPupDrawn ? 'h-full pl-[9%] pr-[24%] pt-[4%]' : 'px-4',
                isEink ? '' : 'text-neutral-800 placeholder:text-neutral-400',
              )}
            />

            {searchTerm && (
              <button
                onClick={handleClearInput}
                className={clsx(
                  'absolute flex h-6 w-6 items-center justify-center bg-transparent',
                  isPupDrawn ? 'end-[11%]' : 'end-2',
                )}
                aria-label={_('Clear search')}
              >
                <IoMdCloseCircle
                  size={iconSize16}
                  className={isEink ? 'text-base-content/75' : 'text-neutral-400'}
                />
              </button>
            )}
          </div>
        </div>

        <button
          ref={filterButtonRef}
          onClick={() => setIsFilterOpen((open) => !open)}
          aria-expanded={isFilterOpen}
          aria-label={_('Filter')}
          title={_('Filter')}
          className={clsx(
            'btn btn-ghost h-9 min-h-9 w-9 rounded-lg p-0',
            isFilterOpen && !isEink && 'bg-base-300',
            isEink && '!bg-transparent hover:!bg-transparent',
          )}
        >
          <img
            src={getToolbarIconSrc('filter', themeColor, isDarkMode)}
            alt=''
            style={{ width: iconSize20, height: iconSize20 }}
            className='object-contain'
          />
        </button>
      </div>

      <ToolbarPopover
        isOpen={isFilterOpen}
        anchorEl={filterButtonRef.current}
        width={320}
        maxHeight={560}
        className='!bg-base-300 border-base-content/15 border shadow-2xl'
        triangleClassName='!text-base-300'
        onClose={() => setIsFilterOpen(false)}
      >
        <SearchFilter
          isEink={isEink}
          searchConfig={config.searchConfig as BookSearchConfig}
          onSearchConfigChanged={handleSearchConfigChange}
        />
      </ToolbarPopover>

      {searchError && <div className='text-error px-2 text-xs'>{searchError}</div>}

      {searchHistory.length > 0 && !searchTerm && (
        <div className='relative flex'>
          <div
            className={clsx(
              'from-base-200 pointer-events-none absolute left-0 top-0 h-full w-3 bg-gradient-to-r to-transparent',
              viewSettings?.isEink ? 'hidden' : '',
            )}
            aria-hidden='true'
          />
          <div
            className='scrollbar-hidden flex flex-1 gap-1.5 overflow-x-auto'
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {searchHistory.map((term, index) => (
              <button
                key={index}
                onClick={() => handleHistoryClick(term)}
                className='hover:bg-base-200/20 text-base-content/70 bg-base-100 max-w-[60%] flex-shrink-0 whitespace-nowrap rounded-full px-3 py-0.5 text-xs'
              >
                <p className='truncate'>{term}</p>
              </button>
            ))}
          </div>
          <div
            className={clsx(
              'from-base-200 pointer-events-none absolute right-6 top-0 h-full w-6 bg-gradient-to-l to-transparent',
              viewSettings?.isEink ? 'hidden' : '',
            )}
            aria-hidden='true'
          />
          <button
            onClick={handleClearHistory}
            className={clsx(
              'text-base-content/50 hover:text-base-content/80 flex-shrink-0 items-center',
              'flex h-6 min-h-6 w-8 min-w-8 items-center justify-center p-0',
            )}
            title={_('Clear search history')}
            aria-label={_('Clear search history')}
          >
            <MdDeleteOutline size={iconSize16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
