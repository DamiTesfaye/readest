import { isTauriAppPlatform } from '@/services/environment';
import { getApiBase } from '@/services/ampleread';
import { getAppVersion } from '@/utils/version';
import {
  createKeychainTokenPersistence,
  type TokenPersistence,
} from '@/services/sync/providers/oauth/keychainTokenStore';
import type { ErrorBody, Me, TokenPair } from './types';

export interface StoredSession {
  tokens: TokenPair;
  me: Me;
}

export class AmpleReadSignedOutError extends Error {
  constructor() {
    super('Not signed in to AmpleRead');
  }
}

export class AmpleReadHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody | null,
    readonly retryAfter: number | null,
  ) {
    super(body?.message || `AmpleRead request failed: ${status}`);
  }
}

const STORAGE_KEY = 'ampleread-session';
const REFRESH_LOCK = 'ampleread-session-refresh';
const REFRESH_RESEND_WINDOW_MS = 30_000;
const listeners = new Set<(s: StoredSession | null) => void>();
let keychain: Promise<TokenPersistence<StoredSession> | null> | null = null;
let fallbackChain: Promise<unknown> = Promise.resolve();

const getKeychain = () =>
  (keychain ??= createKeychainTokenPersistence<StoredSession>(STORAGE_KEY, 'AmpleRead'));
const notify = (s: StoredSession | null) => listeners.forEach((listener) => listener(s));

export const getSession = async (): Promise<StoredSession | null> => {
  if (isTauriAppPlatform()) return (await (await getKeychain())?.load()) ?? null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
};

export const saveSession = async (session: StoredSession): Promise<void> => {
  if (isTauriAppPlatform()) {
    const store = await getKeychain();
    if (!store) throw new Error('OS keychain unavailable for the AmpleRead session');
    await store.save(session);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
  notify(session);
};

export const clearSession = async (): Promise<void> => {
  if (isTauriAppPlatform()) await (await getKeychain())?.clear();
  else localStorage.removeItem(STORAGE_KEY);
  notify(null);
};

export const onSessionChange = (listener: (s: StoredSession | null) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readError = async (res: Response): Promise<ErrorBody | null> =>
  (await res
    .clone()
    .json()
    .catch(() => null)) as ErrorBody | null;

const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(REFRESH_LOCK, fn);
  const next = fallbackChain.then(fn, fn);
  fallbackChain = next.catch(() => {});
  return next;
};

const postRefresh = async (body: string): Promise<Response> => {
  const post = () =>
    fetch(`${getApiBase()}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  const sentAt = Date.now();
  try {
    return await post();
  } catch (error) {
    if (Date.now() - sentAt > REFRESH_RESEND_WINDOW_MS) throw error;
    return post();
  }
};

const refreshFrom = (failedAccess: string): Promise<StoredSession> =>
  withLock(async () => {
    const stored = await getSession();
    if (!stored) throw new AmpleReadSignedOutError();
    if (stored.tokens.accessToken !== failedAccess) return stored;
    if (stored.tokens.accessExpiresAt === stored.tokens.refreshExpiresAt) {
      await clearSession();
      throw new AmpleReadSignedOutError();
    }
    const res = await postRefresh(
      JSON.stringify({ refreshToken: stored.tokens.refreshToken, appVersion: getAppVersion() }),
    );
    if (res.status === 401) {
      await clearSession();
      throw new AmpleReadSignedOutError();
    }
    if (!res.ok)
      throw new AmpleReadHttpError(
        res.status,
        await readError(res),
        Number(res.headers.get('retry-after')) || null,
      );
    const next = { ...stored, tokens: (await res.json()) as TokenPair };
    await saveSession(next);
    return next;
  });

const send = (path: string, init: RequestInit, access: string) => {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${access}`);
  return fetch(`${getApiBase()}${path}`, { ...init, headers });
};

export const amplereadFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const stored = await getSession();
  if (!stored) throw new AmpleReadSignedOutError();
  const first = await send(path, init, stored.tokens.accessToken);
  if (first.status !== 401 || (await readError(first))?.error !== 'invalid_token') return first;
  const next = await refreshFrom(stored.tokens.accessToken);
  return send(path, init, next.tokens.accessToken);
};
