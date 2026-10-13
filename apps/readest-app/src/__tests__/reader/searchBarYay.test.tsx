import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SearchBar from '@/app/reader/components/sidebar/SearchBar';
import { useSidebarStore } from '@/store/sidebarStore';

const BOOK_KEY = 'book-1';

interface FilterProps {
  searchConfig: unknown;
  onSearchConfigChanged: (config: unknown) => void;
}

const searchMock = vi.hoisted(() => ({
  hits: {} as Record<string, number>,
  seen: [] as boolean[],
}));

vi.mock('@/app/reader/components/sidebar/SearchBarRive', () => ({
  default: ({ hasResults, isEmpty }: { hasResults: boolean; isEmpty: boolean }) => {
    searchMock.seen.push(hasResults);
    return (
      <div
        data-testid='rive-pup'
        data-has-results={String(hasResults)}
        data-is-empty={String(isEmpty)}
      />
    );
  },
}));

vi.mock('@/app/reader/components/sidebar/SearchFilter', () => ({
  default: ({ searchConfig, onSearchConfigChanged }: FilterProps) => (
    <button onClick={() => onSearchConfigChanged(searchConfig)}>rerun</button>
  ),
}));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      isMobile: true,
      exists: async () => false,
      createDir: vi.fn(),
      writeFile: vi.fn(),
      deleteDir: vi.fn(async () => {}),
    },
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { uiAnimationsEnabled: true } }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ book: { primaryLanguage: 'en' } }),
    getConfig: () => ({ searchConfig: { mode: 'text', scope: 'book' } }),
    setConfig: vi.fn(),
    saveConfig: vi.fn(),
  }),
}));

vi.mock('@/services/librarySearchService', () => ({
  createLibrarySearchSession: () => ({ close: async () => {} }),
  resolveSearchResultCfis: async (_session: unknown, _book: unknown, locators: unknown[]) =>
    locators.map((_, i) => ({ cfi: `cfi-${i}` })),
  searchLibraryBooks: (_appService: unknown, _books: unknown, query: string) =>
    (async function* () {
      const count = searchMock.hits[query] ?? 0;
      if (count > 0) {
        yield {
          type: 'result',
          result: {
            index: 0,
            label: 'Chapter',
            subitems: Array.from({ length: count }, (_, i) => ({
              locator: { section: 0, start: i, end: i + 1 },
              excerpt: { pre: '', match: query, post: '' },
            })),
          },
        };
      }
      yield { type: 'book-completed' };
    })(),
}));

const view = {
  search: () =>
    (async function* () {
      yield 'done';
    })(),
  clearSearch: vi.fn(),
};

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => view,
    getProgress: () => ({ section: { current: 0 } }),
    getViewSettings: () => ({ isEink: false }),
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'default', isDarkMode: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));
vi.mock('@/utils/toolbarIcons', () => ({ getToolbarIconSrc: () => '' }));

vi.spyOn(console, 'log').mockImplementation(() => {});

const hasResults = () => screen.getByTestId('rive-pup').dataset['hasResults'];
const isEmpty = () => screen.getByTestId('rive-pup').dataset['isEmpty'];
const input = () => screen.getByRole('textbox') as HTMLInputElement;
const typeQuery = (value: string) => fireEvent.change(input(), { target: { value } });

beforeEach(() => {
  searchMock.hits = { ophelia: 3, laertes: 2 };
  searchMock.seen = [];
  localStorage.clear();
  useSidebarStore.getState().clearSearch(BOOK_KEY);
  render(<SearchBar isVisible={true} bookKey={BOOK_KEY} onHideSearchBar={vi.fn()} />);
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
});

describe('SearchBar pup yay', () => {
  it('stays idle on focus and while typing', async () => {
    fireEvent.focus(input());
    expect(hasResults()).toBe('false');
    typeQuery('ophel');
    expect(hasResults()).toBe('false');
  });

  it('yays once a search completes with results', async () => {
    typeQuery('ophelia');
    expect(hasResults()).toBe('false');
    await waitFor(() => expect(hasResults()).toBe('true'), { timeout: 2000 });
  });

  it('stays idle when a search completes with no results', async () => {
    typeQuery('nothing here');
    await waitFor(
      () => expect(useSidebarStore.getState().getSearchStatus(BOOK_KEY)).toBe('completed'),
      {
        timeout: 2000,
      },
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(hasResults()).toBe('false');
  });

  it('clears the yay as soon as the query changes or is cleared', async () => {
    typeQuery('ophelia');
    await waitFor(() => expect(hasResults()).toBe('true'), { timeout: 2000 });

    typeQuery('opheliaz');
    expect(hasResults()).toBe('false');

    typeQuery('laertes');
    await waitFor(() => expect(hasResults()).toBe('true'), { timeout: 2000 });

    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(hasResults()).toBe('false');
  });

  it('yays again when a filter change re-runs the same query', async () => {
    typeQuery('ophelia');
    await waitFor(() => expect(hasResults()).toBe('true'), { timeout: 2000 });
    searchMock.seen = [];

    fireEvent.click(screen.getByLabelText('Filter'));
    fireEvent.click(screen.getByText('rerun'));
    await waitFor(() => expect(searchMock.seen).toContain(false), { timeout: 2000 });
    await waitFor(() => expect(searchMock.seen.at(-1)).toBe(true), { timeout: 2000 });
  });

  it('tells the pup whether the field is empty as the user types and clears', async () => {
    expect(isEmpty()).toBe('true');
    typeQuery('o');
    expect(isEmpty()).toBe('false');
    typeQuery('');
    expect(isEmpty()).toBe('true');

    typeQuery('ophelia');
    expect(isEmpty()).toBe('false');
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(isEmpty()).toBe('true');
  });

  it('counts any character as text, whitespace included', async () => {
    typeQuery(' ');
    expect(isEmpty()).toBe('false');
  });

  it('keeps the search input clickable and typeable beside the pup', async () => {
    fireEvent.click(input());
    typeQuery('ophelia');
    expect(input().value).toBe('ophelia');
  });
});
