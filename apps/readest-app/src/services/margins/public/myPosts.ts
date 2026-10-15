import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/services/ampleread/auth/session';
import { eventDispatcher } from '@/utils/event';
import type { LayerRow } from '../store';
import { type MyPost, publicApi } from './api';
import { useMarginsPublic } from './flag';

export const MY_POSTS_CHANGED_EVENT = 'margins-my-posts-changed';

export type PublicState =
  | { kind: 'none' }
  | { kind: 'live'; post: MyPost }
  | { kind: 'changed'; post: MyPost }
  | { kind: 'hidden'; post: MyPost }
  | { kind: 'removed'; post: MyPost };

export const currentPost = (layerId: string, mine: MyPost[]): MyPost | null =>
  mine.find((p) => p.layerId === layerId && p.status !== 'unpublished') ?? null;

export const publicStateOf = (row: LayerRow, mine: MyPost[]): PublicState => {
  const post = currentPost(row.id, mine);
  if (!post) return { kind: 'none' };
  if (post.status === 'removed' || post.status === 'hidden') return { kind: post.status, post };
  return row.rev !== null && row.rev > post.layerRev
    ? { kind: 'changed', post }
    : { kind: 'live', post };
};

export const refreshMyPosts = () => eventDispatcher.dispatch(MY_POSTS_CHANGED_EVENT);

export const unpublishPost = async (
  ask: (message: string) => Promise<boolean>,
  message: string,
  post: MyPost,
) => {
  if (!(await ask(message))) return;
  await publicApi.unpublish(post.id);
  await refreshMyPosts();
};

export const useMyPosts = () => {
  const on = useMarginsPublic();
  const [posts, setPosts] = useState<MyPost[]>([]);
  const refresh = useCallback(async () => {
    if (!on || !(await getSession())) return setPosts([]);
    setPosts(await publicApi.myPosts());
  }, [on]);
  useEffect(() => {
    const reload = () => {
      refresh().catch(() => console.error('Margins: my posts read failed'));
    };
    reload();
    eventDispatcher.on(MY_POSTS_CHANGED_EVENT, reload);
    return () => eventDispatcher.off(MY_POSTS_CHANGED_EVENT, reload);
  }, [refresh]);
  return { posts, refresh };
};
