import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { TOCItem } from '@/libs/document';
import { type BookLocator, createBookLocator } from '@/services/mindmap/generate/anchors';
import { reconcileMap } from '@/services/mindmap/generate/reconcileMap';
import { seedGenerator } from '@/services/mindmap/generate/seedGenerator';
import type { MapSession } from '@/services/mindmap/persist/session';
import { resolveAdaptive } from '@/services/mindmap/reveal/adaptive';
import type { MapSource } from '@/services/mindmap/schema/types';
import { isLive } from '@/services/mindmap/spatial/spatialIndex';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { useBookDataStore } from '@/store/bookDataStore';
import { getBookProgress } from '@/store/readerProgressStore';
import { eventDispatcher } from '@/utils/event';

export const RECONCILE_DELAY_MS = 250;
const EMPTY_TOC: readonly TOCItem[] = [];

export interface MapReconcileInput {
  bookKey: string;
  session: MapSession;
  controller: CanvasController | null;
  locator: BookLocator | null;
  source: MapSource;
}

export const useBookLocator = (bookKey: string): BookLocator | null => {
  const bookDoc = useBookDataStore((state) => state.getBookData(bookKey)?.bookDoc ?? null);
  return useMemo(() => (bookDoc ? createBookLocator(bookDoc) : null), [bookDoc]);
};

export const useMapReconcile = ({
  bookKey,
  session,
  controller,
  locator,
  source,
}: MapReconcileInput): void => {
  const _ = useTranslation();
  const failedMessage = _('Could not generate the mind map');
  const failed = useRef(failedMessage);
  failed.current = failedMessage;
  const book = useBookDataStore((state) => state.getBookData(bookKey)?.book ?? null);
  const bookRef = useRef(book);
  bookRef.current = book;
  const toc = useBookDataStore((state) => state.getBookData(bookKey)?.bookDoc?.toc ?? null);
  const booknotes = useBookDataStore(
    (state) => state.getBookData(bookKey)?.config?.booknotes ?? null,
  );
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!controller || !locator || source !== 'generated') return;
    const abort = new AbortController();
    let fitViewFrame: number | null = null;
    const run = async (): Promise<void> => {
      const current = bookRef.current;
      if (!current || abort.signal.aborted) return;
      const meta = session.meta();
      const wasEmpty = !controller.store.all().some(isLive);
      const { intent } = resolveAdaptive({
        intent: meta.intent,
        spoiler: meta.spoiler,
        subject: current.metadata?.subject,
        readingStatus: current.readingStatus,
        progress: getBookProgress(bookKey)?.fraction ?? 0,
      });
      const outcome = await reconcileMap({
        controller,
        meta,
        generator: seedGenerator,
        input: {
          book: current,
          toc: toc ?? EMPTY_TOC,
          annotations: booknotes ?? [],
          intent,
          locator,
        },
        signal: abort.signal,
      });
      if (outcome === 'applied' && wasEmpty) {
        fitViewFrame = requestAnimationFrame(() => controller.fitView(false));
      }
      if (outcome !== 'failed') return;
      eventDispatcher.dispatch('toast', { type: 'error', message: failed.current });
    };
    const timer = setTimeout(() => {
      queue.current = queue.current
        .then(run)
        .catch((error: unknown) => console.error('mindmap: reconcile failed', error));
    }, RECONCILE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
      if (fitViewFrame !== null) cancelAnimationFrame(fitViewFrame);
    };
  }, [bookKey, session, controller, locator, toc, booknotes, source]);
};
