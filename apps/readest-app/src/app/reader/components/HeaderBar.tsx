import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MdOutlineMenu } from 'react-icons/md';

import { Insets } from '@/types/misc';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { useSpatialNavigation } from '@/app/reader/hooks/useSpatialNavigation';
import { getHeaderTriggerHeight, getHorizontalInsetStyle } from '@/utils/insets';
import { getBookDataAttributes } from '@/utils/book';
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
import MarginsPopover, { MARGINS_POPOVER_WIDTH } from './margins/MarginsPopover';
import { MARGINS_OPEN_PANEL_EVENT } from './margins/ClipSheet';
import { MARGINS_OPEN_CARD_EVENT } from '../hooks/useMarginsPainter';
import MorePopover, { MORE_POPOVER_WIDTH } from './MorePopover';
import MoreMenuButton from './MoreMenuButton';
import PinnedMoreMenuButton from './PinnedMoreMenuButton';
import QuickPickSlots from './QuickPickSlots';
import { useMoreActions } from '../hooks/useMoreActions';
import { getToolbarSidePanelPlacement, getToolbarStackedPanelPlacement } from '@/utils/popover';
import type { Rect } from '@/utils/sel';
import { eventDispatcher } from '@/utils/event';
import { getChromeColor, getContrastHex } from '@/styles/themes';
import { getToolbarIconColor, getToolbarIconSrc, isColoredIconTheme } from '@/utils/toolbarIcons';
import { saveSysSettings, saveViewSettings } from '@/helpers/settings';
import { normalizeQuickPicks, placeQuickPick, type QuickPickId } from '@/utils/quickPicks';

const START_SLOT_INDICES = [3];
const END_SLOT_INDICES = [0, 1, 2];

const THEME_FONTS_WIDTH = 300;

type SidePanel = 'themeFonts' | 'booknotes' | 'annotations' | 'margins';

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
  const { envConfig, appService } = useEnv();
  const headerRef = useRef<HTMLDivElement>(null);
  const headerRootRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);
  const { trafficLightInFullscreen, setTrafficLightVisibility } = useTrafficLightStore();
  const { bookKeys, hoveredBookKey } = useReaderStore();
  const { isDarkMode, themeColor, systemUIVisible, statusBarHeight, isIPhoneDuo } = useThemeStore();
  const { isSideBarVisible, getIsSideBarVisible } = useSidebarStore();
  const { getView, getViewState, getViewSettings, setHoveredBookKey } = useReaderStore();
  const { getBookData, getConfig } = useBookDataStore();
  const bookData = getBookData(bookKey);
  const bookConfig = getConfig(bookKey);
  // Readest Cloud's per-book stamps. Includes the PUSH stamps so this agrees
  // with the View menu's sync row, which has always counted them — otherwise
  // the row could read "Synced 2 minutes ago" while this dialog said "Never
  // synced" for the same book.
  const nativeLastSyncedAt =
    Math.max(
      bookConfig?.lastSyncedAtConfig || 0,
      bookConfig?.lastSyncedAtNotes || 0,
      bookConfig?.lastPushedAtConfig || 0,
      bookConfig?.lastPushedAtNotes || 0,
    ) || undefined;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMetaHashDialogOpen, setIsMetaHashDialogOpen] = useState(false);
  const [isThemeFontsOpen, setIsThemeFontsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreAnchorRef = useRef<HTMLButtonElement>(null);
  const [tocAnchorEl, setTocAnchorEl] = useState<HTMLElement | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isBooknotesOpen, setIsBooknotesOpen] = useState(false);
  const [isAnnotationsOpen, setIsAnnotationsOpen] = useState(false);
  const [isMarginsOpen, setIsMarginsOpen] = useState(false);
  const [marginsFocusId, setMarginsFocusId] = useState<string | null>(null);
  const [sidePanelAnchorRect, setSidePanelAnchorRect] = useState<Rect | null>(null);
  const [slotAnchorEl, setSlotAnchorEl] = useState<HTMLElement | null>(null);
  const [isArranging, setIsArranging] = useState(false);
  const { settings } = useSettingsStore();
  const quickPicks = normalizeQuickPicks(settings.readerQuickPicks);
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

  const openContents = (anchor: HTMLElement | null) => {
    setIsMoreOpen(false);
    setTocAnchorEl(anchor);
    handleToggleDropdown(true);
  };

  const handleCloseContents = () => {
    setTocAnchorEl(null);
    handleToggleDropdown(false);
  };

  const handleOpenLibrary = () => {
    setSlotAnchorEl(null);
    setIsMoreOpen(false);
    setIsLibraryOpen(true);
    handleToggleDropdown(true);
  };

  const handleCloseLibrary = () => {
    setIsLibraryOpen(false);
    setSlotAnchorEl(null);
    handleToggleDropdown(false);
  };

  const showSidePanel = (panel: SidePanel) => {
    setIsThemeFontsOpen(panel === 'themeFonts');
    setIsBooknotesOpen(panel === 'booknotes');
    setIsAnnotationsOpen(panel === 'annotations');
    setIsMarginsOpen(panel === 'margins');
    handleToggleDropdown(true);
  };

  const openSidePanel = (panel: SidePanel, anchorRect: Rect) => {
    setSlotAnchorEl(null);
    setSidePanelAnchorRect(anchorRect);
    setIsMoreOpen(true);
    showSidePanel(panel);
  };

  const openSidePanelFromSlot = (panel: SidePanel) => (slot: HTMLElement) => {
    setSlotAnchorEl(slot);
    setSidePanelAnchorRect(null);
    setIsMoreOpen(false);
    showSidePanel(panel);
  };

  const openLibraryFromSlot = (slot: HTMLElement) => {
    setSlotAnchorEl(slot);
    setIsMoreOpen(false);
    setIsLibraryOpen(true);
    handleToggleDropdown(true);
  };

  const handleOpenBooknotes = (anchorRect: Rect) => {
    openSidePanel('booknotes', anchorRect);
  };

  const handleCloseBooknotes = () => {
    setIsBooknotesOpen(false);
    setSlotAnchorEl(null);
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  const handleOpenAnnotations = (anchorRect: Rect) => {
    openSidePanel('annotations', anchorRect);
  };

  const handleCloseAnnotations = () => {
    setIsAnnotationsOpen(false);
    setSlotAnchorEl(null);
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  const handleOpenMargins = (anchorRect: Rect) => {
    setMarginsFocusId(null);
    openSidePanel('margins', anchorRect);
  };

  const handleCloseMargins = () => {
    setIsMarginsOpen(false);
    setMarginsFocusId(null);
    setSlotAnchorEl(null);
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  useEffect(() => {
    const open = (e: CustomEvent) => {
      const anchor =
        headerRef.current?.querySelector<HTMLElement>('[data-quick-pick="margins"]') ??
        moreAnchorRef.current;
      if (e.detail?.bookKey !== bookKey || !anchor) return;
      setMarginsFocusId(e.detail.ids?.[0] ?? null);
      openSidePanelFromSlot('margins')(anchor);
    };
    eventDispatcher.on(MARGINS_OPEN_CARD_EVENT, open);
    eventDispatcher.on(MARGINS_OPEN_PANEL_EVENT, open);
    return () => {
      eventDispatcher.off(MARGINS_OPEN_CARD_EVENT, open);
      eventDispatcher.off(MARGINS_OPEN_PANEL_EVENT, open);
    };
  });

  const handleToggleTTS = () => {
    const ttsEnabled = getViewState(bookKey)?.ttsEnabled;
    eventDispatcher.dispatch(ttsEnabled ? 'tts-stop' : 'tts-speak', { bookKey });
  };

  const handleThemeFontsOpen = (anchorRect: Rect) => {
    openSidePanel('themeFonts', anchorRect);
  };

  const handleThemeFontsClose = () => {
    setIsThemeFontsOpen(false);
    setSlotAnchorEl(null);
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

  const getMarginsPlacement = useCallback(
    (anchorRect: Rect, viewport: Rect) =>
      getToolbarSidePanelPlacement(
        anchorRect,
        viewport,
        MORE_POPOVER_WIDTH,
        MARGINS_POPOVER_WIDTH,
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

  const isReadingRulerActive = !!getViewSettings(bookKey)?.readingRulerEnabled;
  const handleCloseReadingRuler = () => {
    saveViewSettings(envConfig, bookKey, 'readingRulerEnabled', false, false, false);
  };

  const handleCloseMore = () => {
    setIsMoreOpen(false);
    handleToggleDropdown(false);
  };

  const slotActions = useMoreActions({
    bookKey,
    anchorEl: null,
    onDone: () => {},
    onOpenLibrary: openLibraryFromSlot,
    onOpenContents: openContents,
    onOpenThemeFonts: openSidePanelFromSlot('themeFonts'),
    onOpenAnnotations: openSidePanelFromSlot('annotations'),
    onOpenMargins: openSidePanelFromSlot('margins'),
    onOpenBooknotes: openSidePanelFromSlot('booknotes'),
    onToggleTTS: handleToggleTTS,
  });

  const handlePlaceQuickPick = (id: QuickPickId, index: number) => {
    saveSysSettings(envConfig, 'readerQuickPicks', placeQuickPick(quickPicks, id, index));
  };

  const handleRemoveQuickPick = (index: number) => {
    saveSysSettings(
      envConfig,
      'readerQuickPicks',
      quickPicks.map((slot, i) => (i === index ? null : slot)),
    );
  };

  const panelAnchorEl = slotAnchorEl ?? moreAnchorRef.current;

  useEffect(() => {
    if (!appService?.hasTrafficLight) return;

    if (hoveredBookKey === bookKey && isTopLeft) {
      setTrafficLightVisibility(true);
      return;
    }
    if (hoveredBookKey) return;
    // The hide is deferred so a pointer crossing from one hover target to the
    // next doesn't flash the buttons off. Cancel it on unmount: closing the
    // last book writes `hoveredBookKey = null` and then routes to the library,
    // so an uncancelled timer comes due after the library header has already
    // asked for the buttons and hides them there (#6222). `getIsSideBarVisible`
    // is why an open sidebar masked this — it short-circuits the same hide.
    const timeout = setTimeout(() => {
      if (!getIsSideBarVisible()) {
        setTrafficLightVisibility(false);
      }
    }, 100);
    return () => clearTimeout(timeout);
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
  const quickPickSlotProps = {
    slots: quickPicks,
    actions: slotActions,
    colored: isColoredIconTheme(themeColor, isDarkMode),
    isArranging,
    onPlace: handlePlaceQuickPick,
    onArrangeChange: setIsArranging,
    onRemove: handleRemoveQuickPick,
  };

  const isHeaderVisible = hoveredBookKey === bookKey || isDropdownOpen || isArranging;
  const isMobile = appService?.isMobile || window.innerWidth < 640;
  const viewSettings = getViewSettings(bookKey);
  const triggerHeight = viewSettings ? getHeaderTriggerHeight(gridInsets.top, viewSettings) : 0;

  useSpatialNavigation(headerRef, isHeaderVisible);
  const trafficLightInHeader =
    appService?.hasTrafficLight && !trafficLightInFullscreen && !isSideBarVisible && isTopLeft;
  const windowButtonVisible =
    appService?.hasWindowBar && !isTrafficLightVisible && !trafficLightInHeader;

  return (
    <div
      ref={headerRootRef}
      className={clsx(
        // pointer-events-none: the wrapper is as tall as its safe-area
        // padding, so on notch devices its box covers the top inset strip and
        // swallowed long presses on text rendered there (#5429) — children
        // that take input restore pointer-events themselves.
        'pointer-events-none left-0 top-0 w-full',
        isHeaderVisible && 'bg-base-100',
        window.innerWidth < 640 ? 'fixed z-20' : 'absolute',
      )}
      style={{
        paddingTop: appService?.hasSafeAreaInset ? `${insets.top}px` : '0px',
      }}
    >
      {/*
        Hover trigger area. Mobile has no hover and toggles the bars by tapping
        the page (usePagination), so this must not take pointer events there —
        it used to be a fixed 44px tall, the same as the default page-header
        margin, so with the page header off (compact 16px margin) it covered the
        first line of text and swallowed long presses on it (#5429). Mirrors the
        footer's trigger. Its height now tracks the content top on every
        platform, so the strip can never reach past where the text starts and
        block a selection (#4977).
      */}
      <div
        role='none'
        tabIndex={-1}
        className={clsx(
          'absolute top-0 z-10 w-full',
          isMobile || pointerInDoc ? 'pointer-events-none' : 'pointer-events-auto',
        )}
        style={{ height: `${triggerHeight}px` }}
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
          // iPhone Duo's status-bar strip reports as a large left/right inset
          // (#6307); clear it without losing the header's own ps-4/pr-4 padding.
          ...getHorizontalInsetStyle(insets, isIPhoneDuo, 16),
        }}
        onFocus={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onMouseLeave={(e) => {
          if (!appService?.isMobile && isMouseOutsideHeader(e.clientX, e.clientY)) {
            setHoveredBookKey('');
          }
        }}
      >
        <div className='header-tools-start bg-base-100 sidebar-bookmark-toggler z-20 flex h-full min-w-0 items-center gap-x-4 pe-2 max-[350px]:gap-x-2 sm:bg-transparent'>
          <div className='no-scrollbar flex h-full min-w-0 items-center gap-x-4 overflow-x-auto max-[350px]:gap-x-2'>
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
          <div className='hidden items-center sm:flex'>
            <QuickPickSlots {...quickPickSlotProps} indices={START_SLOT_INDICES} />
          </div>
        </div>

        <div
          role='contentinfo'
          aria-label={_('Title') + ' - ' + bookTitle}
          className={clsx(
            'header-title z-15 bg-base-100 pointer-events-none hidden flex-1 items-center justify-center sm:flex sm:bg-transparent',
            !windowButtonVisible && 'absolute inset-0',
            isHeaderCompact && 'hidden!',
          )}
          {...getBookDataAttributes(bookTitle, bookData?.book?.metadata)}
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
            <QuickPickSlots {...quickPickSlotProps} indices={END_SLOT_INDICES} />
            <MoreMenuButton
              ref={moreAnchorRef}
              isReadingRulerActive={isReadingRulerActive}
              isMoreOpen={isMoreOpen}
              iconColor={getToolbarIconColor(themeColor, isDarkMode)}
              onToggleMore={handleToggleMore}
              onCloseReadingRuler={handleCloseReadingRuler}
            />
          </div>
          <MorePopover
            bookKey={bookKey}
            isOpen={isMoreOpen}
            anchorEl={moreAnchorRef.current}
            onClose={handleCloseMore}
            onGoHome={onGoToLibrary}
            onOpenLibrary={handleOpenLibrary}
            onOpenContents={() => openContents(moreAnchorRef.current)}
            onOpenThemeFonts={handleThemeFontsOpen}
            onOpenBooknotes={handleOpenBooknotes}
            onOpenAnnotations={handleOpenAnnotations}
            onOpenMargins={handleOpenMargins}
            onToggleTTS={handleToggleTTS}
            isArranging={isArranging}
            onArrangeChange={setIsArranging}
          />
          <ToolbarPopover
            isOpen={isThemeFontsOpen}
            anchorEl={panelAnchorEl}
            width={THEME_FONTS_WIDTH}
            getPlacement={slotAnchorEl ? undefined : getThemeFontsPlacement}
            onClose={handleThemeFontsClose}
          >
            <ThemeFontsPanel bookKey={bookKey} />
          </ToolbarPopover>
          <TocPopover
            bookKey={bookKey}
            isOpen={tocAnchorEl !== null}
            anchorEl={tocAnchorEl}
            onClose={handleCloseContents}
          />
          <LibraryPopover
            bookKey={bookKey}
            isOpen={isLibraryOpen}
            anchorEl={panelAnchorEl}
            onClose={handleCloseLibrary}
          />
          <BooknotesPopover
            bookKey={bookKey}
            isOpen={isBooknotesOpen}
            anchorEl={panelAnchorEl}
            getPlacement={slotAnchorEl ? undefined : getBooknotesPlacement}
            onClose={handleCloseBooknotes}
          />
          <AnnotationsPopover
            bookKey={bookKey}
            isOpen={isAnnotationsOpen}
            anchorEl={panelAnchorEl}
            getPlacement={slotAnchorEl ? undefined : getAnnotationsPlacement}
            onClose={handleCloseAnnotations}
          />
          <MarginsPopover
            bookKey={bookKey}
            isOpen={isMarginsOpen}
            anchorEl={panelAnchorEl}
            getPlacement={slotAnchorEl ? undefined : getMarginsPlacement}
            focusId={marginsFocusId}
            onClose={handleCloseMargins}
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
                bookKey={bookKey}
                metadata={bookData?.bookDoc?.metadata ?? bookData?.book?.metadata}
                storedMetaHash={bookData?.book?.metaHash}
                nativeLastSyncedAt={nativeLastSyncedAt}
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
      <PinnedMoreMenuButton
        containerRef={headerRootRef}
        anchorRef={moreAnchorRef}
        isHeaderVisible={isHeaderVisible}
        isReadingRulerActive={isReadingRulerActive}
        iconColor={getToolbarIconColor(themeColor, isDarkMode)}
        onToggleMore={handleToggleMore}
        onCloseReadingRuler={handleCloseReadingRuler}
      />
    </div>
  );
};

export default HeaderBar;
