import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';

const h = vi.hoisted(() => ({
  flag: true,
  trending: vi.fn(),
  post: vi.fn(),
  target: { kind: 'library', bookHash: 'h1' } as unknown,
  requestPostOpen: vi.fn(),
  rememberPendingOpen: vi.fn(),
  navigateToReader: vi.fn(),
  navigateToLibrary: vi.fn(),
  getWorkDetail: vi.fn(async () => ({ editions: [{ id: 'ed1' }] })),
  downloadEdition: vi.fn(async () => ({ hash: 'h9' })),
  router: {},
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/utils/nav', () => ({
  navigateToReader: h.navigateToReader,
  navigateToLibrary: h.navigateToLibrary,
}));
vi.mock('@/store/libraryStore', () => {
  const state = { library: [{ hash: 'h1' }] };
  const useLibraryStore = (sel: (s: typeof state) => unknown) => sel(state);
  return { useLibraryStore };
});
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => null }));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({ allTextIds: async () => [] }),
}));
vi.mock('@/services/margins/public/flag', () => ({ useMarginsPublic: () => h.flag }));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { trending: h.trending, post: h.post, postAssetUrl: async () => null },
}));
vi.mock('@/services/margins/public/openPost', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/openPost')>()),
  openTargetFor: async () => h.target,
  ownedHashes: async () => ['abc'],
  requestPostOpen: h.requestPostOpen,
  rememberPendingOpen: h.rememberPendingOpen,
}));
vi.mock('@/services/ampleread', () => ({
  getWorkDetail: h.getWorkDetail,
  canDownloadEdition: () => true,
}));
vi.mock('@/services/ampleread/download', () => ({ downloadEdition: h.downloadEdition }));

import { PostSheet } from '@/app/reader/components/margins/PostCard';
import TrendingRail from '@/app/library/components/TrendingRail';
import TrendingView, { isTrendingView } from '@/app/library/components/TrendingView';
import { eventDispatcher } from '@/utils/event';

const post = (id: string, o: Partial<PostView> = {}) =>
  ({
    id,
    textId: 'txt1',
    quote: `quote ${id}`,
    author: { handle: `h_${id}`, displayName: id },
    book: { title: 'Alice', author: null, workId: null, capped: true },
    payload: {},
    mine: false,
    ...o,
  }) as PostView;

const page = (n: number, nextCursor: string | null = null) => ({
  posts: Array.from({ length: n }, (_, i) => post(`p${i}`)),
  nextCursor,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.flag = true;
  h.target = { kind: 'library', bookHash: 'h1' };
});
afterEach(cleanup);

describe('Trending Margins', () => {
  it('shows six trending Margins in the rail and links to the full view', async () => {
    h.trending.mockResolvedValue(page(8));
    render(<TrendingRail />);
    await act(async () => {});
    const rail = screen.getByRole('region', { name: 'Trending Margins' });
    const items = within(rail).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    within(items[0]!).getByText('@h_p0');
    within(items[0]!).getByText('Alice');
    expect(within(items[0]!).getByText('quote p0').className).toContain('line-clamp-3');
    expect(h.trending).toHaveBeenCalledWith(
      expect.objectContaining({
        owned: ['abc'],
        salt: expect.any(String),
        lang: expect.any(String),
      }),
    );
    fireEvent.click(within(rail).getByRole('button', { name: 'See all' }));
    expect(h.navigateToLibrary).toHaveBeenCalledWith(h.router, 'margins=trending');
  });

  it('opens a rail item in the single-post sheet', async () => {
    h.trending.mockResolvedValue(page(1));
    const opened = vi.fn();
    eventDispatcher.on('margins-open-post', opened);
    render(<TrendingRail />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /quote p0/ }));
    expect(opened.mock.calls[0]![0].detail).toEqual({ postId: 'p0' });
    eventDispatcher.off('margins-open-post', opened);
  });

  it('is absent while the flag is off', async () => {
    h.flag = false;
    render(<TrendingRail />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Trending Margins' })).toBeNull();
    expect(h.trending).not.toHaveBeenCalled();
  });

  it('routes ?margins=trending to the trending view', () => {
    expect(isTrendingView(new URLSearchParams('margins=trending'))).toBe(true);
    expect(isTrendingView(new URLSearchParams('margins=true'))).toBe(false);
    expect(isTrendingView(null)).toBe(false);
  });

  it('loads more with the cursor and opens a library book', async () => {
    h.trending.mockResolvedValueOnce(page(2, 'c1')).mockResolvedValueOnce(page(1));
    render(<TrendingView />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Load more' })));
    expect(h.trending).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: 'Open in book' })[0]!),
    );
    expect(h.requestPostOpen).toHaveBeenCalledWith('h1', expect.objectContaining({ id: 'p0' }));
    expect(h.navigateToReader).toHaveBeenCalledWith(h.router, ['h1']);
  });

  it('asks to open your copy, and remembers the Margin for it', async () => {
    h.target = { kind: 'yourCopy' };
    h.trending.mockResolvedValue(page(1));
    render(<TrendingView />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open in book' })));
    screen.getByText('Open this book from your library to see this Margin in place.');
    expect(h.rememberPendingOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p0' }));
  });

  it('gets a catalogue book, then opens it', async () => {
    h.target = { kind: 'download', workId: 'wrk1' };
    h.trending.mockResolvedValue(page(1));
    render(<TrendingView />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open in book' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Get this book' })));
    expect(h.getWorkDetail).toHaveBeenCalledWith('wrk1');
    expect(h.downloadEdition).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'wrk1', edition: { id: 'ed1' } }),
    );
    expect(h.requestPostOpen).toHaveBeenCalledWith('h9', expect.objectContaining({ id: 'p0' }));
    expect(h.navigateToReader).toHaveBeenCalledWith(h.router, ['h9']);
  });

  it.each([
    [{ id: 'pst1', status: 'gone' }, 'This Margin is no longer available'],
    [{ id: 'pst1', status: 'hidden' }, 'Under review'],
  ])('shows a single post that is %o', async (lookup, copy) => {
    h.post.mockResolvedValue(lookup);
    render(<PostSheet postId='pst1' onClose={vi.fn()} />);
    await act(async () => {});
    screen.getByText(copy);
  });

  it('shows a single live post with Open in book', async () => {
    h.post.mockResolvedValue(post('pst1', { status: 'live' }));
    render(<PostSheet postId='pst1' onClose={vi.fn()} />);
    await act(async () => {});
    screen.getByText('quote pst1');
    screen.getByRole('button', { name: 'Open in book' });
  });
});
