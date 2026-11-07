import {
  call,
  callJson,
  type PostPage,
  PublicApiError,
  query,
  type TrendingRequest,
  withBody,
} from './api';
import type { EngagementKind } from './feedApi';

export interface UserProfile {
  handle: string;
  displayName: string;
  followers: number;
  following: number;
  followed: boolean;
  mine: boolean;
}

export interface BlockedAccount {
  handle: string;
  displayName: string;
}

export interface HiddenBook {
  textId: string;
  title: string | null;
}

const seg = encodeURIComponent;

const at = (path: string, params: Record<string, string | undefined>) => {
  const q = query(params);
  return q ? `${path}?${q}` : path;
};

const send = async (method: 'PUT' | 'DELETE', path: string) => {
  await call(path, { method });
};

export const socialApi = {
  follow: (handle: string, postId?: string) =>
    send('PUT', at(`/v1/follows/${seg(handle)}`, { post: postId })),
  unfollow: (handle: string) => send('DELETE', `/v1/follows/${seg(handle)}`),
  block: (handle: string) => send('PUT', `/v1/me/blocks/${seg(handle)}`),
  unblock: (handle: string) => send('DELETE', `/v1/me/blocks/${seg(handle)}`),
  blocks: () => callJson<BlockedAccount[]>('/v1/me/blocks'),
  hideBook: (textId: string) => send('PUT', `/v1/me/hidden-books/${seg(textId)}`),
  unhideBook: (textId: string) => send('DELETE', `/v1/me/hidden-books/${seg(textId)}`),
  hiddenBooks: () => callJson<HiddenBook[]>('/v1/me/hidden-books'),
  profile: async (handle: string): Promise<UserProfile | 'blocked' | null> => {
    try {
      return await callJson<UserProfile>(`/v1/users/${seg(handle)}`, {}, true);
    } catch (error) {
      if (error instanceof PublicApiError && error.code === 'blocked') return 'blocked';
      if (error instanceof PublicApiError && error.status === 404) return null;
      throw error;
    }
  },
  profilePosts: (handle: string, cursor?: string) =>
    callJson<PostPage>(at(`/v1/users/${seg(handle)}/posts`, { cursor }), {}, true),
  forYou: (o: TrendingRequest) => callJson<PostPage>('/v1/feed/for-you', withBody('POST', o), true),
  following: (cursor?: string) => callJson<PostPage>(at('/v1/feed/following', { cursor })),
  events: async (events: { postId: string; kind: EngagementKind }[]) => {
    await call('/v1/feed/events', { ...withBody('POST', { events }), keepalive: true });
  },
};
