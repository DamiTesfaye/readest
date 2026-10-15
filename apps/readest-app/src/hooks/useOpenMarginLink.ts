import { getCurrent } from '@tauri-apps/plugin-deep-link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isTauriAppPlatform } from '@/services/environment';
import { parseMarginDeepLink } from '@/utils/deeplink';
import { eventDispatcher } from '@/utils/event';
import { navigateToLibrary } from '@/utils/nav';

const COLD_START_KEY = 'consumedColdStartMarginUrl';
let coldStartConsumed = false;

const firstColdStart = (url: string) => {
  try {
    if (sessionStorage.getItem(COLD_START_KEY) === url) return false;
    sessionStorage.setItem(COLD_START_KEY, url);
  } catch {
    return true;
  }
  return true;
};

export function useOpenMarginLink() {
  const router = useRouter();

  useEffect(() => {
    if (!isTauriAppPlatform()) return;
    const handle = (url: string, coldStart = false) => {
      const parsed = parseMarginDeepLink(url);
      if (!parsed || (coldStart && !firstColdStart(url))) return;
      navigateToLibrary(router, `post=${encodeURIComponent(parsed.postId)}`);
    };
    if (!coldStartConsumed) {
      coldStartConsumed = true;
      getCurrent()
        .then((urls) => urls?.forEach((u) => handle(u, true)))
        .catch(() => console.error('Margins: deep link read failed'));
    }
    const onIncoming = (event: CustomEvent) => {
      const { urls } = event.detail as { urls: string[] };
      urls.forEach((u) => handle(u));
    };
    eventDispatcher.on('app-incoming-url', onIncoming);
    return () => eventDispatcher.off('app-incoming-url', onIncoming);
  }, [router]);
}
