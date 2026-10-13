import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import type { PostView } from '@/services/margins/public/api';
import { MARGINS_OPEN_PASSAGE_EVENT, type OpenPassage } from '@/services/margins/public/badges';
import { useMarginsPublic } from '@/services/margins/public/flag';
import { MARGINS_OPEN_POST_EVENT } from '@/services/margins/public/openPost';
import { currentPost, refreshMyPosts, useMyPosts } from '@/services/margins/public/myPosts';
import { type LayerRow, openMarginsStore } from '@/services/margins/store';
import { eventDispatcher } from '@/utils/event';
import { navigateToReader } from '@/utils/nav';
import {
  MARGINS_OPEN_CARD_EVENT,
  requestMarginOpen,
  viewPostInPlace,
} from '../../hooks/useMarginsPainter';
import PassageSheet from './PassageSheet';
import { PostSheet } from './PostCard';
import PublishSheet, { MARGINS_PUBLISH_EVENT, MARGINS_SHORTEN_EVENT } from './PublishSheet';

export const offerPublish = (layerId: string, message: string, label: string, bookKey?: string) =>
  eventDispatcher.dispatch('toast', {
    message,
    type: 'info',
    action: {
      label,
      onClick: () => eventDispatcher.dispatch(MARGINS_PUBLISH_EVENT, { layerId, bookKey }),
    },
  });

interface PublicMarginsHostProps {
  bookKey: string | null;
  postId?: string | null;
}

const PublicMarginsHost = ({ bookKey, postId }: PublicMarginsHostProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const router = useRouter();
  const on = useMarginsPublic();
  const [passage, setPassage] = useState<OpenPassage | null>(null);
  const [single, setSingle] = useState<string | null>(null);

  useEffect(() => {
    if (postId) setSingle(postId);
  }, [postId]);
  const { posts } = useMyPosts();
  const [row, setRow] = useState<LayerRow | null>(null);
  const owned = useRef<string | null>(null);

  useEffect(() => {
    if (!appService) return;
    const fail = () => console.error('Margins: public action failed');
    const findRow = async (layerId: string) => {
      const store = await openMarginsStore(appService);
      const userId = (await getSession())?.me.id ?? null;
      return (await store.allLayers(userId)).find((r) => r.id === layerId) ?? null;
    };
    const onPublish = (e: CustomEvent) => {
      const { layerId, bookKey: target } = e.detail ?? {};
      if (target !== undefined && target !== bookKey) return;
      findRow(layerId)
        .then((found) => {
          owned.current = found?.id ?? null;
          setRow(found);
        })
        .catch(fail);
    };
    const onShorten = (e: CustomEvent) => {
      const { layerId } = e.detail ?? {};
      if (bookKey !== null) {
        if (owned.current !== layerId) return;
        eventDispatcher.dispatch(MARGINS_OPEN_CARD_EVENT, { bookKey, ids: [layerId] });
        return;
      }
      findRow(layerId)
        .then((found) => {
          if (!found) return;
          requestMarginOpen(found.fileHash, layerId);
          navigateToReader(router, [found.fileHash]);
        })
        .catch(fail);
    };
    eventDispatcher.on(MARGINS_PUBLISH_EVENT, onPublish);
    eventDispatcher.on(MARGINS_SHORTEN_EVENT, onShorten);
    return () => {
      eventDispatcher.off(MARGINS_PUBLISH_EVENT, onPublish);
      eventDispatcher.off(MARGINS_SHORTEN_EVENT, onShorten);
    };
  }, [appService, bookKey, router]);

  useEffect(() => {
    if (bookKey !== null) return;
    const onPost = (e: CustomEvent<{ postId?: string }>) => setSingle(e.detail?.postId ?? null);
    eventDispatcher.on(MARGINS_OPEN_POST_EVENT, onPost);
    return () => eventDispatcher.off(MARGINS_OPEN_POST_EVENT, onPost);
  }, [bookKey]);

  useEffect(() => {
    if (bookKey === null) return;
    const onPassage = (e: CustomEvent<OpenPassage>) => {
      if (e.detail?.bookKey === bookKey) setPassage(e.detail);
    };
    eventDispatcher.on(MARGINS_OPEN_PASSAGE_EVENT, onPassage);
    return () => eventDispatcher.off(MARGINS_OPEN_PASSAGE_EVENT, onPassage);
  }, [bookKey]);

  const viewInPlace = (post: PostView | null) => {
    if (bookKey === null) return;
    viewPostInPlace(bookKey, post)
      .then((found) => {
        if (found === 'missing')
          eventDispatcher.dispatch('toast', {
            message: _("This passage isn't in your copy."),
            type: 'info',
          });
      })
      .catch(() => console.error('Margins: view in place failed'));
  };

  if (!on) return null;

  return (
    <>
      {row && (
        <PublishSheet
          key={row.id}
          row={row}
          existing={currentPost(row.id, posts)}
          onClose={() => setRow(null)}
          onPublished={() => void refreshMyPosts()}
        />
      )}
      {single && <PostSheet key={single} postId={single} onClose={() => setSingle(null)} />}
      {passage && (
        <PassageSheet
          key={`${passage.section}:${passage.start}:${passage.end}`}
          {...passage}
          onClose={() => setPassage(null)}
          onViewInPlace={viewInPlace}
        />
      )}
    </>
  );
};

export default PublicMarginsHost;
