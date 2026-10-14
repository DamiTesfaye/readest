import { useCallback, useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import type { AppService } from '@/types/system';
import { getLocale } from '@/utils/misc';
import { unpackScene } from '../replay/scene';
import type { Scene } from '../replay/types';
import { openMarginsStore } from '../store';
import { type PostPage, type PostView, publicApi, type TrendingRequest } from './api';
import { useMarginsPublic } from './flag';
import { ownedHashes, sessionSalt } from './openPost';
import { socialApi } from './social';

export type FeedSource =
  | { kind: 'for-you' }
  | { kind: 'following' }
  | { kind: 'book'; textId: string; order: 'ranked' | 'book' };

export type EngagementKind = 'view' | 'completion' | 'replay' | 'your_turn' | 'get_book';

type Params = Pick<URLSearchParams, 'get'> | null;

const SCENES_KEPT = 50;
const scenes = new Map<string, Promise<Scene | null>>();

export const FEED_PARAMS = ['feed', 'text', 'order'];

export const feedSourceOf = (params: Params): FeedSource | null => {
  if (params?.get('margins') === 'trending') return { kind: 'for-you' };
  const feed = params?.get('feed');
  if (feed === 'for-you' || feed === 'following') return { kind: feed };
  const textId = params?.get('text');
  if (feed !== 'book' || !textId) return null;
  return { kind: 'book', textId, order: params?.get('order') === 'book' ? 'book' : 'ranked' };
};

export const isFeedView = (params: Params): boolean => feedSourceOf(params) !== null;

export const bookFeedParams = (textId: string): string =>
  `feed=book&text=${encodeURIComponent(textId)}&order=ranked`;

export const useBookTextId = (hash: string | null): string | null => {
  const { appService } = useEnv();
  const on = useMarginsPublic();
  const [textId, setTextId] = useState<string | null>(null);
  useEffect(() => {
    setTextId(null);
    if (!on || !hash || !appService) return;
    let live = true;
    openMarginsStore(appService)
      .then((store) => store.getTextLink(hash))
      .then((link) => live && setTextId(link?.textId ?? null))
      .catch(() => live && setTextId(null));
    return () => {
      live = false;
    };
  }, [on, hash, appService]);
  return textId;
};

const trendingBody = async (
  appService: AppService | null,
  cursor?: string,
): Promise<TrendingRequest> => {
  const salt = sessionSalt();
  const owned = appService ? await ownedHashes(await openMarginsStore(appService), salt) : [];
  const lang = getLocale().split('-')[0] || 'en';
  return { cursor, lang, salt, owned };
};

const trendingPage = async (appService: AppService | null, cursor?: string): Promise<PostPage> =>
  publicApi.trending(await trendingBody(appService, cursor));

export const useTrendingPage = () => {
  const { appService } = useEnv();
  return useCallback((cursor?: string) => trendingPage(appService, cursor), [appService]);
};

export const fetchFeedPage = async (
  source: FeedSource,
  cursor: string | undefined,
  deps: { appService: AppService | null },
): Promise<PostPage> => {
  if (source.kind === 'for-you')
    return socialApi.forYou(await trendingBody(deps.appService, cursor));
  if (source.kind === 'following') return socialApi.following(cursor);
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
