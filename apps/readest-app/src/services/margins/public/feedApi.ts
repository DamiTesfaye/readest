import { useCallback } from 'react';
import { useEnv } from '@/context/EnvContext';
import type { AppService } from '@/types/system';
import { getLocale } from '@/utils/misc';
import { unpackScene } from '../replay/scene';
import type { Scene } from '../replay/types';
import { openMarginsStore } from '../store';
import { type PostPage, type PostView, publicApi } from './api';
import { ownedHashes, sessionSalt } from './openPost';

export type FeedSource =
  | { kind: 'for-you' }
  | { kind: 'following' }
  | { kind: 'book'; textId: string; order: 'ranked' | 'book' };

export type EngagementKind = 'view' | 'completion' | 'replay' | 'your_turn' | 'get_book';

const SCENES_KEPT = 50;
const scenes = new Map<string, Promise<Scene | null>>();

const trendingPage = async (appService: AppService | null, cursor?: string): Promise<PostPage> => {
  const salt = sessionSalt();
  const owned = appService ? await ownedHashes(await openMarginsStore(appService), salt) : [];
  const lang = getLocale().split('-')[0] || 'en';
  return publicApi.trending({ cursor, lang, salt, owned });
};

export const useTrendingPage = () => {
  const { appService } = useEnv();
  return useCallback((cursor?: string) => trendingPage(appService, cursor), [appService]);
};

export const fetchFeedPage = async (
  source: FeedSource,
  cursor: string | undefined,
  deps: { appService: AppService | null },
): Promise<PostPage> => {
  if (source.kind === 'for-you') return trendingPage(deps.appService, cursor);
  if (source.kind === 'following') return { posts: [], nextCursor: null };
  return publicApi.familyFeed(source.textId, source.order, cursor);
};

export const sceneOf = (post: PostView): Promise<Scene | null> => {
  if (!post.sceneAsset) return Promise.resolve(null);
  let scene = scenes.get(post.id);
  if (!scene) {
    scene = publicApi
      .postAsset(post.id, post.sceneAsset)
      .then(async (blob) => (blob ? unpackScene(new Uint8Array(await blob.arrayBuffer())) : null))
      .catch(() => {
        scenes.delete(post.id);
        return null;
      });
    scenes.set(post.id, scene);
    if (scenes.size > SCENES_KEPT) scenes.delete(scenes.keys().next().value!);
  }
  return scene;
};

export const artRefs = (post: PostView): string[] =>
  ((post.payload as { elements?: { kind?: string; asset?: unknown }[] } | null)?.elements ?? [])
    .map((e) => (e?.kind === 'artwork' ? e.asset : null))
    .filter((a): a is string => typeof a === 'string');

export const preloadPost = (post: PostView): void => {
  void sceneOf(post);
  for (const ref of [post.coverAsset, ...artRefs(post)]) {
    if (ref) void publicApi.postAssetUrl(post.id, ref).catch(() => null);
  }
};
