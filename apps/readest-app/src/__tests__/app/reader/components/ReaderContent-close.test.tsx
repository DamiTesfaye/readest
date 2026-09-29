import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemSettings } from '@/types/settings';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({
  onCloseWindow: null as (() => unknown) | null,
  releaseFlush: () => {},
  flushed: false,
  saveSettings: vi.fn(async () => {}),
}));

const Empty = () => null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => null,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {}, appService: {} }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/services/environment', () => ({
  default: {},
  isTauriAppPlatform: () => true,
}));
vi.mock('@/utils/window', () => ({
  tauriHandleClose: vi.fn(),
  tauriHandleOnCloseWindow: (callback: () => unknown) => {
    h.onCloseWindow = callback;
    return Promise.resolve(() => {});
  },
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@/services/mindmap/sync/lifecycle', () => ({
  flushMindmapSync: () =>
    new Promise<void>((resolve) => {
      h.releaseFlush = () => {
        h.flushed = true;
        resolve();
      };
    }),
}));
vi.mock('@/store/settingsStore', () => {
  const state = {
    settings: {} as SystemSettings,
    saveSettings: h.saveSettings,
    isSettingsDialogOpen: false,
    settingsDialogBookKey: '',
  };
  return { useSettingsStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock('@/store/readerStore', () => {
  const state = {
    getView: vi.fn(),
    setBookKeys: vi.fn(),
    getViewSettings: vi.fn(),
    initViewState: vi.fn(),
    getViewState: vi.fn(),
    clearViewState: vi.fn(),
  };
  return { useReaderStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getConfig: vi.fn(), getBookData: vi.fn(), saveConfig: vi.fn() }),
}));
vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ sideBarBookKey: null, setSideBarBookKey: vi.fn() }),
}));
vi.mock('@/store/parallelViewStore', () => ({
  useParallelViewStore: () => ({ unsetParallel: vi.fn() }),
}));
vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({
    bookKeys: [],
    dismissBook: vi.fn(),
    getNextBookKey: vi.fn(),
    openBookInReader: vi.fn(),
  }),
}));
vi.mock('@/app/reader/hooks/useBookShortcuts', () => ({ default: () => {} }));
vi.mock('@/hooks/useGamepad', () => ({ useGamepad: () => {} }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/helpers/openWith', () => ({ parseOpenWithFiles: vi.fn() }));
vi.mock('@/utils/nav', () => ({
  closeReaderWindowOrGoToLibrary: vi.fn(),
  ensureMainLibraryWindow: vi.fn(),
  navigateToLibrary: vi.fn(),
}));
vi.mock('@/utils/discord', () => ({ clearDiscordPresence: vi.fn() }));
vi.mock('@/components/metadata', () => ({ BookDetailModal: Empty }));
vi.mock('@/app/library/components/ShareBookDialog', () => ({ default: Empty }));
vi.mock('@/components/Spinner', () => ({ default: Empty }));
vi.mock('@/components/settings/SettingsDialog', () => ({ default: Empty }));
vi.mock('@/app/reader/components/sidebar/SideBar', () => ({ default: Empty }));
vi.mock('@/app/reader/components/notebook/Notebook', () => ({ default: Empty }));
vi.mock('@/app/reader/components/mindmap/MindmapView', () => ({ default: Empty }));
vi.mock('@/app/reader/components/mindmap/useMindmapActions', () => ({
  useMindmapActions: () => ({}),
}));
vi.mock('@/app/reader/components/BooksGrid', () => ({ default: Empty }));

const { default: ReaderContent } = await import('@/app/reader/components/ReaderContent');

const settledAfterFlush = async (closing: Promise<unknown>): Promise<boolean[]> => {
  let settled = false;
  void closing.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const before = settled;
  h.releaseFlush();
  await closing;
  return [before, h.flushed];
};

beforeEach(() => {
  h.onCloseWindow = null;
  h.flushed = false;
  h.saveSettings.mockClear();
  render(<ReaderContent settings={{} as SystemSettings} />);
});

afterEach(() => {
  cleanup();
});

describe('ReaderContent close and quit', () => {
  it('lets the window close wait for the mind map flush', async () => {
    expect(h.onCloseWindow).not.toBeNull();
    const closing = Promise.resolve(h.onCloseWindow!());
    expect(await settledAfterFlush(closing)).toEqual([false, true]);
    expect(h.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('lets quitting the app wait for the mind map flush', async () => {
    const quitting = eventDispatcher.dispatch('quit-app');
    expect(await settledAfterFlush(quitting)).toEqual([false, true]);
    expect(h.saveSettings).toHaveBeenCalledTimes(1);
  });
});
