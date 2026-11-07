import type React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HeaderBar from '@/app/reader/components/HeaderBar';
import { MARGINS_OPEN_CARD_EVENT } from '@/app/reader/hooks/useMarginsPainter';
import { eventDispatcher } from '@/utils/event';

// jsdom ships no ResizeObserver, and both HeaderBar and useTrafficLight
// construct one. `observe()` is a no-op here: the traffic-light hook falls
// back to the store's standard h-11 height when the observer never fires,
// which is all this test needs.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// The store reaches the window API through `await import('@tauri-apps/api/window')`,
// so stub the IPC bridge it talks to rather than the module: the app is windowed,
// never fullscreen, and its fullscreen listeners never fire.
(globalThis as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
  invoke: async (cmd: string) => (cmd === 'plugin:window|is_fullscreen' ? false : 0),
  transformCallback: () => 0,
  convertFileSrc: (src: string) => src,
};
(globalThis as unknown as Record<string, unknown>)['__TAURI_EVENT_PLUGIN_INTERNALS__'] = {
  unregisterListener: () => {},
};

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const appService = { isMobile: false, hasTrafficLight: true, hasWindowBar: false };
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: { globalReadSettings: { highlightStyle: 'highlight', highlightStyles: {} } },
  }),
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false, systemUIVisible: true, statusBarHeight: 0 }),
}));
// The reader is showing a single book with the sidebar closed — the state in
// which HeaderBar owns the traffic lights and hides them when unhovered.
vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ isSideBarVisible: false, getIsSideBarVisible: () => false }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    bookKeys: ['book-1'],
    hoveredBookKey: null,
    getView: () => null,
    getViewSettings: () => ({ enableAnnotationQuickActions: false }),
    setHoveredBookKey: vi.fn(),
  }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData: () => null, getConfig: () => null }),
}));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (n: number) => n }));
vi.mock('@/app/reader/hooks/useSpatialNavigation', () => ({ useSpatialNavigation: () => {} }));
vi.mock('@/utils/insets', () => ({
  getHeaderTriggerHeight: () => 0,
  getHorizontalInsetStyle: () => ({}),
}));
vi.mock('@/helpers/settings', () => ({ saveViewSettings: vi.fn() }));
vi.mock('@/app/reader/components/SidebarToggler', () => ({ default: () => null }));
vi.mock('@/app/reader/components/BookmarkToggler', () => ({ default: () => null }));
vi.mock('@/app/reader/components/NotebookToggler', () => ({ default: () => null }));
vi.mock('@/app/reader/components/TranslationToggler', () => ({ default: () => null }));
vi.mock('@/app/reader/components/ViewMenu', () => ({ default: () => null }));
vi.mock('@/app/reader/components/SyncInfoDialog', () => ({ default: () => null }));
vi.mock('@/components/WindowButtons', () => ({ default: () => null }));
vi.mock('@/components/Dropdown', () => ({ default: () => null }));
vi.mock('@/components/ModalPortal', () => ({ default: () => null }));
vi.mock('@/components/ToolbarPopover', () => ({ default: () => null }));
vi.mock('@/components/themefonts/ThemeFontsPanel', () => ({ default: () => null }));
vi.mock('@/app/reader/components/SettingsToggler', () => ({ default: () => null }));
vi.mock('@/app/reader/components/TocPopover', () => ({ default: () => null }));
vi.mock('@/app/reader/components/library/LibraryPopover', () => ({ default: () => null }));
vi.mock('@/app/reader/components/booknotes/BooknotesPopover', () => ({
  default: () => null,
  BOOKNOTES_POPOVER_WIDTH: 320,
}));
vi.mock('@/app/reader/components/booknotes/AnnotationsPopover', () => ({
  default: () => null,
  ANNOTATIONS_POPOVER_WIDTH: 320,
}));
const marginsPopover = vi.hoisted(() => ({
  props: null as { isOpen: boolean; anchorEl: HTMLElement | null } | null,
}));
vi.mock('@/app/reader/components/margins/MarginsPopover', () => ({
  default: (props: { isOpen: boolean; anchorEl: HTMLElement | null }) => {
    marginsPopover.props = props;
    return null;
  },
  MARGINS_POPOVER_WIDTH: 320,
}));
vi.mock('@/app/reader/components/MorePopover', () => ({
  default: () => null,
  MORE_POPOVER_WIDTH: 320,
}));
vi.mock('@/app/reader/components/QuickPickSlots', () => ({
  default: ({ indices }: { indices: number[] }) =>
    indices.includes(0) ? (
      <button type='button' data-quick-pick='margins'>
        Margins slot
      </button>
    ) : null,
}));
vi.mock('@/app/reader/components/MoreMenuButton', () => ({
  default: ({ ref }: { ref?: React.Ref<HTMLButtonElement> }) => (
    <button type='button' ref={ref}>
      More
    </button>
  ),
}));
vi.mock('@/app/reader/components/PinnedMoreMenuButton', () => ({ default: () => null }));
vi.mock('@/app/reader/components/margins/PublicMarginsHost', () => ({ default: () => null }));

const insets = { top: 0, right: 0, bottom: 0, left: 0 };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  marginsPopover.props = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Margins popover anchor', () => {
  it('points at the pinned Margins slot when a marker opens a card', async () => {
    render(
      <HeaderBar
        bookKey='book-1'
        bookTitle='Book'
        isTopLeft={true}
        isHoveredAnim={false}
        gridInsets={insets}
        screenInsets={insets}
        onCloseBook={vi.fn()}
        onGoToLibrary={vi.fn()}
      />,
    );
    await act(async () => {
      await eventDispatcher.dispatch(MARGINS_OPEN_CARD_EVENT, { bookKey: 'book-1', ids: ['m1'] });
    });
    expect(marginsPopover.props?.isOpen).toBe(true);
    expect(marginsPopover.props?.anchorEl).toBe(screen.getByText('Margins slot'));
  });
});
