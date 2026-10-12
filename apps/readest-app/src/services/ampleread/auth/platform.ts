import { isTauriAppPlatform } from '@/services/environment';
import { getOSPlatform } from '@/utils/misc';
import type { HandoffRecord } from './signIn';

export type AmpleReadPlatform = 'web' | 'macos' | 'windows' | 'linux' | 'ios' | 'android';

export const DEEP_LINK_RETURN = 'ampleread://auth/callback';
export const WEB_RETURN_PATH = '/ampleread-auth/callback';
const WEB_HANDOFF_KEY = 'ampleread-handoff';
const SIGN_IN_DEADLINE_MS = 15 * 60_000;

export interface ReturnCapture {
  returnToBase: string;
  waitForUrl?: () => Promise<string>;
  dispose: () => Promise<void>;
}

export const currentPlatform = (): AmpleReadPlatform => {
  if (!isTauriAppPlatform()) return 'web';
  const os = getOSPlatform();
  return os === 'ios' || os === 'android' || os === 'windows' || os === 'linux' ? os : 'macos';
};

export const returnToFor = async (
  platform: AmpleReadPlatform,
  opts: { magicLink?: boolean } = {},
): Promise<ReturnCapture> => {
  if (platform === 'web')
    return { returnToBase: `${window.location.origin}${WEB_RETURN_PATH}`, dispose: async () => {} };
  if ((platform === 'macos' || platform === 'windows' || platform === 'linux') && !opts.magicLink) {
    const { start, cancel, onUrl } = await import('@fabianlars/tauri-plugin-oauth');
    const port = await start();
    let resolveUrl!: (url: string) => void;
    const received = new Promise<string>((resolve) => (resolveUrl = resolve));
    const unlisten = await onUrl(resolveUrl);
    return {
      returnToBase: `http://127.0.0.1:${port}/auth/callback`,
      waitForUrl: () => received,
      dispose: async () => {
        unlisten();
        await cancel(port);
      },
    };
  }
  return { returnToBase: DEEP_LINK_RETURN, dispose: async () => {} };
};

const withDeadline = <T>(promise: Promise<T>): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Sign-in timed out')), SIGN_IN_DEADLINE_MS),
    ),
  ]);

export const captureRedirect = async (
  platform: AmpleReadPlatform,
  startUrl: string,
  handoff: HandoffRecord,
  capture: ReturnCapture,
): Promise<string> => {
  if (platform === 'web') {
    sessionStorage.setItem(`${WEB_HANDOFF_KEY}:${handoff.req}`, JSON.stringify(handoff));
    window.location.assign(startUrl);
    return new Promise<string>(() => {});
  }
  if (platform === 'ios') {
    const { authWithSafari } = await import('@/app/auth/utils/nativeAuth');
    return (await withDeadline(authWithSafari({ authUrl: startUrl, callbackScheme: 'ampleread' })))
      .redirectUrl;
  }
  if (platform === 'android') {
    const { authWithCustomTab } = await import('@/app/auth/utils/nativeAuth');
    return (
      await withDeadline(authWithCustomTab({ authUrl: startUrl, callbackUrl: DEEP_LINK_RETURN }))
    ).redirectUrl;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(startUrl);
  return withDeadline(capture.waitForUrl!());
};

export const takeWebHandoff = (req: string): HandoffRecord | null => {
  const key = `${WEB_HANDOFF_KEY}:${req}`;
  const raw = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  return raw ? (JSON.parse(raw) as HandoffRecord) : null;
};
