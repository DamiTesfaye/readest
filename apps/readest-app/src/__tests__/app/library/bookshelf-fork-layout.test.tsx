import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Book, BooksGroup } from '@/types/book';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { DEFAULT_SYSTEM_SETTINGS as partialSettings } from '@/services/constants';
import type { SystemSettings } from '@/types/settings';
import Bookshelf from '@/app/library/components/Bookshelf';

const DEFAULT_SYSTEM_SETTINGS = partialSettings as SystemSettings;

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: vi.fn(), replace: vi.fn() },
  servers: [],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.params,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {}, appService: null }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (n: number) => n }));
vi.mock('@/app/library/hooks/useSpatialNavigation', () => ({ useSpatialNavigation: () => {} }));
vi.mock('@/app/library/hooks/useOpenBook', () => ({ useOpenBook: () => ({ openBook: vi.fn() }) }));
vi.mock('@/store/absServerStore', () => ({
  useABSServerStore: () => mocks.servers,
  isAbsBookOrphaned: (book: Book) => book.hash === 'orphan',
}));
vi.mock('overlayscrollbars-react', () => ({
  useOverlayScrollbars: () => [() => {}, () => undefined],
}));
vi.mock('@/app/library/components/ShareBookDialog', () => ({ default: () => null }));
vi.mock('@/app/library/components/SelectModeActions', () => ({ default: () => null }));
vi.mock('@/app/library/components/BookshelfStream', () => ({
  default: () => <div data-testid='bookshelf-stream' />,
}));
vi.mock('@/app/library/components/RecentShelf', () => ({
  RECENT_SHELF_BOOK_COUNT: 12,
  default: ({
    books,
    transferProgress,
  }: {
    books: Book[];
    transferProgress: Record<string, number>;
  }) => (
    <section
      data-testid='recent-shelf'
      data-transfer={JSON.stringify(transferProgress)}
      aria-label='Currently Reading'
    >
      {books.map((book) => (
        <span key={book.hash}>{book.title}</span>
      ))}
    </section>
  ),
}));
vi.mock('@/app/library/components/BookshelfItem', () => ({
  default: ({ item, mode }: { item: Book | BooksGroup; mode: string }) => (
    <div data-testid='bookshelf-item' data-mode={mode}>
      {'hash' in item ? item.title : item.name}
    </div>
  ),
}));
vi.mock('react-virtuoso', () => {
  type Props = {
    totalCount: number;
    itemContent: (index: number) => React.ReactNode;
    context?: unknown;
    components?: {
      List?: React.ElementType;
      Header?: React.ElementType;
    };
  };
  const renderAll = ({ totalCount, itemContent, context, components }: Props) => {
    const List = components?.List ?? 'div';
    const Header = components?.Header;
    return (
      <div>
        {Header && <Header context={context} />}
        <List context={context} data-testid='bookshelf-list'>
          {Array.from({ length: totalCount }, (_, index) => (
            <div key={index}>{itemContent(index)}</div>
          ))}
        </List>
      </div>
    );
  };
  return { Virtuoso: renderAll, VirtuosoGrid: renderAll };
});

const book = (hash: string, progress?: [number, number]): Book => ({
  hash,
  title: `Book ${hash}`,
  author: 'Writer',
  format: 'EPUB',
  createdAt: Number(hash) || 1,
  updatedAt: Number(hash) || 1,
  ...(progress ? { progress } : {}),
});

const books: Book[] = [book('1', [3, 100]), book('2', [33, 100]), book('3'), book('orphan')];

const noop = () => {};
const props = {
  libraryBooks: books,
  isSelectMode: false,
  isSelectAll: false,
  isSelectNone: false,
  onScrollerRef: noop,
  handleBookDownload: async () => true,
  handleBookUpload: async () => true,
  handleBookDelete: async () => true,
  handleBookPurge: async () => true,
  handleSetSelectMode: noop,
  handleShowDetailsBook: noop,
  handleLibraryNavigation: noop,
  handlePushLibrary: async () => {},
  booksTransferProgress: { '1': 40 },
  contentSearch: null,
  onSearchContents: noop,
};

beforeEach(() => {
  mocks.params = new URLSearchParams();
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      libraryGroupBy: 'none',
      libraryViewMode: 'grid',
      libraryAutoColumns: true,
      libraryRecentShelfEnabled: true,
    },
  });
  useLibraryStore.setState({ library: books, selectedBooks: new Set() });
});

afterEach(cleanup);

describe('fork library layout', () => {
  it('renders the fork grid with the Currently Reading shelf, not the upstream bookshelf stream', () => {
    render(<Bookshelf {...props} />);
    expect(screen.queryByTestId('bookshelf-stream')).toBeNull();
    const recent = screen.getByTestId('recent-shelf');
    expect(within(recent).getByText('Book 1')).toBeTruthy();
    expect(within(recent).getByText('Book 2')).toBeTruthy();
    expect(within(recent).queryByText('Book 3')).toBeNull();
    const list = screen.getByTestId('bookshelf-list');
    expect(list.className).toContain('xl:grid-cols-4');
    const items = within(list).getAllByTestId('bookshelf-item');
    expect(items.map((el) => el.textContent).sort()).toEqual(['Book 1', 'Book 2', 'Book 3']);
    expect(items.every((el) => el.dataset['mode'] === 'grid')).toBe(true);
  });

  it('hides the Currently Reading shelf under a status filter and filters the grid', () => {
    mocks.params = new URLSearchParams('status=reading');
    render(<Bookshelf {...props} />);
    expect(screen.queryByTestId('recent-shelf')).toBeNull();
    const titles = screen.getAllByTestId('bookshelf-item').map((el) => el.textContent);
    expect(titles.sort()).toEqual(['Book 1', 'Book 2']);
  });

  it('hides the Currently Reading shelf when turned off in the view menu', () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, libraryRecentShelfEnabled: false },
    });
    render(<Bookshelf {...props} />);
    expect(screen.queryByTestId('recent-shelf')).toBeNull();
  });

  it('passes direct download progress to the Currently Reading shelf', () => {
    render(<Bookshelf {...props} />);
    expect(JSON.parse(screen.getByTestId('recent-shelf').dataset['transfer'] ?? '{}')).toEqual({
      '1': 40,
    });
  });
});
