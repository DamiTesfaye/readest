import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookNote } from '@/types/book';

const {
  dispatch,
  goTo,
  saveConfig,
  updateBooknotes,
  writeTextToClipboard,
  setNotebookEditAnnotation,
  setNotebookVisible,
} = vi.hoisted(() => ({
  dispatch: vi.fn(),
  goTo: vi.fn(),
  saveConfig: vi.fn(),
  updateBooknotes: vi.fn(() => ({ updated: true })),
  writeTextToClipboard: vi.fn(),
  setNotebookEditAnnotation: vi.fn(),
  setNotebookVisible: vi.fn(),
}));

let booknotes: BookNote[] = [];
let isDarkMode = false;

const toc = [
  { id: 0, label: 'VI. The Shoemaker', href: 'ch6.xhtml', cfi: 'epubcfi(/6/4!/4/2)' },
  { id: 1, label: '2. The Rowboat', href: 'ch7.xhtml', cfi: 'epubcfi(/6/6!/4/2)' },
];

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/utils/clipboard', () => ({ writeTextToClipboard }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ settings: {} }) }));
vi.mock('@/store/themeStore', () => ({ useThemeStore: () => ({ isDarkMode }) }));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: () => ({ booknotes }),
    getBookData: () => ({ bookDoc: { toc } }),
    saveConfig,
    updateBooknotes,
  }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getView: () => ({ goTo }), getViewsById: () => [] }),
}));
vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({ setNotebookEditAnnotation, setNotebookVisible }),
}));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import BooknotesPopover from '@/app/reader/components/booknotes/BooknotesPopover';

const JULY_23_2026 = new Date('2026-07-23T12:00:00Z').getTime();
const JULY_24_2026 = new Date('2026-07-24T12:00:00Z').getTime();

const makeNote = (overrides: Partial<BookNote>): BookNote =>
  ({
    id: 'id',
    type: 'annotation',
    cfi: 'epubcfi(/6/4!/4/2)',
    note: '',
    createdAt: JULY_23_2026,
    updatedAt: 0,
    ...overrides,
  }) as BookNote;

const renderPopover = (onClose = vi.fn()) =>
  render(
    <BooknotesPopover bookKey='hash1-abc' isOpen anchorEl={document.body} onClose={onClose} />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isDarkMode = false;
  booknotes = [
    makeNote({ id: 'bm1', type: 'bookmark', cfi: 'epubcfi(/6/4!/4/2)', page: 29 }),
    makeNote({
      id: 'note1',
      cfi: 'epubcfi(/6/4!/4/6)',
      page: 29,
      text: 'You would have spoken to the art director',
    }),
    makeNote({
      id: 'bm2',
      type: 'bookmark',
      cfi: 'epubcfi(/6/6!/4/2)',
      page: 40,
      createdAt: JULY_24_2026,
    }),
  ];
});

afterEach(cleanup);

describe('BooknotesPopover', () => {
  it('titles the popover and separates it from the list with a divider', () => {
    renderPopover();
    const header = screen.getByText('Bookmarks & Notes').closest('div.bg-base-200');
    expect(header?.querySelector('.h-px')).toBeTruthy();
    expect(screen.getByText('Bookmarks & Notes').className).toContain('popover-title');
  });

  it('lists bookmarks and notes together in reading order', () => {
    renderPopover();
    expect(screen.getByTitle('VI. The Shoemaker')).toBeTruthy();
    expect(screen.getByText('You would have spoken to the art director')).toBeTruthy();
    expect(screen.getByTitle('2. The Rowboat')).toBeTruthy();
  });

  it('renders bookmarks as tinted cards carrying a ribbon and a page number', () => {
    renderPopover();
    const card = screen.getByTitle('VI. The Shoemaker').parentElement as HTMLElement;
    expect(card.className).toContain('bg-base-300/60');
    expect(card.querySelector('polygon')).toBeTruthy();
    expect(card.textContent).toContain('29');
  });

  it('dates every entry in full', () => {
    renderPopover();
    expect(screen.getAllByText('Thursday 23rd July, 2026')).toHaveLength(2);
    expect(screen.getByText('Friday 24th July, 2026')).toBeTruthy();
  });

  it('gives notes copy and edit, and every entry a delete', () => {
    renderPopover();
    expect(screen.getAllByLabelText('Copy')).toHaveLength(1);
    expect(screen.getAllByLabelText('Edit')).toHaveLength(1);
    expect(screen.getAllByLabelText('Delete')).toHaveLength(3);
  });

  it('keeps the bookmark delete hidden until the entry is hovered or focused', () => {
    renderPopover();
    const card = screen.getByTitle('VI. The Shoemaker').parentElement as HTMLElement;
    expect(card.className).toContain('group');

    const remove = card.querySelector('[aria-label="Delete"]') as HTMLElement;
    expect(remove.className).toContain('opacity-0');
    expect(remove.className).toContain('group-hover:opacity-100');
    expect(remove.className).toContain('group-focus-within:opacity-100');
    expect(remove.className).toContain('eink:opacity-100');
  });

  it('soft-deletes the bookmark its own delete belongs to', () => {
    renderPopover();
    const card = screen.getByTitle('2. The Rowboat').parentElement as HTMLElement;

    fireEvent.click(card.querySelector('[aria-label="Delete"]')!);

    const [, saved] = updateBooknotes.mock.calls[0] as unknown as [string, BookNote[]];
    expect(saved.find((note) => note.id === 'bm2')?.deletedAt).toBeTypeOf('number');
    expect(saved.find((note) => note.id === 'bm1')?.deletedAt).toBeUndefined();
    expect(saved.find((note) => note.id === 'note1')?.deletedAt).toBeUndefined();
  });

  it('navigates to an entry and closes when it is picked', () => {
    const onClose = vi.fn();
    renderPopover(onClose);

    fireEvent.click(screen.getByTitle('2. The Rowboat'));
    expect(dispatch).toHaveBeenCalledWith('navigate', {
      bookKey: 'hash1-abc',
      cfi: 'epubcfi(/6/6!/4/2)',
    });
    expect(goTo).toHaveBeenCalledWith('epubcfi(/6/6!/4/2)');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies the note text', () => {
    renderPopover();
    fireEvent.click(screen.getByLabelText('Copy'));
    expect(writeTextToClipboard).toHaveBeenCalledWith('You would have spoken to the art director');
  });

  it('opens the note in the notebook editor', () => {
    const onClose = vi.fn();
    renderPopover(onClose);

    fireEvent.click(screen.getByLabelText('Edit'));
    expect(setNotebookVisible).toHaveBeenCalledWith(true);
    expect(setNotebookEditAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note1' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes only the chosen note without mutating the stored array', () => {
    renderPopover();
    const before = booknotes.map((note) => ({ ...note }));
    const row = screen.getByText('You would have spoken to the art director').parentElement
      ?.parentElement as HTMLElement;

    fireEvent.click(row.querySelector('[aria-label="Delete"]')!);

    expect(booknotes).toEqual(before);
    const [, saved] = updateBooknotes.mock.calls[0] as unknown as [string, BookNote[]];
    expect(saved.find((note) => note.id === 'note1')?.deletedAt).toBeTypeOf('number');
    expect(saved.find((note) => note.id === 'bm1')?.deletedAt).toBeUndefined();
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });

  it('offers the bookmark placeholder, hint and action when nothing is saved', () => {
    booknotes = [];
    renderPopover();

    expect(screen.getByText('No Bookmarks')).toBeTruthy();
    expect(
      screen.getByText('To bookmark a page, click on the bookmark icon in the toolbar'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Copy')).toBeNull();
  });

  it('bookmarks the current page from the empty state and closes', () => {
    booknotes = [];
    const onClose = vi.fn();
    renderPopover(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark This Page' }));
    expect(dispatch).toHaveBeenCalledWith('toggle-bookmark', { bookKey: 'hash1-abc' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tints the empty-state placeholder red on light themes and inherits on dark', () => {
    booknotes = [];
    const { unmount } = renderPopover();
    const light = screen.getByText('No Bookmarks').previousElementSibling as HTMLElement;
    expect(light.style.color).toBe('rgb(244, 67, 54)');
    unmount();

    isDarkMode = true;
    renderPopover();
    const dark = screen.getByText('No Bookmarks').previousElementSibling as HTMLElement;
    expect(dark.style.color).toBe('');
  });

  it('hides deleted notes from the list', () => {
    booknotes = [makeNote({ id: 'gone', text: 'Hidden', deletedAt: 1 })];
    renderPopover();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('No Bookmarks')).toBeTruthy();
  });
});
