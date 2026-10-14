import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';
import type { FeedSource } from '@/services/margins/public/feedApi';

const h = vi.hoisted(() => ({
  fetchFeedPage: vi.fn(),
  postAsset: vi.fn(async () => null),
  postAssetUrl: vi.fn(async () => null),
  session: { me: { id: 'u1' } } as unknown,
  unhideBook: vi.fn(async () => {}),
  toast: vi.fn(),
}));
vi.mock('@/services/margins/public/social', () => ({
  socialApi: { unhideBook: h.unhideBook },
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
vi.mock('@/services/margins/public/feedApi', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/feedApi')>()),
  fetchFeedPage: h.fetchFeedPage,
}));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { postAsset: h.postAsset, postAssetUrl: h.postAssetUrl },
}));
vi.mock('@/components/margins/feed/FeedCard', () => ({
  default: (p: {
    post: PostView;
    active: boolean;
    muted: boolean;
    onUnmute(): void;
    onMute(): void;
    onHidden(post: PostView, by: 'creator' | 'book'): void;
  }) => (
    <div>
      {p.post.id}
      {p.active && ' active'}
      <button type='button' onClick={p.muted ? p.onUnmute : p.onMute}>
        {p.muted ? 'Unmute' : 'Mute'}
      </button>
      <button type='button' onClick={() => p.onHidden(p.post, 'creator')}>
        {`Block ${p.post.id}`}
      </button>
      <button type='button' onClick={() => p.onHidden(p.post, 'book')}>
        {`Hide ${p.post.id}`}
      </button>
    </div>
  ),
}));

import FeedView from '@/components/margins/feed/FeedView';
import { familyCache } from '@/services/margins/sync';
import { eventDispatcher } from '@/utils/event';

const post = (i: number): PostView =>
  ({
    id: `p${i}`,
    author: { handle: `h${i}`, displayName: `H${i}` },
    sceneAsset: `ast_s${i}`,
    coverAsset: `ast_c${i}`,
    payload: { v: 1, ground: 'paper', elements: [{ kind: 'artwork', asset: `ast_a${i}` }] },
  }) as unknown as PostView;

const page = (from: number, n: number, nextCursor: string | null = null) => ({
  posts: Array.from({ length: n }, (_, i) => post(from + i)),
  nextCursor,
});

const scroll = vi.fn();

const show = async (source: FeedSource = { kind: 'for-you' }) => {
  render(<FeedView source={source} />);
  await act(async () => {});
  return screen.getByRole('feed');
};

const press = async (feed: HTMLElement, key: string) => {
  await act(async () => fireEvent.keyDown(feed, { key }));
};

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { me: { id: 'u1' } };
  h.fetchFeedPage.mockResolvedValue(page(0, 12));
  Element.prototype.scrollIntoView = scroll;
});
afterEach(cleanup);

describe('FeedView', () => {
  it('renders full-height cards in a snap scroller', async () => {
    const feed = await show();
    expect(feed.className).toContain('snap-y');
    expect(feed.className).toContain('snap-mandatory');
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(12);
    expect(cards[0]!.className).toContain('h-full');
    expect(cards[0]!.className).toContain('snap-start');
    screen.getByText('p0 active');
  });

  it('pages with ArrowDown and PageDown', async () => {
    const feed = await show();
    await press(feed, 'ArrowDown');
    screen.getByText('p1 active');
    await press(feed, 'PageDown');
    screen.getByText('p2 active');
    expect(scroll).toHaveBeenCalledTimes(2);
    await press(feed, 'ArrowUp');
    screen.getByText('p1 active');
  });

  it('pages once per wheel gesture', async () => {
    const feed = await show();
    await act(async () => {
      fireEvent.wheel(feed, { deltaY: 80 });
      fireEvent.wheel(feed, { deltaY: 90 });
      fireEvent.wheel(feed, { deltaY: 20 });
    });
    expect(scroll).toHaveBeenCalledTimes(1);
    screen.getByText('p1 active');
  });

  it('fetches the next page when card 9 of 10 is active', async () => {
    h.fetchFeedPage.mockResolvedValueOnce(page(0, 10, 'c1')).mockResolvedValueOnce(page(10, 10));
    const feed = await show();
    for (let i = 0; i < 7; i++) await press(feed, 'ArrowDown');
    expect(h.fetchFeedPage).toHaveBeenCalledTimes(1);
    await press(feed, 'ArrowDown');
    expect(h.fetchFeedPage).toHaveBeenLastCalledWith({ kind: 'for-you' }, 'c1', {
      appService: {},
    });
    expect(screen.getAllByRole('article')).toHaveLength(20);
  });

  it('preloads the scene, cover and art of the next two cards', async () => {
    h.fetchFeedPage.mockResolvedValue(page(100, 12));
    await show();
    expect(h.postAsset).toHaveBeenCalledWith('p101', 'ast_s101');
    expect(h.postAsset).toHaveBeenCalledWith('p102', 'ast_s102');
    expect(h.postAsset).not.toHaveBeenCalledWith('p103', 'ast_s103');
    expect(h.postAssetUrl).toHaveBeenCalledWith('p101', 'ast_c101');
    expect(h.postAssetUrl).toHaveBeenCalledWith('p102', 'ast_a102');
  });

  it('shares one mute state across the feed', async () => {
    await show();
    expect(screen.getAllByRole('button', { name: 'Unmute' })).toHaveLength(12);
    fireEvent.click(screen.getAllByRole('button', { name: 'Unmute' })[0]!);
    expect(screen.getAllByRole('button', { name: 'Mute' })).toHaveLength(12);
  });

  it.each([
    [{ kind: 'for-you' }, 'No Margins yet'],
    [{ kind: 'book', textId: 'txt1', order: 'ranked' }, 'No Margins on this book yet'],
    [{ kind: 'following' }, 'Follow creators from any card to see their Margins here'],
  ] as [FeedSource, string][])('shows the empty state of %o', async (source, copy) => {
    h.fetchFeedPage.mockResolvedValue(page(0, 0));
    await show(source);
    screen.getByText(copy);
  });

  it('loads signed out', async () => {
    h.session = null;
    await show();
    expect(screen.getAllByRole('article')).toHaveLength(12);
  });

  describe('dropping cards', () => {
    const mixed = () => ({
      posts: [
        { id: 'p0', author: { handle: 'a' }, textId: 't0' },
        { id: 'p1', author: { handle: 'a' }, textId: 't1' },
        { id: 'p2', author: { handle: 'b' }, textId: 't0' },
        { id: 'p3', author: { handle: 'c' }, textId: 't3' },
        { id: 'p4', author: { handle: 'd' }, textId: 't4' },
      ] as unknown as PostView[],
      nextCursor: null,
    });
    const ids = () => screen.getAllByRole('article').map((a) => a.textContent?.match(/^p\d+/)?.[0]);

    beforeEach(() => {
      h.fetchFeedPage.mockResolvedValue(mixed());
      familyCache.set('t0', 'fam');
      familyCache.set('t3', 'fam');
      eventDispatcher.on('toast', h.toast);
    });
    afterEach(() => {
      familyCache.clear();
      eventDispatcher.off('toast', h.toast);
    });

    it('drops every card by a blocked creator at once', async () => {
      await show();
      fireEvent.click(screen.getByRole('button', { name: 'Block p0' }));
      expect(ids()).toEqual(['p2', 'p3', 'p4']);
      expect(h.toast).not.toHaveBeenCalled();
    });

    it('drops every card on a hidden family, and Undo shows them again', async () => {
      await show();
      fireEvent.click(screen.getByRole('button', { name: 'Hide p2' }));
      expect(ids()).toEqual(['p1', 'p4']);
      const detail = h.toast.mock.calls[0]![0].detail;
      expect(detail.action.label).toBe('Undo');
      await act(async () => detail.action.onClick());
      expect(h.unhideBook).toHaveBeenCalledWith('t0');
      expect(ids()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    });
  });
});
