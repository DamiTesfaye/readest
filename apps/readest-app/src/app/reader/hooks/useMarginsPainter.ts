import { useCallback, useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import type { BookDoc } from '@/libs/document';
import { getSession } from '@/services/ampleread/auth/session';
import type { Me } from '@/services/ampleread/auth/types';
import { liveRange, resolveAnchor } from '@/services/margins/anchorBridge';
import { marginsContext } from '@/services/margins/context';
import { hiddenMargins, onMarginsChanged } from '@/services/margins/margins';
import {
  createPainter,
  creatorColor,
  MARGIN_COLOR,
  MARGIN_KEY_PREFIX,
  marginIdsOfKey,
  type MarginsPainter,
  type PainterOverlayer,
  placementOf,
} from '@/services/margins/painter';
import { openMarginsStore } from '@/services/margins/store';
import { cachedLink } from '@/services/margins/sync';
import { readerTextIds } from '@/services/margins/texts';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { eventDispatcher } from '@/utils/event';
import { attachCreatorHover } from '@/services/margins/creatorHover';
import { MARGINS_PEEK_EVENT } from '../components/margins/MarginPeek';
import { toParentViewportPoint } from '../utils/annotatorUtil';

const CREATOR_OFFSET_PX = 12;

type PointOverlayer = { hitTest(point: { x: number; y: number }): unknown[] };

const painters = new Map<string, MarginsPainter>();

export const getMarginsPainter = (bookKey: string): MarginsPainter | null =>
  painters.get(bookKey) ?? null;

const pendingOpen = new Map<string, string>();

export const requestMarginOpen = (fileHash: string, layerId: string): void => {
  pendingOpen.set(fileHash, layerId);
};

export const MARGINS_PLACED_EVENT = 'margins-placed';
export const MARGINS_OPEN_CARD_EVENT = 'margins-open-card';
export const CLIP_PREVIEW_KEY = `${MARGIN_KEY_PREFIX}clip-preview`;

export const useMarginsPainter = (bookKey: string, bookDoc: BookDoc) => {
  const { appService } = useEnv();
  const book = useBookDataStore((s) => s.getBookData(bookKey)?.book);
  const view = useReaderStore((s) => s.getView(bookKey));
  const display = useReaderStore((s) => s.getViewSettings(bookKey)?.marginsDisplay) ?? 'full';
  const displayRef = useRef(display);
  displayRef.current = display;

  const draw = useCallback(
    (only?: number) => {
      const painter = painters.get(bookKey);
      if (!painter || !view) return;
      for (const c of view.renderer.getContents()) {
        if (c.index === undefined || !c.overlayer) continue;
        if (only !== undefined && c.index !== only) continue;
        painter
          .drawSection(c.index, c.overlayer as PainterOverlayer, displayRef.current)
          .catch(() => console.error('Margins: draw failed'));
      }
    },
    [bookKey, view],
  );

  useEffect(() => {
    if (!appService || !book || !view || book.format === 'PDF') return;
    let cancelled = false;
    let unsubscribe = () => {};
    (async () => {
      const store = await openMarginsStore(appService);
      const ctx = marginsContext({ view, book, bookDoc, store });
      let me: Me | null = null;
      const painter = createPainter({
        resolve: async (row) => placementOf(await resolveAnchor(ctx, row.anchor)),
        liveRange: (section, start, end) => liveRange(ctx, section, start, end),
        creator: (userId) => {
          const mine = !userId || userId === me?.id;
          return {
            name: mine ? me?.displayName || me?.email || '' : '',
            avatarUrl: mine ? (me?.avatarUrl ?? null) : null,
            color: userId || me ? creatorColor(userId ?? me!.id) : MARGIN_COLOR,
            initial: mine
              ? ([...(me?.displayName || me?.email || '')][0]?.toUpperCase() ?? '')
              : '',
          };
        },
      });
      const load = async () => {
        me = (await getSession())?.me ?? null;
        const userId = me?.id ?? null;
        const textIds = await readerTextIds(store, cachedLink(book.hash)?.textId ?? null);
        const hidden = hiddenMargins();
        const rows = await store.layersForReader(book.hash, textIds, userId);
        await painter.resolveAll(rows.filter((r) => !r.deleted && !hidden.has(r.id)));
        if (cancelled) return;
        draw();
        eventDispatcher.dispatch(MARGINS_PLACED_EVENT, { bookKey });
      };
      await ctx.ready;
      if (cancelled) return;
      painters.set(bookKey, painter);
      unsubscribe = onMarginsChanged(() => {
        load().catch(() => console.error('Margins: painter reload failed'));
      });
      await load();
      const target = pendingOpen.get(book.hash);
      if (!target || cancelled) return;
      pendingOpen.delete(book.hash);
      const placed = painter.placements().get(target);
      if (placed?.kind === 'placed') {
        await view.goTo(placed.section);
        const range = await liveRange(ctx, placed.section, placed.start, placed.end);
        if (range) await view.goTo(view.getCFI(placed.section, range));
      }
      eventDispatcher.dispatch(MARGINS_OPEN_CARD_EVENT, { bookKey, ids: [target] });
    })().catch(() => console.error('Margins: painter failed'));
    return () => {
      cancelled = true;
      unsubscribe();
      painters.delete(bookKey);
    };
  }, [appService, book, view, bookDoc, bookKey, draw]);

  useEffect(() => draw(), [display, draw]);

  useEffect(() => {
    if (!view) return;
    const onCreateOverlay = (e: Event) => {
      const { index } = (e as CustomEvent<{ index: number }>).detail;
      void Promise.resolve().then(() => draw(index));
    };
    const onShowAnnotation = (e: Event) => {
      const { value, index, rect } = (
        e as CustomEvent<{ value: string; index: number; rect?: DOMRect }>
      ).detail;
      if (!value?.startsWith(MARGIN_KEY_PREFIX) || value === CLIP_PREVIEW_KEY) return;
      eventDispatcher.dispatch(MARGINS_OPEN_CARD_EVENT, {
        bookKey,
        ids: marginIdsOfKey(value),
        index,
        rect,
      });
    };
    const detachers = new Map<Document, () => void>();
    const hover = (doc: Document, index: number) => {
      if (detachers.has(doc)) return;
      const detach = attachCreatorHover(doc, {
        hitTest: (point) => {
          const overlayer = view.renderer.getContents().find((c) => c.index === index)?.overlayer;
          const [key] = ((overlayer as PointOverlayer | undefined)?.hitTest(point) ?? []) as [
            string?,
          ];
          return key?.startsWith(MARGIN_KEY_PREFIX) && key !== CLIP_PREVIEW_KEY ? key : undefined;
        },
        peekOf: (key) => {
          const id = marginIdsOfKey(key)[0]!;
          const painter = getMarginsPainter(bookKey);
          const creator = painter?.creatorOf(id);
          const row = painter?.rowOf(id);
          return creator && row ? { creator, row } : undefined;
        },
        show: (peek, x, y) => {
          const at = toParentViewportPoint(doc, x, y);
          eventDispatcher.dispatch(MARGINS_PEEK_EVENT, {
            bookKey,
            peek,
            x: at.x + CREATOR_OFFSET_PX,
            y: at.y + CREATOR_OFFSET_PX,
          });
        },
      });
      detachers.set(doc, detach);
      doc.defaultView?.addEventListener('unload', () => {
        detach();
        detachers.delete(doc);
      });
    };
    const onLoad = (e: Event) => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
      hover(doc, index);
    };
    for (const { doc, index } of view.renderer.getContents())
      if (doc && index !== undefined) hover(doc, index);
    view.addEventListener('create-overlay', onCreateOverlay);
    view.addEventListener('show-annotation', onShowAnnotation);
    view.addEventListener('load', onLoad);
    return () => {
      view.removeEventListener('create-overlay', onCreateOverlay);
      view.removeEventListener('show-annotation', onShowAnnotation);
      view.removeEventListener('load', onLoad);
      for (const detach of detachers.values()) detach();
    };
  }, [view, bookKey, draw]);
};
