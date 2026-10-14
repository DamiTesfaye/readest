import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  flag: true,
  link: { textId: 'txt_1' } as { textId: string } | null,
  navigateToLibrary: vi.fn(),
  router: {},
}));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/utils/nav', () => ({ navigateToLibrary: h.navigateToLibrary }));
vi.mock('@/services/margins/public/flag', () => ({ useMarginsPublic: () => h.flag }));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({ getTextLink: async () => h.link }),
}));

import MarginsOnBookButton from '@/components/margins/feed/MarginsOnBookButton';
import { feedSourceOf, isFeedView } from '@/services/margins/public/feedApi';

const params = (s: string) => new URLSearchParams(s);

beforeEach(() => {
  vi.clearAllMocks();
  h.flag = true;
  h.link = { textId: 'txt_1' };
});
afterEach(cleanup);

describe('feed URLs', () => {
  it('reads the feed source from the library URL', () => {
    expect(feedSourceOf(params('feed=for-you'))).toEqual({ kind: 'for-you' });
    expect(feedSourceOf(params('feed=following'))).toEqual({ kind: 'following' });
    expect(feedSourceOf(params('feed=book&text=txt_1&order=book'))).toEqual({
      kind: 'book',
      textId: 'txt_1',
      order: 'book',
    });
    expect(feedSourceOf(params('feed=book&text=txt_1'))).toEqual({
      kind: 'book',
      textId: 'txt_1',
      order: 'ranked',
    });
    expect(feedSourceOf(params('feed=book'))).toBeNull();
    expect(feedSourceOf(params('feed=elsewhere'))).toBeNull();
    expect(feedSourceOf(null)).toBeNull();
  });

  it("opens C1's trending URL as the For You feed", () => {
    expect(feedSourceOf(params('margins=trending'))).toEqual({ kind: 'for-you' });
    expect(isFeedView(params('margins=trending'))).toBe(true);
    expect(isFeedView(params('margins=true'))).toBe(false);
  });
});

describe('Margins on this book', () => {
  const show = async () => {
    render(<MarginsOnBookButton hash='h1' />);
    await act(async () => {});
  };

  it('opens This Book for a book with a Text while the flag is on', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Margins on this book' }));
    expect(h.navigateToLibrary).toHaveBeenCalledWith(h.router, 'feed=book&text=txt_1&order=ranked');
  });

  it('is absent without a Text or with the flag off', async () => {
    h.link = null;
    await show();
    expect(screen.queryByRole('button', { name: 'Margins on this book' })).toBeNull();
    cleanup();
    h.link = { textId: 'txt_1' };
    h.flag = false;
    await show();
    expect(screen.queryByRole('button', { name: 'Margins on this book' })).toBeNull();
  });
});
