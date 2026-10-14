import { useCallback, useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import type { BookDoc } from '@/libs/document';
import { getSession } from '@/services/ampleread/auth/session';
import type { Me } from '@/services/ampleread/auth/types';
import { type BridgeContext, liveRange, resolveAnchor } from '@/services/margins/anchorBridge';
import { marginsContext } from '@/services/margins/context';
import { hiddenMargins, onMarginsChanged } from '@/services/margins/margins';
import { getMarginsCore } from '@/services/margins/marginsClient';
import {
  createPainter,
  creatorColor,
  MARGIN_COLOR,
  MARGIN_KEY_PREFIX,
  marginIdsOfKey,
  type MarginsPainter,
  type PainterOverlayer,
  POSTS_KEY_PREFIX,
  placementOf,
} from '@/services/margins/painter';
import type { PostView } from '@/services/margins/public/api';
import {
  loadClusters,
  MARGINS_OPEN_PASSAGE_EVENT,
  openPassage,
} from '@/services/margins/public/badges';
import { byteAt, sectionBytes } from '@/services/margins/public/offsets';
import { MARGINS_POST_PENDING_EVENT, takePostOpen } from '@/services/margins/public/openPost';
import { useMarginsPublic } from '@/services/margins/public/flag';
import { openMarginsStore } from '@/services/margins/store';
import { cachedLink } from '@/services/margins/sync';
import { readerTextIds } from '@/services/margins/texts';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import type { FoliateView } from '@/types/view';
import { eventDispatcher } from '@/utils/event';
import { attachCreatorHover } from '@/services/margins/creatorHover';
import { MARGINS_PEEK_EVENT } from '../components/margins/MarginPeek';
import { toParentViewportPoint } from '../utils/annotatorUtil';

const CREATOR_OFFSET_PX = 12;

type PointOverlayer = { hitTest(point: { x: number; y: number }): unknown[] };

const painters = new Map<string, MarginsPainter>();
const readers = new Map<string, { ctx: BridgeContext; view: FoliateView; draw(): void }>();
const viewing = new Map<string, Range | null>();

const disjoint = (a: Range, b: Range) => {
  try {
    return (
      a.compareBoundaryPoints(Range.START_TO_END, b) <= 0 ||
      a.compareBoundaryPoints(Range.END_TO_START, b) >= 0
    );
  } catch {
    return true;
  }
};

export const postPlacement = async (
  post: PostView,
  ctx: BridgeContext,
): Promise<{ section: number; start: number; end: number } | null> => {
  if (post.anchor.quote !== null) {
    const p = placementOf(await resolveAnchor(ctx, post.anchor));
    return p.kind === 'placed' ? { section: p.section, start: p.start, end: p.end } : null;
  }
  await ctx.ready;
  const lengths = await ctx.core.sectionLengths(ctx.book.hash, ctx.bookDoc.sections.length);
  if (lengths[post.section] !== post.sectionLen) return null;
  const bytes = await sectionBytes(ctx.core, ctx.book.hash, post.section);
  return { section: post.section, start: byteAt(bytes, post.start), end: byteAt(bytes, post.end) };
};

export const viewPostInPlace = async (
  bookKey: string,
  post: PostView | null,
): Promise<'placed' | 'missing'> => {
  const painter = painters.get(bookKey);
  const reader = readers.get(bookKey);
  if (!painter || !reader) return 'missing';
  if (!post) {
    viewing.delete(bookKey);
    painter.setViewInPlace(null);
    reader.draw();
    return 'placed';
  }
  const p = await postPlacement(post, reader.ctx);
  if (!p) return 'missing';
  viewing.delete(bookKey);
  painter.setViewInPlace({ postId: post.id, section: p.section, start: p.start, end: p.end });
  await reader.view.goTo(p.section);
  const range = await liveRange(reader.ctx, p.section, p.start, p.end);
  if (range) await reader.view.goTo(reader.view.getCFI(p.section, range));
  viewing.set(bookKey, range);
  reader.draw();
  return 'placed';
};

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
  const publicOn = useMarginsPublic();
  const publicRef = useRef(publicOn);
  publicRef.current = publicOn;

  const draw = useCallback(
    (only?: number) => {
      const painter = painters.get(bookKey);
      if (!painter || !view) return;
      const textId = book ? cachedLink(book.hash)?.textId : undefined;
      for (const c of view.renderer.getContents()) {
        if (c.index === undefined || !c.overlayer) continue;
        if (only !== undefined && c.index !== only) continue;
        const index = c.index;
        const overlayer = c.overlayer as PainterOverlayer;
        painter
          .drawSection(index, overlayer, displayRef.current)
          .catch(() => console.error('Margins: draw failed'));
        if (!publicRef.current || !textId || !book) continue;
        loadClusters({ textId, fileHash: book.hash }, getMarginsCore(), index)
          .then(async (clusters) => {
            if (painter.postClusters().get(index) === clusters) return;
            painter.setPostClusters(index, clusters);
            await painter.drawSection(index, overlayer, displayRef.current);
            eventDispatcher.dispatch(MARGINS_PLACED_EVENT, { bookKey });
          })
          .catch(() => console.error('Margins: badges failed'));
      }
    },
    [bookKey, view, book],
  );

  useEffect(() => {
    if (!appService || !book || !view || book.format === 'PDF') return;
    let cancelled = false;
    let unsubscribe = () => {};
    let onPending = (_e: CustomEvent) => {};
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
      const openPendingPost = async () => {
        const post = takePostOpen(book.hash);
        if (!post || cancelled) return;
        await viewPostInPlace(bookKey, post);
        const { textId, section, sectionLen, start, end } = post;
        eventDispatcher.dispatch(MARGINS_OPEN_PASSAGE_EVENT, {
          bookKey,
          textId,
          section,
          sectionLen,
          start,
          end,
        });
      };
      onPending = (e: CustomEvent<{ fileHash?: string }>) => {
        if (e.detail?.fileHash === book.hash)
          openPendingPost().catch(() => console.error('Margins: post open failed'));
      };
      eventDispatcher.on(MARGINS_POST_PENDING_EVENT, onPending);
      await ctx.ready;
      if (cancelled) return;
      painters.set(bookKey, painter);
      readers.set(bookKey, { ctx, view, draw });
      unsubscribe = onMarginsChanged(() => {
        load().catch(() => console.error('Margins: painter reload failed'));
      });
      await load();
      await openPendingPost();
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
      eventDispatcher.off(MARGINS_POST_PENDING_EVENT, onPending);
      painters.delete(bookKey);
      readers.delete(bookKey);
      viewing.delete(bookKey);
    };
  }, [appService, book, view, bookDoc, bookKey, draw]);

  useEffect(() => draw(), [display, draw, publicOn]);

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
      const textId = book ? cachedLink(book.hash)?.textId : undefined;
      if (value?.startsWith(POSTS_KEY_PREFIX) && book && textId) {
        openPassage({ bookKey, fileHash: book.hash, textId }, value).catch(() =>
          console.error('Margins: passage open failed'),
        );
        return;
      }
      if (!value?.startsWith(MARGIN_KEY_PREFIX) || value === CLIP_PREVIEW_KEY) return;
      eventDispatcher.dispatch(MARGINS_OPEN_CARD_EVENT, {
        bookKey,
        ids: marginIdsOfKey(value),
        index,
        rect,
      });
    };
    const onRelocate = (e: Event) => {
      if (!viewing.has(bookKey)) return;
      const visible = (e as CustomEvent<{ range?: Range }>).detail?.range;
      const passage = viewing.get(bookKey);
      if (visible && passage && !disjoint(passage, visible)) return;
      viewing.delete(bookKey);
      painters.get(bookKey)?.setViewInPlace(null);
      draw();
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
    view.addEventListener('relocate', onRelocate);
    return () => {
      view.removeEventListener('create-overlay', onCreateOverlay);
      view.removeEventListener('show-annotation', onShowAnnotation);
      view.removeEventListener('load', onLoad);
      view.removeEventListener('relocate', onRelocate);
      for (const detach of detachers.values()) detach();
    };
  }, [view, bookKey, draw, book]);
};
