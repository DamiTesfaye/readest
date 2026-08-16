import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (n: number) => n }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: { isMobile: false } }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { autoUpload: false } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/BookCover', () => ({
  default: ({ imageClassName }: { imageClassName?: string }) => (
    <div data-testid='cover' className={imageClassName} />
  ),
}));

import BookItem from '@/app/library/components/BookItem';

const book = {
  hash: 'hash-1',
  format: 'EPUB',
  title: 'Zero to One: Notes on Startups',
  author: 'Peter Thiel',
  createdAt: 1000,
  updatedAt: 2000,
  progress: [6, 100],
} as unknown as Book;

const renderGridItem = () =>
  render(
    <BookItem
      book={book}
      mode='grid'
      coverFit='crop'
      isSelectMode={false}
      bookSelected={false}
      transferProgress={null}
      handleBookUpload={vi.fn()}
      handleBookDownload={vi.fn()}
      showBookDetailsModal={vi.fn()}
    />,
  );

afterEach(cleanup);

describe('BookItem grid card', () => {
  it('lays the cover beside the text instead of above it', () => {
    const { container } = renderGridItem();

    const card = container.querySelector('.book-item')!;
    expect(card.className).toContain('flex-row');
    expect(card.className).not.toContain('flex-col');
  });

  it('shows the author next to the title', () => {
    renderGridItem();

    expect(screen.getByText('Peter Thiel')).toBeTruthy();
    expect(screen.getByText('Zero to One: Notes on Startups')).toBeTruthy();
  });

  it('renders the title and author in Avenir Next', () => {
    renderGridItem();

    const font = '[font-family:"Avenir_Next_LT_Pro"]';
    expect(screen.getByText('Zero to One: Notes on Startups').className).toContain(font);
    expect(screen.getByText('Peter Thiel').className).toContain(font);
  });

  it('renders a square-cornered cover with a shadow', () => {
    const { container } = renderGridItem();

    const cover = container.querySelector('.bookitem-main')!;
    expect(cover.className).toContain('shadow-md');
    expect(cover.className).not.toContain('rounded');
    expect(screen.getByTestId('cover').className ?? '').not.toContain('rounded');
  });
});
