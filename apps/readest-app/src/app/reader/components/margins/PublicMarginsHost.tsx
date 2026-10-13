import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { getSession } from '@/services/ampleread/auth/session';
import { currentPost, refreshMyPosts, useMyPosts } from '@/services/margins/public/myPosts';
import { type LayerRow, openMarginsStore } from '@/services/margins/store';
import { eventDispatcher } from '@/utils/event';
import { navigateToReader } from '@/utils/nav';
import { MARGINS_OPEN_CARD_EVENT, requestMarginOpen } from '../../hooks/useMarginsPainter';
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

const PublicMarginsHost = ({ bookKey }: { bookKey: string | null }) => {
  const { appService } = useEnv();
  const router = useRouter();
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

  if (!row) return null;
  return (
    <PublishSheet
      key={row.id}
      row={row}
      existing={currentPost(row.id, posts)}
      onClose={() => setRow(null)}
      onPublished={() => void refreshMyPosts()}
    />
  );
};

export default PublicMarginsHost;
