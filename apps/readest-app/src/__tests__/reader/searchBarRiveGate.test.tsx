import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SearchBar from '@/app/reader/components/sidebar/SearchBar';
import type { SystemSettings } from '@/types/settings';

let mockSettings: Partial<SystemSettings> = {};
let mockIsEink = false;

vi.mock('@/app/reader/components/sidebar/SearchBarRive', () => ({
  default: () => <div data-testid='rive-canvas' />,
}));

vi.mock('@/app/reader/components/sidebar/SearchFilter', () => ({
  default: () => null,
}));

vi.mock('@/components/ToolbarPopover', () => ({
  default: () => null,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobile: true } }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: mockSettings }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ book: { primaryLanguage: 'en' } }),
    getConfig: () => ({ searchConfig: { mode: 'text', scope: 'book' } }),
    setConfig: vi.fn(),
    saveConfig: vi.fn(),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => ({ search: vi.fn(), clearSearch: vi.fn() }),
    getProgress: () => ({ section: { current: 0 } }),
    getViewSettings: () => ({ isEink: mockIsEink }),
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    setSearchTerm: vi.fn(),
    setSearchResults: vi.fn(),
    setSearchProgress: vi.fn(),
    setSearchError: vi.fn(),
    getSearchNavState: () => ({ searchTerm: '', searchError: null }),
    getSearchStatus: () => 'idle',
    setSearchStatus: vi.fn(),
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'default', isDarkMode: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useCaretLookX', () => ({
  useCaretLookX: () => ({ lookX: 0, isTyping: false }),
}));

vi.mock('@/utils/toolbarIcons', () => ({
  getToolbarIconSrc: () => '',
}));

const renderSearchBar = () =>
  render(<SearchBar isVisible={true} bookKey='book-1' onHideSearchBar={vi.fn()} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockSettings = {};
  mockIsEink = false;
});

describe('SearchBar Rive gate', () => {
  it('mounts the Rive canvas when animations are enabled', () => {
    mockSettings = { uiAnimationsEnabled: true };
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).not.toBeNull();
  });

  it('does not mount the Rive canvas when animations are disabled', () => {
    mockSettings = { uiAnimationsEnabled: false };
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).toBeNull();
  });

  it('does not mount the Rive canvas when unset and the OS prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true } as MediaQueryList));
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).toBeNull();
  });

  it('never mounts the Rive canvas in eink mode even with animations enabled', () => {
    mockSettings = { uiAnimationsEnabled: true };
    mockIsEink = true;
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).toBeNull();
  });
});
