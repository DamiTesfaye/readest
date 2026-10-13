import { installFetch } from '@/services/ampleread';
import { amplereadFetch, getSession } from '@/services/ampleread/auth/session';
import type { MarginsStore } from './store';
import { familyCache } from './sync';

interface TextView {
  id: string;
  familyId: string;
  language: string;
  capped: boolean;
  meta: { title?: unknown; author?: unknown } | null;
}

const text = (v: unknown) => (typeof v === 'string' ? v : null);

export const rememberMatches = async (
  store: MarginsStore,
  matches: { textId: string; familyId: string; capped: boolean }[],
): Promise<void> => {
  for (const m of matches) {
    const known = await store.getText(m.textId);
    await store.putText({
      textId: m.textId,
      familyId: m.familyId,
      capped: m.capped,
      language: known?.language ?? null,
      title: known?.title ?? null,
      author: known?.author ?? null,
      fetchedAt: Date.now(),
    });
  }
};

const fetchText = async (store: MarginsStore, textId: string) => {
  try {
    const signedIn = !!(await getSession());
    const res = await (signedIn ? amplereadFetch : installFetch)(
      `/v1/texts/${encodeURIComponent(textId)}`,
    );
    if (!res.ok) {
      console.error('Margins: text info failed', res.status);
      return;
    }
    const view = (await res.json()) as TextView;
    if (typeof view.capped !== 'boolean') return;
    await store.putText({
      textId,
      familyId: text(view.familyId),
      capped: view.capped,
      language: text(view.language),
      title: text(view.meta?.title),
      author: text(view.meta?.author),
      fetchedAt: Date.now(),
    });
  } catch {
    console.error('Margins: text info failed', 'network');
  }
};

export const ensureTexts = async (store: MarginsStore, textIds: string[]): Promise<void> => {
  for (const textId of new Set(textIds)) {
    if (!(await store.getText(textId))) await fetchText(store, textId);
  }
};

export const isCapped = async (store: MarginsStore, textId: string | null): Promise<boolean> =>
  !textId || ((await store.getText(textId))?.capped ?? true);

export const readerTextIds = async (
  store: MarginsStore,
  textId: string | null,
): Promise<string[]> => {
  if (!textId) return [];
  const familyId = (await store.getText(textId))?.familyId ?? familyCache.get(textId);
  const family = familyId ? await store.familyTextIds(familyId) : [];
  return [...new Set([textId, ...family])];
};
