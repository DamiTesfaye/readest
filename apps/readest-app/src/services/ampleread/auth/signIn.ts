import { createPkcePair } from '@/services/sync/providers/oauth/pkce';
import { getApiBase } from '@/services/ampleread';
import { getAppVersion } from '@/utils/version';
import {
  AmpleReadHttpError,
  clearSession,
  getSession,
  saveSession,
  type StoredSession,
} from './session';
import { captureRedirect, currentPlatform, returnToFor, type AmpleReadPlatform } from './platform';
import type { ErrorBody, SignInResponse } from './types';

export interface HandoffRecord {
  req: string;
  verifier: string;
  returnTo: string;
}

export const buildStartUrl = (
  provider: 'google' | 'apple',
  platform: AmpleReadPlatform,
  returnTo: string,
  challenge: string,
): string => {
  const url = new URL(`${getApiBase()}/v1/auth/${provider}/start`);
  url.searchParams.set('platform', platform);
  url.searchParams.set('return_to', returnTo);
  url.searchParams.set('handoff_challenge', challenge);
  return url.toString();
};

const postJson = async (path: string, body: unknown): Promise<Response> => {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as ErrorBody | null;
    throw new AmpleReadHttpError(
      res.status,
      parsed,
      Number(res.headers.get('retry-after')) || null,
    );
  }
  return res;
};

const storeSignIn = async (res: Response): Promise<StoredSession> => {
  const { tokens, me } = (await res.json()) as SignInResponse;
  await saveSession({ tokens, me });
  return { tokens, me };
};

export const newHandoff = async (
  returnToBase: string,
): Promise<HandoffRecord & { challenge: string }> => {
  const { verifier, challenge } = await createPkcePair();
  const req = crypto.randomUUID();
  const url = new URL(returnToBase);
  url.searchParams.set('req', req);
  return { req, verifier, challenge, returnTo: url.toString() };
};

export const completeHandoff = async (
  redirectUrl: string,
  record: HandoffRecord,
): Promise<StoredSession> => {
  const params = new URL(redirectUrl).searchParams;
  if (params.get('req') !== record.req)
    throw new Error('Sign-in redirect belongs to another request');
  const error = params.get('error');
  if (error) throw new AmpleReadHttpError(400, { error, message: error }, null);
  const code = params.get('code');
  if (!code) throw new Error('Sign-in redirect carried no code');
  return storeSignIn(
    await postJson('/v1/auth/exchange', {
      code,
      handoffVerifier: record.verifier,
      appVersion: getAppVersion(),
    }),
  );
};

const untilAborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

export const signInWithProvider = async (
  provider: 'google' | 'apple',
  signal: AbortSignal = new AbortController().signal,
): Promise<StoredSession> => {
  const platform = currentPlatform();
  const capture = await returnToFor(platform);
  try {
    const handoff = await newHandoff(capture.returnToBase);
    const redirectUrl = await Promise.race([
      captureRedirect(
        platform,
        buildStartUrl(provider, platform, handoff.returnTo, handoff.challenge),
        handoff,
        capture,
      ),
      untilAborted(signal),
    ]);
    return await completeHandoff(redirectUrl, handoff);
  } finally {
    await capture.dispose();
  }
};

export const requestEmailCode = async (rawEmail: string): Promise<HandoffRecord> => {
  const platform = currentPlatform();
  const handoff = await newHandoff((await returnToFor(platform, { magicLink: true })).returnToBase);
  await postJson('/v1/auth/email', {
    email: rawEmail.trim().toLowerCase(),
    returnTo: handoff.returnTo,
    platform,
    handoffChallenge: handoff.challenge,
  });
  return handoff;
};

export const verifyEmailCode = async (
  email: string,
  code: string,
  record: HandoffRecord,
): Promise<StoredSession> =>
  storeSignIn(
    await postJson('/v1/auth/email/verify-code', {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      handoffVerifier: record.verifier,
      appVersion: getAppVersion(),
    }),
  );

export const signOut = async (): Promise<void> => {
  const session = await getSession();
  try {
    if (session) {
      await fetch(`${getApiBase()}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
      });
    }
  } catch (error) {
    console.warn('AmpleRead: logout request failed, clearing locally', error);
  } finally {
    await clearSession();
  }
};
