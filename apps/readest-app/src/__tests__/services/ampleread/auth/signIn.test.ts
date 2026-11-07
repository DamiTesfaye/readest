import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStartUrl,
  completeHandoff,
  requestEmailCode,
  signOut,
  verifyEmailCode,
} from '@/services/ampleread/auth/signIn';
import { getSession, saveSession, type StoredSession } from '@/services/ampleread/auth/session';

vi.mock('@/services/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/environment')>()),
  isTauriAppPlatform: () => false,
}));

const signInBody: StoredSession = {
  tokens: {
    accessToken: 'a',
    refreshToken: 'r',
    tokenType: 'Bearer',
    accessExpiresAt: '2099-01-01T00:00:00Z',
    refreshExpiresAt: '2099-02-01T00:00:00Z',
  },
  me: {
    id: 'usr_1',
    email: 'x@y.z',
    displayName: null,
    avatarUrl: null,
    createdAt: '2026-10-12T00:00:00Z',
    identities: [],
  },
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const record = {
  req: 'req1',
  verifier: 'v'.repeat(86),
  returnTo: 'ampleread://auth/callback?req=req1',
};

describe('AmpleRead sign-in', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('builds a start URL with snake_case params', () => {
    const url = new URL(buildStartUrl('google', 'ios', record.returnTo, 'c'.repeat(43)));
    expect(url.pathname).toBe('/v1/auth/google/start');
    expect(url.searchParams.get('platform')).toBe('ios');
    expect(url.searchParams.get('return_to')).toBe(record.returnTo);
    expect(url.searchParams.get('handoff_challenge')).toHaveLength(43);
  });

  it('exchanges the code with the verifier, without a bearer, and stores the session', async () => {
    fetchMock.mockResolvedValueOnce(json(200, signInBody));
    await completeHandoff('ampleread://auth/callback?req=req1&code=CODE', record);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\/auth\/exchange$/);
    expect(JSON.parse(String(init!.body))).toMatchObject({
      code: 'CODE',
      handoffVerifier: record.verifier,
    });
    expect(new Headers(init!.headers).has('authorization')).toBe(false);
    expect((await getSession())?.me.id).toBe('usr_1');
  });

  it('rejects a redirect for another request before any network call', async () => {
    await expect(
      completeHandoff('ampleread://auth/callback?req=other&code=CODE', record),
    ).rejects.toThrow(/another request/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns an error redirect into a typed failure', async () => {
    await expect(
      completeHandoff('ampleread://auth/callback?req=req1&error=access_denied', record),
    ).rejects.toMatchObject({ body: { error: 'access_denied' } });
  });

  it('surfaces 400 expired_code and stores nothing', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { error: 'expired_code', message: 'This code or link has expired' }),
    );
    await expect(
      completeHandoff('ampleread://auth/callback?req=req1&code=OLD', record),
    ).rejects.toMatchObject({ status: 400 });
    expect(await getSession()).toBeNull();
  });

  it('requests an email code without a bearer even when signed in, then verifies it', async () => {
    await saveSession(signInBody);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 202 }));
    const rec = await requestEmailCode(' X@Y.Z ');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init!.headers).has('authorization')).toBe(false);
    expect(JSON.parse(String(init!.body))).toMatchObject({ email: 'x@y.z', platform: 'web' });
    expect(JSON.parse(String(init!.body)).handoffChallenge).toHaveLength(43);
    fetchMock.mockResolvedValueOnce(json(200, signInBody));
    await verifyEmailCode('x@y.z', '123456', rec);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toMatchObject({
      code: '123456',
      handoffVerifier: rec.verifier,
    });
  });

  it('signs out with the refresh token in the body and clears locally when offline', async () => {
    await saveSession(signInBody);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await signOut();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ refreshToken: 'r' });
    expect(await getSession()).toBeNull();
  });
});
