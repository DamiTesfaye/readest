import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '@/app/u/page';

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const meta = (handle?: string) =>
  generateMetadata({ searchParams: Promise.resolve(handle ? { handle } : {}) });

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/u generateMetadata', () => {
  it('titles a profile by its handle', async () => {
    const fetchMock = respond(200, { handle: 'creator_b', displayName: 'Creator B' });
    vi.stubGlobal('fetch', fetchMock);
    const m = await meta('creator_b');
    expect(m.title).toBe('@creator_b · AmpleRead');
    expect(m.robots).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/v1/users/creator_b')).toBe(true);
    expect(init.cache).toBe('no-store');
  });

  it('keeps an unknown handle out of the index', async () => {
    vi.stubGlobal('fetch', respond(404, { error: 'not_found' }));
    const m = await meta('nobody');
    expect(m.title).toBe('@nobody · AmpleRead');
    expect(m.robots).toEqual({ index: false });
  });

  it('does not fetch a malformed handle', async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal('fetch', fetchMock);
    const m = await meta('../admin');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.robots).toEqual({ index: false });
  });

  it('is static outside the web build', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
    const fetchMock = respond(200, {});
    vi.stubGlobal('fetch', fetchMock);
    await meta('creator_b');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
