import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@/types/book';

const { dispatch, openParallelView, setSideBarBookKey } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  openParallelView: vi.fn(),
  setSideBarBookKey: vi.fn(),
}));
let bookKeys: string[] = [];
let library: Book[] = [];
let currentBookFormat = 'EPUB';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ visibleLibrary: library }),
}));
vi.mock('@/store/readerStore', () => ({ useReaderStore: () => ({ bookKeys }) }));
vi.mock('@/store/sidebarStore', () => ({ useSidebarStore: () => ({ setSideBarBookKey }) }));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData: () => ({ book: { format: currentBookFormat } }) }),
}));
vi.mock('@/app/reader/hooks/useBooksManager', () => ({ default: () => ({ openParallelView }) }));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/components/ModalPortal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import LibraryPopover from '@/app/reader/components/library/LibraryPopover';

const makeBook = (overrides: Partial<Book>): Book =>
  ({
    hash: 'h',
    format: 'EPUB',
    title: 'Untitled',
    author: 'Anonymous',
    createdAt: 0,
    updatedAt: 0,
    downloadedAt: 1,
    ...overrides,
  }) as Book;

const renderPopover = (onClose = vi.fn()) =>
  render(<LibraryPopover bookKey='open1-abc' isOpen anchorEl={document.body} onClose={onClose} />);

beforeEach(() => {
  dispatch.mockReset();
  openParallelView.mockReset();
  setSideBarBookKey.mockReset();
  currentBookFormat = 'EPUB';
  bookKeys = ['open1-abc'];
  library = [
    makeBook({ hash: 'open1', title: 'Zero to One', progress: [6, 100], updatedAt: 10 }),
    makeBook({ hash: 'other1', title: 'Moby-Dick', readingStatus: 'unread', updatedAt: 5 }),
  ];
});

afterEach(cleanup);

describe('LibraryPopover', () => {
  it('renders both segments with the Currently reading heading', () => {
    renderPopover();
    expect(screen.getByText('Currently reading')).toBeTruthy();
    expect(screen.getByTitle('Zero to One')).toBeTruthy();
    expect(screen.getByTitle('Moby-Dick')).toBeTruthy();
  });

  it('focuses an already-open book without prompting', () => {
    const onClose = vi.fn();
    renderPopover(onClose);

    fireEvent.click(screen.getByTitle('Zero to One'));
    expect(setSideBarBookKey).toHaveBeenCalledWith('open1-abc');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('prompts for a book that is not open', () => {
    renderPopover();

    fireEvent.click(screen.getByTitle('Moby-Dick'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(openParallelView).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('opens in parallel when that choice is taken', () => {
    renderPopover();
    fireEvent.click(screen.getByTitle('Moby-Dick'));
    fireEvent.click(screen.getByRole('button', { name: 'Read in parallel' }));

    expect(openParallelView).toHaveBeenCalledWith('other1');
  });

  it('dispatches open-book-single when read-on-its-own is taken', () => {
    renderPopover();
    fireEvent.click(screen.getByTitle('Moby-Dick'));
    fireEvent.click(screen.getByRole('button', { name: 'Read on its own' }));

    expect(dispatch).toHaveBeenCalledWith('open-book-single', { bookHash: 'other1' });
  });

  it('disables parallel when the open book is fixed-layout', () => {
    currentBookFormat = 'PDF';
    renderPopover();
    fireEvent.click(screen.getByTitle('Moby-Dick'));

    const parallel = screen.getByRole('button', { name: 'Read in parallel' }) as HTMLButtonElement;
    expect(parallel.disabled).toBe(true);
  });

  it('disables parallel when the picked book is fixed-layout', () => {
    library = [
      ...library,
      makeBook({ hash: 'cbz1', title: 'Comics', format: 'CBZ', updatedAt: 1 }),
    ];
    renderPopover();
    fireEvent.click(screen.getByTitle('Comics'));

    const parallel = screen.getByRole('button', { name: 'Read in parallel' }) as HTMLButtonElement;
    expect(parallel.disabled).toBe(true);
  });

  it('filters both segments and hides an emptied heading', () => {
    renderPopover();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'moby' } });
    expect(screen.getByTitle('Moby-Dick')).toBeTruthy();
    expect(screen.queryByTitle('Zero to One')).toBeNull();
    expect(screen.queryByText('Currently reading')).toBeNull();
  });

  it('shows an empty line when nothing matches', () => {
    renderPopover();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No books match')).toBeTruthy();
  });
});
