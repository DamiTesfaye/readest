import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookNote } from '@/types/book';

const { dispatch, goTo } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  goTo: vi.fn(),
}));

let booknotes: BookNote[] = [];

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      globalReadSettings: {
        customHighlightColors: {
          red: '#E58CA4',
          yellow: '#FBDC40',
          violet: '#C5AEFB',
          blue: '#95B8FF',
        },
      },
    },
  }),
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'default', isDarkMode: false }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getConfig: () => ({ booknotes }) }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getView: () => ({ goTo }) }),
}));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import AnnotationsPopover from '@/app/reader/components/booknotes/AnnotationsPopover';

const JULY_23_2026 = new Date('2026-07-23T12:00:00Z').getTime();

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
    <AnnotationsPopover bookKey='hash1-abc' isOpen anchorEl={document.body} onClose={onClose} />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  booknotes = [
    makeNote({
      id: 'hl1',
      cfi: 'epubcfi(/6/4!/4/6)',
      page: 29,
      text: 'You would have spoken to the art director',
      style: 'highlight',
      color: 'yellow',
    }),
    makeNote({
      id: 'ul1',
      cfi: 'epubcfi(/6/4!/4/2)',
      page: 4,
      text: 'I taught at Stanford in 2012',
      style: 'underline',
      color: 'red',
    }),
    makeNote({
      id: 'noted1',
      cfi: 'epubcfi(/6/4!/4/4)',
      page: 6,
      text: 'Hello boys and girls of the republic',
      note: 'my thoughts on this',
      style: 'highlight',
      color: 'violet',
    }),
    makeNote({
      id: 'sq1',
      cfi: 'epubcfi(/6/6!/4/2)',
      page: 40,
      text: 'Our educational system is broken',
      style: 'squiggly',
      color: 'blue',
    }),
  ];
});

afterEach(cleanup);

describe('AnnotationsPopover', () => {
  it('titles the popover and separates it from the list with a divider', () => {
    renderPopover();
    expect(screen.getByText('Annotations').className).toContain('popover-title');
    expect(document.querySelector('.h-px')).toBeTruthy();
  });

  it('lists every annotation in reading order, including ones carrying notes', () => {
    renderPopover();
    const texts = Array.from(document.querySelectorAll('.annotation-text')).map(
      (el) => el.textContent,
    );
    expect(texts).toEqual([
      'I taught at Stanford in 2012',
      'Hello boys and girls of the republic',
      'You would have spoken to the art director',
      'Our educational system is broken',
    ]);
  });

  it('paints highlight excerpts with their highlight color', () => {
    renderPopover();
    const excerpt = screen.getByText('You would have spoken to the art director') as HTMLElement;
    expect(excerpt.className).toContain('rounded-[4px]');
    expect(excerpt.style.backgroundColor).toContain('color-mix');
    expect(excerpt.style.backgroundColor).toContain('#FBDC40');
  });

  it('keeps underline excerpts underlined in their color', () => {
    renderPopover();
    const excerpt = screen.getByText('I taught at Stanford in 2012') as HTMLElement;
    expect(excerpt.className).toContain('underline');
    expect(excerpt.className).toContain('decoration-2');
    expect(excerpt.style.textDecorationColor).toContain('rgb(229, 140, 164)');
  });

  it('renders squiggly excerpts with a wavy underline', () => {
    renderPopover();
    const excerpt = screen.getByText('Our educational system is broken') as HTMLElement;
    expect(excerpt.className).toContain('decoration-wavy');
    expect(excerpt.className).toContain('underline');
  });

  it('dates every entry in full and shows its page', () => {
    renderPopover();
    expect(screen.getAllByText('Thursday 23rd July, 2026')).toHaveLength(4);
    expect(screen.getAllByText('Page')).toHaveLength(4);
    expect(screen.getByText('29')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('navigates to an annotation and closes when it is picked', () => {
    const onClose = vi.fn();
    renderPopover(onClose);

    fireEvent.click(screen.getByText('I taught at Stanford in 2012'));
    expect(dispatch).toHaveBeenCalledWith('navigate', {
      bookKey: 'hash1-abc',
      cfi: 'epubcfi(/6/4!/4/2)',
    });
    expect(goTo).toHaveBeenCalledWith('epubcfi(/6/4!/4/2)');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps bookmarks, excerpts and deleted annotations out of the list', () => {
    booknotes = [
      makeNote({ id: 'bm', type: 'bookmark', text: 'A bookmark' }),
      makeNote({ id: 'ex', type: 'excerpt', text: 'An excerpt' }),
      makeNote({ id: 'gone', text: 'Deleted highlight', style: 'highlight', deletedAt: 1 }),
      makeNote({ id: 'kept', text: 'Kept highlight', style: 'highlight', color: 'yellow' }),
    ];
    renderPopover();

    expect(screen.queryByText('A bookmark')).toBeNull();
    expect(screen.queryByText('An excerpt')).toBeNull();
    expect(screen.queryByText('Deleted highlight')).toBeNull();
    expect(screen.getByText('Kept highlight')).toBeTruthy();
  });

  it('shows the placeholder when nothing is annotated yet', () => {
    booknotes = [];
    renderPopover();

    expect(screen.getByText('No Annotations')).toBeTruthy();
    expect(screen.getByText('Select text while reading to highlight or underline it')).toBeTruthy();
  });
});
