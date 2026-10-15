import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';
import type { FeedSource } from '@/services/margins/public/feedApi';

const h = vi.hoisted(() => ({
  fetchFeedPage: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(async () => {}),
  session: { me: { id: 'u1' } } as unknown,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
vi.mock('@/utils/nav', () => ({ navigateToLibrary: vi.fn() }));
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => h.session }));
vi.mock('@/services/margins/public/engagement', () => ({
  engagement: { count: h.count, flush: h.flush },
}));
vi.mock('@/services/margins/public/feedApi', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/feedApi')>()),
  fetchFeedPage: h.fetchFeedPage,
  preloadPost: () => {},
}));
vi.mock('@/components/margins/feed/FeedCard', () => ({
  default: (p: { post: PostView; onEngage(post: PostView, kind: string): void }) => (
    <div>
      {p.post.id}
      <button type='button' onClick={() => p.onEngage(p.post, 'completion')}>
        {`finish ${p.post.id}`}
      </button>
    </div>
  ),
}));

import FeedView from '@/components/margins/feed/FeedView';

const page = (prefix: string, n: number, nextCursor: string | null = null) => ({
  posts: Array.from(
    { length: n },
    (_, i) => ({ id: `${prefix}${i}`, author: { handle: 'a' }, textId: 't' }) as PostView,
  ),
  nextCursor,
});

const pages: Record<string, ReturnType<typeof page>> = {};

const show = async (source: FeedSource = { kind: 'for-you' }) => {
  render(<FeedView source={source} />);
  await act(async () => {});
};

const tab = (name: string) => screen.getByRole('tab', { name });
const choose = async (name: string) => {
  await act(async () => fireEvent.click(tab(name)));
};

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { me: { id: 'u1' } };
  pages['for-you'] = page('y', 3, 'yc');
  pages['following'] = page('f', 2);
  pages['book'] = page('b', 1);
  h.fetchFeedPage.mockImplementation(async (s: FeedSource) => pages[s.kind]);
});
afterEach(cleanup);

describe('FeedTabs', () => {
  it('offers For You and Following, and This Book only for a book', async () => {
    await show();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['For You', 'Following']);
    expect(tab('For You').getAttribute('aria-selected')).toBe('true');
    cleanup();
    await show({ kind: 'book', textId: 'txt_1', order: 'ranked' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'For You',
      'Following',
      'This Book',
    ]);
    expect(tab('This Book').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps each tab where it was', async () => {
    await show({ kind: 'book', textId: 'txt_1', order: 'book' });
    screen.getByText('b0');
    await choose('Following');
    screen.getByText('f1');
    await choose('For You');
    screen.getByText('y2');
    await choose('Following');
    await choose('This Book');
    screen.getByText('b0');
    expect(h.fetchFeedPage.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'book', textId: 'txt_1', order: 'book' },
      { kind: 'following' },
      { kind: 'for-you' },
    ]);
  });

  it('asks a signed-out reader to sign in on Following', async () => {
    h.session = null;
    await show();
    await choose('Following');
    screen.getByText('Sign in to follow creators');
    expect(h.fetchFeedPage).not.toHaveBeenCalledWith({ kind: 'following' }, undefined, {
      appService: {},
    });
  });

  it('links an empty Following to For You', async () => {
    pages['following'] = page('f', 0);
    await show({ kind: 'following' });
    screen.getByText('Follow creators from any card to see their Margins here');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Go to For You' })));
    expect(tab('For You').getAttribute('aria-selected')).toBe('true');
    screen.getByText('y0');
  });

  it('counts engagement signed in, and nothing signed out', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'finish y1' }));
    expect(h.count).toHaveBeenCalledWith('y1', 'completion');
    cleanup();
    h.count.mockClear();
    h.session = null;
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'finish y1' }));
    expect(h.count).not.toHaveBeenCalled();
  });

  it('shows no tabs on a profile feed', async () => {
    await show({ kind: 'profile', handle: 'creator_b' });
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
