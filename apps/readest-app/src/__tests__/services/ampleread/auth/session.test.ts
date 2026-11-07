import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AmpleReadSignedOutError,
  amplereadFetch,
  clearSession,
  getSession,
  saveSession,
  type StoredSession,
} from '@/services/ampleread/auth/session';

vi.mock('@/services/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/environment')>()),
  isTauriAppPlatform: () => false,
}));

const session = (
  access: string,
  refresh: string,
  refreshExp = '2099-02-01T00:00:00Z',
): StoredSession => ({
  tokens: {
    accessToken: access,
    refreshToken: refresh,
    tokenType: 'Bearer',
    accessExpiresAt: '2099-01-01T00:00:00Z',
    refreshExpiresAt: refreshExp,
  },
  me: {
    id: 'usr_1',
    email: null,
    displayName: null,
    avatarUrl: null,
    createdAt: '2026-10-12T00:00:00Z',
    identities: [],
  },
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const invalidToken = () => json(401, { error: 'invalid_token', message: '' });
const bearerOf = (call: unknown[]) =>
  new Headers((call[1] as RequestInit).headers).get('authorization');

describe('amplereadFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(async () => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    await saveSession(session('a1', 'r1'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the stored bearer', async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await amplereadFetch('/v1/me');
    expect(bearerOf(fetchMock.mock.calls[0]!)).toBe('Bearer a1');
  });

  it('refreshes once on 401 invalid_token and retries with the new pair', async () => {
    fetchMock
      .mockResolvedValueOnce(invalidToken())
      .mockResolvedValueOnce(json(200, session('a2', 'r2').tokens))
      .mockResolvedValueOnce(json(200, {}));
    expect((await amplereadFetch('/v1/me')).status).toBe(200);
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(/\/v1\/auth\/refresh$/);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)).refreshToken).toBe('r1');
    expect(bearerOf(fetchMock.mock.calls[2]!)).toBe('Bearer a2');
    expect((await getSession())?.tokens.refreshToken).toBe('r2');
  });

  it('uses a pair another context stored instead of refreshing', async () => {
    fetchMock.mockImplementationOnce(async () => {
      await saveSession(session('a9', 'r9'));
      return invalidToken();
    });
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await amplereadFetch('/v1/me');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bearerOf(fetchMock.mock.calls[1]!)).toBe('Bearer a9');
  });

  it('does not refresh on a 401 that is not invalid_token', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'reauth_required', message: '' }));
    expect((await amplereadFetch('/v1/me')).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the session when refresh answers 401', async () => {
    fetchMock.mockResolvedValueOnce(invalidToken()).mockResolvedValueOnce(invalidToken());
    await expect(amplereadFetch('/v1/me')).rejects.toBeInstanceOf(AmpleReadSignedOutError);
    expect(await getSession()).toBeNull();
  });

  it.each([429, 503])('keeps the pair when refresh answers %i', async (status) => {
    fetchMock
      .mockResolvedValueOnce(invalidToken())
      .mockResolvedValueOnce(
        json(status, { error: 'rate_limited', message: '' }, { 'retry-after': '1' }),
      );
    await expect(amplereadFetch('/v1/me')).rejects.toMatchObject({ status });
    expect((await getSession())?.tokens.refreshToken).toBe('r1');
  });

  it('keeps the pair when the refresh and its one re-send both fail on the network', async () => {
    fetchMock
      .mockResolvedValueOnce(invalidToken())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(amplereadFetch('/v1/me')).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await getSession())?.tokens.refreshToken).toBe('r1');
  });

  it('re-sends a refresh whose response was lost, with the same refresh token', async () => {
    fetchMock
      .mockResolvedValueOnce(invalidToken())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, session('a2', 'r2').tokens))
      .mockResolvedValueOnce(json(200, {}));
    expect((await amplereadFetch('/v1/me')).status).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]!.body)).refreshToken).toBe('r1');
    expect((await getSession())?.tokens.refreshToken).toBe('r2');
  });

  it('does not re-send a lost refresh more than 30 s after sending it', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    fetchMock.mockResolvedValueOnce(invalidToken()).mockImplementationOnce(async () => {
      now.mockReturnValue(30_001);
      throw new TypeError('Failed to fetch');
    });
    await expect(amplereadFetch('/v1/me')).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('does not refresh at the absolute end of the session', async () => {
    const end = '2026-10-12T00:00:00Z';
    const s = session('a1', 'r1', end);
    await saveSession({ ...s, tokens: { ...s.tokens, accessExpiresAt: end } });
    fetchMock.mockResolvedValueOnce(invalidToken());
    await expect(amplereadFetch('/v1/me')).rejects.toBeInstanceOf(AmpleReadSignedOutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serialises concurrent refreshes into one network refresh', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/v1/auth/refresh')) return json(200, session('a2', 'r2').tokens);
      return new Headers(init?.headers).get('authorization') === 'Bearer a2'
        ? json(200, {})
        : invalidToken();
    });
    await Promise.all([amplereadFetch('/v1/me'), amplereadFetch('/v1/me')]);
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/v1/auth/refresh')),
    ).toHaveLength(1);
  });

  it('throws signed-out without a session and makes no request', async () => {
    await clearSession();
    await expect(amplereadFetch('/v1/me')).rejects.toBeInstanceOf(AmpleReadSignedOutError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
