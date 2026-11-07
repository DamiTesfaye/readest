import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  forYou: vi.fn(async () => ({ posts: [], nextCursor: 'n' })),
  following: vi.fn(async () => ({ posts: [], nextCursor: null })),
}));

vi.mock('@/services/margins/public/social', () => ({
  socialApi: { forYou: h.forYou, following: h.following },
}));
vi.mock('@/utils/misc', async (orig) => ({
  ...(await orig<typeof import('@/utils/misc')>()),
  getLocale: () => 'fr-FR',
}));

import { fetchFeedPage } from '@/services/margins/public/feedApi';

beforeEach(() => vi.clearAllMocks());

describe('fetchFeedPage', () => {
  it('reads For You with the trending body', async () => {
    expect(await fetchFeedPage({ kind: 'for-you' }, 'c1', { appService: null })).toEqual({
      posts: [],
      nextCursor: 'n',
    });
    expect(h.forYou).toHaveBeenCalledWith({
      cursor: 'c1',
      lang: 'fr',
      salt: expect.any(String),
      owned: [],
    });
  });

  it('reads Following by its cursor', async () => {
    await fetchFeedPage({ kind: 'following' }, 'f:1', { appService: null });
    expect(h.following).toHaveBeenCalledWith('f:1');
  });
});
