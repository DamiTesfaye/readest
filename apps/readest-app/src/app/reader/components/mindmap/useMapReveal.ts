import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import type { MapSession } from '@/services/mindmap/persist/session';
import { resolveAdaptive } from '@/services/mindmap/reveal/adaptive';
import {
  type ChapterStart,
  chapterStarts as tocChapterStarts,
} from '@/services/mindmap/reveal/chapters';
import {
  type FogCluster,
  type FogRedaction,
  chapterAt,
  computeReveal,
  readingFloor,
  visibleFilter,
} from '@/services/mindmap/reveal/visibility';
import type { MapMeta, MapRecord } from '@/services/mindmap/schema/types';
import { isLive } from '@/services/mindmap/spatial/spatialIndex';
import type { Diff } from '@/services/mindmap/store/mapStore';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useMapRecordsWhen } from './useCanvasStores';

export interface MapRevealInput {
  bookKey: string;
  session: MapSession;
  controller: CanvasController | null;
  meta: MapMeta;
  locator: BookLocator | null;
  animate: boolean;
}

export interface MapReveal {
  ready: boolean;
  chapterStarts: readonly ChapterStart[];
  clusters: FogCluster[];
  redacted: FogRedaction[];
}

const REVEAL_FIELDS: ReadonlySet<string> = new Set(['revealAt', 'deleted', 'parentId', 'type']);
const BOX_FIELDS: ReadonlySet<string> = new Set(['x', 'y', 'w', 'h']);

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

const revealsBetween = (records: readonly MapRecord[], from: number, to: number): boolean =>
  records.some(
    (record) =>
      isLive(record) && record.revealAt !== null && record.revealAt > from && record.revealAt <= to,
  );

export const useMapReveal = ({
  bookKey,
  session,
  controller,
  meta,
  locator,
  animate,
}: MapRevealInput): MapReveal => {
  const _ = useTranslation();
  const bookProgress = useBookProgress(bookKey);
  const progress = bookProgress?.fraction ?? 0;
  const location = bookProgress?.location ?? '';
  const floor = useMemo(
    () => readingFloor(locator, { fraction: progress, location }),
    [locator, progress, location],
  );
  const book = useBookDataStore((state) => state.getBookData(bookKey)?.book ?? null);
  const toc = useBookDataStore((state) => state.getBookData(bookKey)?.bookDoc?.toc ?? null);
  const hiddenRef = useRef<ReadonlySet<string>>(new Set());
  const touches = useCallback(
    (diff: Diff) =>
      diff.added.length > 0 ||
      diff.discarded.length > 0 ||
      diff.changed.some(
        (change) =>
          REVEAL_FIELDS.has(change.field) ||
          (BOX_FIELDS.has(change.field) && hiddenRef.current.has(change.id)),
      ),
    [],
  );
  const records = useMapRecordsWhen(session.store, touches);
  const [seenAtOpen] = useState(() => session.meta().lastSeenProgress);
  const { spoiler } = resolveAdaptive({
    intent: meta.intent,
    spoiler: meta.spoiler,
    subject: book?.metadata?.subject,
    readingStatus: book?.readingStatus,
    progress,
  });
  const chapterStarts = useMemo(
    () => (locator && toc ? tocChapterStarts(toc, locator) : []),
    [locator, toc],
  );
  const state = useMemo(
    () =>
      computeReveal({
        records,
        spoiler,
        progress: floor,
        lastSeenProgress: seenAtOpen,
        chapterStarts,
      }),
    [records, spoiler, floor, seenAtOpen, chapterStarts],
  );
  const [opening, setOpening] = useState(animate);
  const [ready, setReady] = useState(false);
  const applied = useRef<{ controller: CanvasController | null; hidden: ReadonlySet<string> }>({
    controller: null,
    hidden: new Set(),
  });

  useLayoutEffect(() => {
    hiddenRef.current = state.hidden;
    if (!controller) return;
    const hidden = opening ? new Set([...state.hidden, ...state.newIds]) : state.hidden;
    if (applied.current.controller !== controller || !sameMembers(applied.current.hidden, hidden)) {
      controller.visible.set(visibleFilter(hidden));
      applied.current = { controller, hidden };
    }
    setReady(true);
  }, [controller, state, opening]);

  useEffect(() => {
    if (!ready || !opening) return;
    const frame = requestAnimationFrame(() => setOpening(false));
    return () => cancelAnimationFrame(frame);
  }, [ready, opening]);

  const announced = useRef(0);
  useEffect(() => {
    if (!ready || opening) return;
    const fresh = state.newIds.length - announced.current;
    announced.current = state.newIds.length;
    if (fresh > 0) {
      useMindmapViewStore.getState().announce(_('{{count}} new nodes revealed', { count: fresh }));
    }
    const stored = session.meta().lastSeenProgress;
    if (!session.readOnly && revealsBetween(records, stored, floor)) {
      session.updateMeta({ lastSeenProgress: floor });
    }
  }, [ready, opening, state, records, floor, session, _]);

  const showChip = meta.source === 'generated' && spoiler !== 'whole';
  const chapter = chapterAt(chapterStarts, floor);
  useEffect(() => {
    useMindmapViewStore.getState().setReveal(
      showChip
        ? {
            chapter,
            revealed: state.revealed,
            total: state.total,
            newCount: state.newIds.length,
          }
        : null,
    );
  }, [showChip, chapter, state]);

  return { ready, chapterStarts, clusters: state.clusters, redacted: state.redacted };
};
