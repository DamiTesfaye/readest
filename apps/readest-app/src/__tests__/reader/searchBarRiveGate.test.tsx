import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SearchBar from '@/app/reader/components/sidebar/SearchBar';
import type { SystemSettings } from '@/types/settings';

let mockSettings: Partial<SystemSettings> = {};
let mockIsEink = false;
let mockPupLoaded = false;

vi.mock('@/app/reader/components/sidebar/SearchBarRive', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({ onLoadedChange }: { onLoadedChange: (loaded: boolean) => void }) => {
      useEffect(() => {
        onLoadedChange(mockPupLoaded);
      }, [onLoadedChange]);
      return <div data-testid='rive-canvas' />;
    },
  };
});

vi.mock('@/app/reader/components/sidebar/SearchFilter', () => ({
  default: () => null,
}));

vi.mock('@/components/ToolbarPopover', () => ({
  default: () => null,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { isMobile: true, deleteDir: vi.fn(async () => {}) },
  }),
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
  mockPupLoaded = false;
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

describe('SearchBar pill', () => {
  const pill = () => screen.getByRole('textbox').parentElement!;

  it('draws a plain CSS pill while the pup has not loaded', () => {
    mockSettings = { uiAnimationsEnabled: true };
    renderSearchBar();
    expect(pill().className).toContain('bg-white');
    expect(pill().className).toContain('border-[#353535]');
  });

  it('draws a plain CSS pill when there is no pup', () => {
    mockSettings = { uiAnimationsEnabled: false };
    renderSearchBar();
    expect(pill().className).toContain('bg-white');
    expect(pill().className).toContain('h-full');
  });

  it('keeps the e-ink border when there is no pup', () => {
    mockSettings = { uiAnimationsEnabled: true };
    mockIsEink = true;
    renderSearchBar();
    expect(pill().className).toContain('eink-bordered');
  });

  it('draws nothing of its own once the pup is loaded and overlays the input on the pill in the file', () => {
    mockSettings = { uiAnimationsEnabled: true };
    mockPupLoaded = true;
    renderSearchBar();
    const classes = pill().className;
    expect(classes).not.toContain('bg-white');
    expect(classes).not.toContain('border-');
    expect(classes).toContain('rounded-full');
    expect(classes).toContain('focus-within:ring-2');
    expect(classes).toContain('left-[1.66%]');
    expect(classes).toContain('w-[89.37%]');
    expect(classes).toContain('h-[42.86%]');
    expect(screen.getByRole('textbox').className).toContain('bg-transparent');
  });
});
