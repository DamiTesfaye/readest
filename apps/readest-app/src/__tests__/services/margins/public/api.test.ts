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

import { AmpleReadSignedOutError } from '@/services/ampleread/auth/session';
import { PublicApiError, publicApi } from '@/services/margins/public/api';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const signedIn = () => session.getSession.mockResolvedValue({ me: { id: 'usr_1' } });
const signedOut = () => session.getSession.mockResolvedValue(null);
const pathOf = (mock: ReturnType<typeof vi.fn>, call = 0) => mock.mock.calls[call]![0] as string;
const initOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  mock.mock.calls[call]![1] as RequestInit;

const body = {
  layerId: 'lyr_1',
  layerRev: 3,
  cardAsset: null,
  section: 1,
  start: 2,
  end: 9,
  sectionLen: 400,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.amplereadFetch.mockImplementation(async () => json(200, {}));
  install.installFetch.mockImplementation(async () => json(200, {}));
});

describe('publicApi', () => {
  it('sends every call through amplereadFetch when signed in', async () => {
    signedIn();
    session.amplereadFetch.mockImplementation(async () => json(200, []));
    await publicApi.counts('txt_1', 2, 400);
    await publicApi.publish(body);
    expect(session.amplereadFetch).toHaveBeenCalledTimes(2);
    expect(install.installFetch).not.toHaveBeenCalled();
    expect(pathOf(session.amplereadFetch)).toBe('/v1/texts/txt_1/sections/2/post-counts?len=400');
    expect(pathOf(session.amplereadFetch, 1)).toBe('/v1/posts');
    expect(initOf(session.amplereadFetch, 1).method).toBe('POST');
    expect(JSON.parse(initOf(session.amplereadFetch, 1).body as string)).toEqual(body);
  });

  it('sends read calls through installFetch when signed out', async () => {
    signedOut();
    install.installFetch.mockImplementation(async () => json(200, { posts: [], nextCursor: null }));
    await publicApi.budget('txt_1', 0, 10);
    await publicApi.counts('txt_1', 0, 10);
    await publicApi.passages('txt_1', 0, 10, 2, 5, 'c1');
    await publicApi.trending({ lang: 'en', salt: 's', owned: [] });
    await publicApi.post('pst_1');
    await publicApi.report('pst_1', 'spam');
    expect(install.installFetch).toHaveBeenCalledTimes(6);
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(pathOf(install.installFetch, 2)).toBe(
      '/v1/texts/txt_1/sections/0/passages?start=2&end=5&len=10&cursor=c1',
    );
    expect(pathOf(install.installFetch, 5)).toBe('/v1/posts/pst_1/reports');
    expect(JSON.parse(initOf(install.installFetch, 5).body as string)).toEqual({ reason: 'spam' });
  });

  it('refuses write calls signed out without fetching', async () => {
    signedOut();
    const writes = [
      () => publicApi.profile(),
      () => publicApi.saveProfile('reader_1', 'Reader'),
      () => publicApi.publish(body),
      () => publicApi.republish('pst_1', body),
      () => publicApi.unpublish('pst_1'),
      () => publicApi.myPosts(),
      () => publicApi.mute('someone'),
      () => publicApi.unmute('someone'),
      () => publicApi.appeal('pst_1', 'please'),
    ];
    for (const write of writes)
      await expect(write()).rejects.toBeInstanceOf(AmpleReadSignedOutError);
    expect(install.installFetch).not.toHaveBeenCalled();
    expect(session.amplereadFetch).not.toHaveBeenCalled();
  });

  it('rejects with the code and detail of an error body', async () => {
    signedIn();
    session.amplereadFetch.mockResolvedValue(
      json(409, {
        error: 'crowd_cap_reached',
        message: 'Full',
        detail: { textRemaining: 5, sectionRemaining: 0 },
      }),
    );
    const error = await publicApi.publish(body).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublicApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'crowd_cap_reached',
      detail: { textRemaining: 5, sectionRemaining: 0 },
      retryAfter: null,
    });
  });

  it('carries retryAfter from a 429', async () => {
    signedIn();
    session.amplereadFetch.mockResolvedValue(
      json(429, { error: 'rate_limited', message: 'Slow down' }, { 'retry-after': '30' }),
    );
    await expect(publicApi.publish(body)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      detail: null,
      retryAfter: 30,
    });
  });

  it('maps a gone post and a hidden body', async () => {
    signedOut();
    install.installFetch.mockResolvedValueOnce(json(410, { error: 'gone', message: 'Gone' }));
    expect(await publicApi.post('pst_1')).toEqual({ id: 'pst_1', status: 'gone' });
    install.installFetch.mockResolvedValueOnce(json(200, { id: 'pst_2', status: 'hidden' }));
    expect(await publicApi.post('pst_2')).toEqual({ id: 'pst_2', status: 'hidden' });
  });

  it('maps a missing profile to null', async () => {
    signedIn();
    session.amplereadFetch.mockResolvedValue(json(404, { error: 'not_found', message: 'No' }));
    expect(await publicApi.profile()).toBeNull();
  });

  it('posts trending with a body and nothing in the URL', async () => {
    signedIn();
    session.amplereadFetch.mockResolvedValue(json(200, { posts: [], nextCursor: null }));
    await publicApi.trending({ cursor: 'c', lang: 'en', salt: 'salt', owned: ['h1'] });
    expect(pathOf(session.amplereadFetch)).toBe('/v1/feed/trending');
    expect(initOf(session.amplereadFetch).method).toBe('POST');
    expect(JSON.parse(initOf(session.amplereadFetch).body as string)).toEqual({
      cursor: 'c',
      lang: 'en',
      salt: 'salt',
      owned: ['h1'],
    });
  });

  it('adds the post to the budget query only when given', async () => {
    signedIn();
    await publicApi.budget('txt_1', 3, 50);
    await publicApi.budget('txt_1', 3, 50, 'pst_9');
    expect(pathOf(session.amplereadFetch)).toBe('/v1/texts/txt_1/sections/3/quote-budget?len=50');
    expect(pathOf(session.amplereadFetch, 1)).toBe(
      '/v1/texts/txt_1/sections/3/quote-budget?len=50&post=pst_9',
    );
  });

  it('encodes path segments', async () => {
    signedIn();
    await publicApi.mute('a/b');
    expect(pathOf(session.amplereadFetch)).toBe('/v1/me/mutes/a%2Fb');
    expect(initOf(session.amplereadFetch).method).toBe('PUT');
  });

  it('returns a memoised blob URL for post art and null on 404', async () => {
    signedOut();
    const createObjectURL = vi.fn(() => 'blob:art-1');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }));
    install.installFetch.mockResolvedValueOnce(new Response(new Blob(['png']), { status: 200 }));
    expect(await publicApi.postAssetUrl('pst_1', 'ast_1')).toBe('blob:art-1');
    expect(await publicApi.postAssetUrl('pst_1', 'ast_1')).toBe('blob:art-1');
    expect(install.installFetch).toHaveBeenCalledTimes(1);
    expect(pathOf(install.installFetch)).toBe('/v1/posts/pst_1/assets/ast_1');
    install.installFetch.mockResolvedValueOnce(json(404, { error: 'not_found', message: 'No' }));
    expect(await publicApi.postAssetUrl('pst_1', 'ast_2')).toBeNull();
    vi.unstubAllGlobals();
  });
});
