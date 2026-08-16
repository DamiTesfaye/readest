import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MdOutlineMenu } from 'react-icons/md';

import { Insets } from '@/types/misc';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { useSpatialNavigation } from '@/app/reader/hooks/useSpatialNavigation';
import Dropdown from '@/components/Dropdown';
import ModalPortal from '@/components/ModalPortal';
import WindowButtons from '@/components/WindowButtons';
import BookmarkToggler from './BookmarkToggler';
import NotebookToggler from './NotebookToggler';
import SettingsToggler from './SettingsToggler';
import TranslationToggler from './TranslationToggler';
import ViewMenu from './ViewMenu';
import SyncInfoDialog from './SyncInfoDialog';
import ToolbarPopover from '@/components/ToolbarPopover';
import ThemeFontsPanel from '@/components/themefonts/ThemeFontsPanel';
import TocPopover from './TocPopover';
import LibraryPopover from './library/LibraryPopover';
import BooknotesPopover, { BOOKNOTES_POPOVER_WIDTH } from './booknotes/BooknotesPopover';
import AnnotationsPopover, { ANNOTATIONS_POPOVER_WIDTH } from './booknotes/AnnotationsPopover';
import MorePopover, { MORE_POPOVER_WIDTH } from './MorePopover';
import SparkPopover from './SparkPopover';
import { getToolbarSidePanelPlacement, getToolbarStackedPanelPlacement } from '@/utils/popover';
import type { Rect } from '@/utils/sel';
import { eventDispatcher } from '@/utils/event';
import { getChromeColor, getContrastHex } from '@/styles/themes';
import { getToolbarIconSrc } from '@/utils/toolbarIcons';

const THEME_FONTS_WIDTH = 300;

interface HeaderBarProps {
  bookKey: string;
  bookTitle: string;
  isTopLeft: boolean;
  isHoveredAnim: boolean;
  gridInsets: Insets;
  screenInsets: Insets;
  onCloseBook: (bookKey: string) => void;
  onGoToLibrary: () => void;
  onDropdownOpenChange?: (isOpen: boolean) => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  bookKey,
  bookTitle,
  isTopLeft,
  isHoveredAnim,
  gridInsets,
  screenInsets,
  onCloseBook,
  onGoToLibrary,
  onDropdownOpenChange,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const headerRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);
  const { trafficLightInFullscreen, setTrafficLightVisibility } = useTrafficLightStore();
  const { bookKeys, hoveredBookKey } = useReaderStore();
  const { isDarkMode, themeColor, systemUIVisible, statusBarHeight } = useThemeStore();
  const { isSideBarVisible, getIsSideBarVisible } = useSidebarStore();
  const { getView, getViewState, setHoveredBookKey } = useReaderStore();
  const { getBookData, getConfig } = useBookDataStore();
  const bookData = getBookData(bookKey);
  const bookConfig = getConfig(bookKey);
  const lastSyncedAt =
    Math.max(bookConfig?.lastSyncedAtConfig || 0, bookConfig?.lastSyncedAtNotes || 0) || undefined;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMetaHashDialogOpen, setIsMetaHashDialogOpen] = useState(false);
  const [isThemeFontsOpen, setIsThemeFontsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreAnchorRef = useRef<HTMLButtonElement>(null);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const tocAnchorRef = useRef<HTMLButtonElement>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const libraryAnchorRef = useRef<HTMLButtonElement>(null);
  const [isSparkOpen, setIsSparkOpen] = useState(false);
  const sparkAnchorRef = useRef<HTMLButtonElement>(null);
  const [isBooknotesOpen, setIsBooknotesOpen] = useState(false);
  const [isAnnotationsOpen, setIsAnnotationsOpen] = useState(false);
  const [sidePanelAnchorRect, setSidePanelAnchorRect] = useState<Rect | null>(null);
  const [headerWidth, setHeaderWidth] = useState(0);
  const view = getView(bookKey);

  const docs = view?.renderer.getContents() ?? [];
  const pointerInDoc = docs.some(({ doc }) => doc?.body?.style.cursor === 'pointer');

  const handleToggleDropdown = (isOpen: boolean) => {
    setIsDropdownOpen(isOpen);
    onDropdownOpenChange?.(isOpen);
    if (!isOpen) setHoveredBookKey('');
  };

  const chromeColor = getChromeColor(themeColor, isDarkMode);
  const chromeTextColor = chromeColor ? getContrastHex(chromeColor) : undefined;

  const handleToggleToc = () => {
    setIsTocOpen((prev) => !prev);
  };

  const handleToggleLibrary = () => {
    const next = !isLibraryOpen;
    setIsLibraryOpen(next);
    handleToggleDropdown(next);
  };

  const handleCloseLibrary = () => {
    setIsLibraryOpen(false);
    handleToggleDropdown(false);
  };

  const openSidePanel = (panel: 'themeFonts' | 'booknotes' | 'annotations', anchorRect: Rect) => {
    setSidePanelAnchorRect(anchorRect);
    setIsThemeFontsOpen(panel === 'themeFonts');
    setIsBooknotesOpen(panel === 'booknotes');
    setIsAnnotationsOpen(panel === 'annotations');
    setIsMoreOpen(true);
    handleToggleDropdown(true);
  };

  const handleOpenBooknotes = (anchorRect: Rect) => {
    openSidePanel('booknotes', anchorRect);
  };

  const handleCloseBooknotes = () => {
    setIsBooknotesOpen(false);
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  const handleOpenAnnotations = (anchorRect: Rect) => {
    openSidePanel('annotations', anchorRect);
  };

  const handleCloseAnnotations = () => {
    setIsAnnotationsOpen(false);
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  const handleToggleTTS = () => {
    const ttsEnabled = getViewState(bookKey)?.ttsEnabled;
    eventDispatcher.dispatch(ttsEnabled ? 'tts-stop' : 'tts-speak', { bookKey });
  };

  const handleToggleSpark = () => {
    const next = !isSparkOpen;
    setIsSparkOpen(next);
    handleToggleDropdown(next);
  };

  const handleCloseSpark = () => {
    setIsSparkOpen(false);
    handleToggleDropdown(false);
  };

  const handleThemeFontsOpen = (anchorRect: Rect) => {
    openSidePanel('themeFonts', anchorRect);
  };

  const handleThemeFontsClose = () => {
    setIsThemeFontsOpen(false);
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  const sidePanelPointerY = sidePanelAnchorRect
    ? (sidePanelAnchorRect.top + sidePanelAnchorRect.bottom) / 2
    : undefined;

  const getThemeFontsPlacement = useCallback(
    (anchorRect: Rect, viewport: Rect) =>
      getToolbarSidePanelPlacement(
        anchorRect,
        viewport,
        MORE_POPOVER_WIDTH,
        THEME_FONTS_WIDTH,
        sidePanelPointerY,
      ),
    [sidePanelPointerY],
  );

  const getAnnotationsPlacement = useCallback(
    (anchorRect: Rect, viewport: Rect) =>
      getToolbarSidePanelPlacement(
        anchorRect,
        viewport,
        MORE_POPOVER_WIDTH,
        ANNOTATIONS_POPOVER_WIDTH,
        sidePanelPointerY,
      ),
    [sidePanelPointerY],
  );

  const getBooknotesPlacement = useCallback(
    (anchorRect: Rect, viewport: Rect) =>
      sidePanelAnchorRect
        ? getToolbarStackedPanelPlacement(sidePanelAnchorRect, viewport, BOOKNOTES_POPOVER_WIDTH)
        : getToolbarSidePanelPlacement(
            anchorRect,
            viewport,
            MORE_POPOVER_WIDTH,
            BOOKNOTES_POPOVER_WIDTH,
          ),
    [sidePanelAnchorRect],
  );

  const handleToggleMore = () => {
    const next = !isMoreOpen;
    setIsMoreOpen(next);
    handleToggleDropdown(next);
  };

  const handleCloseMore = () => {
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  useEffect(() => {
    if (!appService?.hasTrafficLight) return;

    if (hoveredBookKey === bookKey && isTopLeft) {
      setTrafficLightVisibility(true);
    } else if (!hoveredBookKey) {
      setTimeout(() => {
        if (!getIsSideBarVisible()) {
          setTrafficLightVisibility(false);
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, hoveredBookKey]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeaderWidth(entry.contentRect.width);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Check if mouse is outside header area to avoid false positive event of MouseLeave when clicking inside header on Windows
  const isMouseOutsideHeader = useCallback((clientX: number, clientY: number) => {
    if (!headerRef.current) return true;

    const rect = headerRef.current.getBoundingClientRect();
    return (
      clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom
    );
  }, []);

  const isHeaderCompact = headerWidth > 0 && headerWidth < 350;
  const insets = window.innerWidth < 640 ? screenInsets : gridInsets;
  const isHeaderVisible = hoveredBookKey === bookKey || isDropdownOpen;

  useSpatialNavigation(headerRef, isHeaderVisible);
  const trafficLightInHeader =
    appService?.hasTrafficLight && !trafficLightInFullscreen && !isSideBarVisible && isTopLeft;
  const windowButtonVisible =
    appService?.hasWindowBar && !isTrafficLightVisible && !trafficLightInHeader;

  return (
    <div
      className={clsx(
        'left-0 top-0 w-full',
        isHeaderVisible && 'bg-base-100',
        window.innerWidth < 640 ? 'fixed z-20' : 'absolute',
      )}
      style={{
        paddingTop: appService?.hasSafeAreaInset ? `${insets.top}px` : '0px',
      }}
    >
      <div
        role='none'
        tabIndex={-1}
        className={clsx('absolute top-0 z-10 h-11 w-full', pointerInDoc && 'pointer-events-none')}
        onClick={() => setHoveredBookKey(bookKey)}
        onMouseEnter={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onTouchStart={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
      />
      <div
        className={clsx(
          'bg-base-100 absolute left-0 right-0 top-0 z-10',
          appService?.hasRoundedWindow && 'rounded-window-top-right',
          isHeaderVisible ? 'visible' : 'hidden',
        )}
        style={{
          height: systemUIVisible ? `${Math.max(insets.top, statusBarHeight)}px` : '0px',
        }}
      />
      <div
        ref={headerRef}
        role='banner'
        aria-label={_('Header Bar')}
        className={clsx(
          `header-bar bg-base-100 absolute top-0 z-10 flex h-11 w-full items-center pr-4`,
          `shadow-xs transition-[opacity,margin-top] duration-300`,
          trafficLightInHeader ? 'pl-20' : isSideBarVisible ? 'ps-4' : 'ps-4 sm:ps-1.5',
          appService?.hasRoundedWindow && 'rounded-window-top-right',
          !isSideBarVisible && appService?.hasRoundedWindow && 'rounded-window-top-left',
          isHoveredAnim && 'hover-bar-anim',
          isHeaderVisible ? 'pointer-events-auto visible' : 'pointer-events-none opacity-0',
          isDropdownOpen && 'header-bar-pinned',
        )}
        style={{
          marginTop: systemUIVisible
            ? `${Math.max(insets.top, statusBarHeight)}px`
            : `${insets.top}px`,
          backgroundColor: chromeColor ?? undefined,
          color: chromeTextColor,
        }}
        onFocus={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onMouseLeave={(e) => {
          if (!appService?.isMobile && isMouseOutsideHeader(e.clientX, e.clientY)) {
            setHoveredBookKey('');
          }
        }}
      >
        <div className='header-tools-start bg-base-100 sidebar-bookmark-toggler z-20 flex h-full min-w-0 items-center gap-x-4 pe-2 max-[350px]:gap-x-2 sm:bg-transparent'>
          <div
            className='flex min-w-0 items-center gap-x-4 overflow-x-auto max-[350px]:gap-x-2'
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className='hidden items-center gap-x-3 sm:flex'>
              <button
                ref={tocAnchorRef}
                title={_('Contents')}
                aria-expanded={isTocOpen}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={handleToggleToc}
              >
                <img
                  src={getToolbarIconSrc('book-toc', themeColor, isDarkMode)}
                  alt=''
                  className='h-6 w-auto object-contain'
                />
              </button>
              <button
                ref={libraryAnchorRef}
                title={_('Library')}
                aria-expanded={isLibraryOpen}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={handleToggleLibrary}
              >
                <img
                  src={getToolbarIconSrc('library', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 w-auto object-contain'
                />
              </button>
              <button
                ref={sparkAnchorRef}
                title={_('Spark')}
                aria-expanded={isSparkOpen}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={handleToggleSpark}
              >
                <img
                  src={getToolbarIconSrc('amply', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 w-auto object-contain'
                />
              </button>
            </div>
            <div className='flex items-center gap-x-4 max-[350px]:gap-x-2 sm:hidden'>
              <button
                title={_('Go home')}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={onGoToLibrary}
              >
                <img
                  src={getToolbarIconSrc('go-home', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 w-auto object-contain'
                />
              </button>
              <BookmarkToggler bookKey={bookKey} />
              <TranslationToggler bookKey={bookKey} />
            </div>
          </div>
        </div>

        <div
          role='contentinfo'
          aria-label={_('Title') + ' - ' + bookTitle}
          className={clsx(
            'header-title z-15 bg-base-100 pointer-events-none hidden flex-1 items-center justify-center sm:flex sm:bg-transparent',
            !windowButtonVisible && 'absolute inset-0',
            isHeaderCompact && '!hidden',
          )}
        >
          <div
            aria-hidden='true'
            className={clsx(
              'line-clamp-1 text-center text-xs font-semibold',
              !windowButtonVisible && 'max-w-[50%]',
            )}
            style={{ color: chromeTextColor }}
          >
            {bookTitle}
          </div>
        </div>

        <div className='header-tools-end bg-base-100 z-20 ms-auto flex h-full min-w-max items-center gap-x-4 ps-2 max-[350px]:gap-x-2 sm:bg-transparent'>
          <div className='hidden items-center gap-x-3 sm:flex'>
            <button
              ref={moreAnchorRef}
              title={_('More')}
              aria-expanded={isMoreOpen}
              className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
              onClick={handleToggleMore}
            >
              <img
                src={getToolbarIconSrc('more-menu', themeColor, isDarkMode)}
                alt=''
                className='h-4 w-auto object-contain'
              />
            </button>
          </div>
          <MorePopover
            bookKey={bookKey}
            isOpen={isMoreOpen}
            anchorEl={moreAnchorRef.current}
            onClose={handleCloseMore}
            onGoHome={onGoToLibrary}
            onOpenThemeFonts={handleThemeFontsOpen}
            onOpenBooknotes={handleOpenBooknotes}
            onOpenAnnotations={handleOpenAnnotations}
          />
          <ToolbarPopover
            isOpen={isThemeFontsOpen}
            anchorEl={moreAnchorRef.current}
            width={THEME_FONTS_WIDTH}
            getPlacement={getThemeFontsPlacement}
            onClose={handleThemeFontsClose}
          >
            <ThemeFontsPanel bookKey={bookKey} />
          </ToolbarPopover>
          <TocPopover
            bookKey={bookKey}
            isOpen={isTocOpen}
            anchorEl={tocAnchorRef.current}
            onClose={() => setIsTocOpen(false)}
          />
          <LibraryPopover
            bookKey={bookKey}
            isOpen={isLibraryOpen}
            anchorEl={libraryAnchorRef.current}
            onClose={handleCloseLibrary}
          />
          <SparkPopover
            isOpen={isSparkOpen}
            anchorEl={sparkAnchorRef.current}
            onClose={handleCloseSpark}
            onToggleTTS={handleToggleTTS}
          />
          <BooknotesPopover
            bookKey={bookKey}
            isOpen={isBooknotesOpen}
            anchorEl={moreAnchorRef.current}
            getPlacement={getBooknotesPlacement}
            onClose={handleCloseBooknotes}
          />
          <AnnotationsPopover
            bookKey={bookKey}
            isOpen={isAnnotationsOpen}
            anchorEl={moreAnchorRef.current}
            getPlacement={getAnnotationsPlacement}
            onClose={handleCloseAnnotations}
          />
          <div className='flex items-center gap-x-4 max-[350px]:gap-x-2 sm:hidden'>
            {!isHeaderCompact && <SettingsToggler bookKey={bookKey} />}
            <NotebookToggler bookKey={bookKey} />
          </div>
          <Dropdown
            label={_('View Options')}
            containerClassName='h-8 sm:hidden'
            className='exclude-title-bar-mousedown dropdown-bottom dropdown-end'
            buttonClassName='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0 mt-0'
            toggleButton={<MdOutlineMenu />}
            onToggle={handleToggleDropdown}
          >
            <ViewMenu
              bookKey={bookKey}
              onShowMetaHashDialog={() => setIsMetaHashDialogOpen(true)}
            />
          </Dropdown>
          {isMetaHashDialogOpen && (
            <ModalPortal showOverlay={false}>
              <SyncInfoDialog
                isOpen={isMetaHashDialogOpen}
                metadata={bookData?.bookDoc?.metadata ?? bookData?.book?.metadata}
                storedMetaHash={bookData?.book?.metaHash}
                lastSyncedAt={lastSyncedAt}
                onClose={() => setIsMetaHashDialogOpen(false)}
              />
            </ModalPortal>
          )}
          <WindowButtons
            className='window-buttons flex items-center'
            headerRef={headerRef}
            showMinimize={bookKeys.length == 1 && windowButtonVisible}
            showMaximize={bookKeys.length == 1 && windowButtonVisible}
            showClose={window.innerWidth < 640 || windowButtonVisible}
            closeButtonLabel={_('Close Book')}
            onClose={() => {
              setHoveredBookKey(null);
              onCloseBook(bookKey);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default HeaderBar;
