import { getSession } from '@/services/ampleread/auth/session';
import type { EngagementKind } from './feedApi';
import { socialApi } from './social';

type EngagementEvent = { postId: string; kind: EngagementKind };

const FLUSH_MS = 10_000;
const MAX = 50;

export const createEngagement = (
  send: (events: EngagementEvent[]) => Promise<void>,
  o: { flushMs?: number; max?: number } = {},
) => {
  const flushMs = o.flushMs ?? FLUSH_MS;
  const max = o.max ?? MAX;
  const seen = new Set<string>();
  let queue: EngagementEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = queue;
    queue = [];
    if (!batch.length) return;
    try {
      await send(batch);
    } catch {
      console.warn('Margins: events failed');
    }
  };

  const onPageHide = () => void flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
  }

  return {
    count(postId: string, kind: EngagementKind) {
      const key = `${postId}:${kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push({ postId, kind });
      if (queue.length >= max) void flush();
      else timer ??= setTimeout(() => void flush(), flushMs);
    },
    flush,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      queue = [];
      if (typeof window === 'undefined') return;
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
};

export const engagement = createEngagement(async (events) => {
  if (await getSession()) await socialApi.events(events);
});
