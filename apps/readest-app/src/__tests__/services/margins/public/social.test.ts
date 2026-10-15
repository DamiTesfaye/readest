import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  getSession: vi.fn(),
  amplereadFetch: vi.fn(),
}));

const install = vi.hoisted(() => ({ installFetch: vi.fn() }));

vi.mock('@/services/ampleread', () => ({
  getApiBase: () => 'https://api.test',
  installFetch: install.installFetch,
}));

vi.mock('@/services/ampleread/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ampleread/auth/session')>()),
  getSession: session.getSession,
  amplereadFetch: session.amplereadFetch,
}));

import { socialApi } from '@/services/margins/public/social';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const signedIn = () => session.getSession.mockResolvedValue({ me: { id: 'usr_1' } });
const signedOut = () => session.getSession.mockResolvedValue(null);
const sent = (mock: ReturnType<typeof vi.fn>, call = 0) => {
  const [path, init] = mock.mock.calls[call]! as [string, RequestInit | undefined];
  return `${init?.method ?? 'GET'} ${path}`;
};

const page = { posts: [], nextCursor: null };

beforeEach(() => {
  vi.clearAllMocks();
  session.amplereadFetch.mockImplementation(async () => new Response(null, { status: 204 }));
  install.installFetch.mockImplementation(async () => json(200, page));
});

describe('socialApi', () => {
  it('follows with the post that the follow came from, and unfollows', async () => {
    signedIn();
    await socialApi.follow('creator b', 'pst_1');
    await socialApi.follow('creator_b');
    await socialApi.unfollow('creator_b');
    expect(sent(session.amplereadFetch)).toBe('PUT /v1/follows/creator%20b?post=pst_1');
    expect(sent(session.amplereadFetch, 1)).toBe('PUT /v1/follows/creator_b');
    expect(sent(session.amplereadFetch, 2)).toBe('DELETE /v1/follows/creator_b');
  });

  it('blocks, unblocks and lists blocks', async () => {
    signedIn();
    await socialApi.block('creator_b');
    await socialApi.unblock('creator_b');
    session.amplereadFetch.mockImplementation(async () =>
      json(200, [{ handle: 'creator_b', displayName: 'B' }]),
    );
    expect(await socialApi.blocks()).toEqual([{ handle: 'creator_b', displayName: 'B' }]);
    expect(sent(session.amplereadFetch)).toBe('PUT /v1/me/blocks/creator_b');
    expect(sent(session.amplereadFetch, 1)).toBe('DELETE /v1/me/blocks/creator_b');
    expect(sent(session.amplereadFetch, 2)).toBe('GET /v1/me/blocks');
  });

  it('hides and shows books, and lists hidden books', async () => {
    signedIn();
    await socialApi.hideBook('txt_1');
    await socialApi.unhideBook('txt_1');
    session.amplereadFetch.mockImplementation(async () =>
      json(200, [{ textId: 'txt_1', title: null }]),
    );
    expect(await socialApi.hiddenBooks()).toEqual([{ textId: 'txt_1', title: null }]);
    expect(sent(session.amplereadFetch)).toBe('PUT /v1/me/hidden-books/txt_1');
    expect(sent(session.amplereadFetch, 1)).toBe('DELETE /v1/me/hidden-books/txt_1');
    expect(sent(session.amplereadFetch, 2)).toBe('GET /v1/me/hidden-books');
  });

  it('reads a profile, and maps blocked to blocked and missing to null', async () => {
    signedIn();
    const profile = {
      handle: 'creator_b',
      displayName: 'B',
      followers: 2,
      following: 1,
      followed: false,
      mine: false,
    };
    session.amplereadFetch.mockImplementationOnce(async () => json(200, profile));
    expect(await socialApi.profile('creator_b')).toEqual(profile);
    session.amplereadFetch.mockImplementationOnce(async () => json(403, { error: 'blocked' }));
    expect(await socialApi.profile('creator_b')).toBe('blocked');
    session.amplereadFetch.mockImplementationOnce(async () => json(404, { error: 'not_found' }));
    expect(await socialApi.profile('nobody')).toBeNull();
    expect(sent(session.amplereadFetch)).toBe('GET /v1/users/creator_b');
  });

  it('reads profiles and their posts signed out through the install token', async () => {
    signedOut();
    install.installFetch.mockImplementationOnce(async () =>
      json(200, {
        handle: 'b',
        displayName: 'B',
        followers: 0,
        following: 0,
        followed: false,
        mine: false,
      }),
    );
    await socialApi.profile('b');
    await socialApi.profilePosts('b');
    await socialApi.profilePosts('b', 'u:1');
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(sent(install.installFetch)).toBe('GET /v1/users/b');
    expect(sent(install.installFetch, 1)).toBe('GET /v1/users/b/posts');
    expect(sent(install.installFetch, 2)).toBe('GET /v1/users/b/posts?cursor=u%3A1');
  });

  it('posts For You with the trending body and reads Following', async () => {
    signedIn();
    session.amplereadFetch.mockImplementation(async () => json(200, page));
    const body = { lang: 'en', salt: 's', owned: ['o'] };
    expect(await socialApi.forYou(body)).toEqual(page);
    await socialApi.following();
    await socialApi.following('f:2');
    expect(sent(session.amplereadFetch)).toBe('POST /v1/feed/for-you');
    expect(JSON.parse(session.amplereadFetch.mock.calls[0]![1].body)).toEqual(body);
    expect(sent(session.amplereadFetch, 1)).toBe('GET /v1/feed/following');
    expect(sent(session.amplereadFetch, 2)).toBe('GET /v1/feed/following?cursor=f%3A2');
  });

  it('reads For You signed out', async () => {
    signedOut();
    await socialApi.forYou({ lang: 'en', salt: 's', owned: [] });
    expect(sent(install.installFetch)).toBe('POST /v1/feed/for-you');
  });
});
