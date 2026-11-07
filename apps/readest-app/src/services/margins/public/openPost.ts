import { eventDispatcher } from '@/utils/event';
import type { MarginsStore } from '../store';
import { familyCache } from '../sync';
import type { PostView } from './api';

export const TRENDING_RAIL_LIMIT = 6;
export const PENDING_OPEN_KEY = 'margins-pending-open';
export const MARGINS_POST_PENDING_EVENT = 'margins-post-pending';
export const MARGINS_OPEN_POST_EVENT = 'margins-open-post';

const OWNED_MAX = 500;

export type OpenTarget =
  | { kind: 'library'; bookHash: string }
  | { kind: 'download'; workId: string }
  | { kind: 'yourCopy' };

const familyOf = async (store: MarginsStore, textId: string) =>
  familyCache.get(textId) ?? (await store.getText(textId))?.familyId ?? null;

export const openTargetFor = async (
  post: PostView,
  store: MarginsStore,
  libraryHashes: string[],
): Promise<OpenTarget> => {
  const family = await familyOf(store, post.textId);
  for (const bookHash of libraryHashes) {
    const link = await store.getTextLink(bookHash);
    if (!link) continue;
    const linkFamily = link.familyId ?? familyCache.get(link.textId) ?? null;
    if (link.textId === post.textId || (family !== null && linkFamily === family))
      return { kind: 'library', bookHash };
  }
  if (post.book.workId && !post.book.capped) return { kind: 'download', workId: post.book.workId };
  return { kind: 'yourCopy' };
};

const pendingPosts = new Map<string, PostView>();

export const requestPostOpen = (fileHash: string, post: PostView): void => {
  pendingPosts.set(fileHash, post);
  eventDispatcher.dispatch(MARGINS_POST_PENDING_EVENT, { fileHash });
};

export const takePostOpen = (fileHash: string): PostView | null => {
  const post = pendingPosts.get(fileHash) ?? null;
  pendingPosts.delete(fileHash);
  return post;
};

export const rememberPendingOpen = (post: PostView): void =>
  localStorage.setItem(PENDING_OPEN_KEY, JSON.stringify({ textId: post.textId, postId: post.id }));

type PendingEntry = { textId?: string; postId?: string } | null;

export const takePendingOpen = (textId: string): string | null => {
  try {
    const entry = JSON.parse(localStorage.getItem(PENDING_OPEN_KEY) ?? 'null') as PendingEntry;
    const family = familyCache.get(textId);
    const same =
      entry?.textId === textId || (!!family && familyCache.get(entry?.textId ?? '') === family);
    if (!same || typeof entry?.postId !== 'string') return null;
    localStorage.removeItem(PENDING_OPEN_KEY);
    return entry.postId;
  } catch {
    localStorage.removeItem(PENDING_OPEN_KEY);
    return null;
  }
};

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

const ownedHash = async (salt: string, textId: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${textId}`))).slice(
    0,
    12,
  );

export const ownedHashes = async (store: MarginsStore, salt: string): Promise<string[]> =>
  Promise.all((await store.allTextIds()).slice(0, OWNED_MAX).map((id) => ownedHash(salt, id)));

let salt: string | null = null;
export const sessionSalt = (): string => (salt ??= crypto.randomUUID());
