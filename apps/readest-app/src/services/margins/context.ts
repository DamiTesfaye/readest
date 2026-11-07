import type { BookDoc } from '@/libs/document';
import type { Book } from '@/types/book';
import type { FoliateView } from '@/types/view';
import type { BridgeContext } from './anchorBridge';
import { inMarginsFamily, marginsBookReady } from './bookOpen';
import { getMarginsCore } from './marginsClient';
import type { MarginsStore } from './store';
import { cachedLink } from './sync';
import { isCapped } from './texts';

const contexts = new Map<string, { view: FoliateView; ctx: BridgeContext }>();
const cappedOf = new WeakMap<BridgeContext, { value: boolean }>();

export const refreshCapped = async (ctx: BridgeContext, store: MarginsStore): Promise<boolean> => {
  const value = await isCapped(store, cachedLink(ctx.book.hash)?.textId ?? null);
  const state = cappedOf.get(ctx);
  if (state) state.value = value;
  return value;
};

export const marginsContext = (o: {
  view: FoliateView;
  book: Book;
  bookDoc: BookDoc;
  store: MarginsStore;
}): BridgeContext => {
  const { view, book, bookDoc, store } = o;
  const hit = contexts.get(book.hash);
  if (hit?.view === view) return hit.ctx;
  const state = { value: true };
  const ctx: BridgeContext = {
    book,
    bookDoc,
    core: getMarginsCore(),
    ready: marginsBookReady(book.hash),
    get capped() {
      return state.value;
    },
    getCFI: (index, range) => view.getCFI(index, range),
    liveDoc: (index) => view.renderer.getContents().find((c) => c.index === index)?.doc ?? null,
    inFamily: inMarginsFamily(book.hash),
  };
  cappedOf.set(ctx, state);
  contexts.set(book.hash, { view, ctx });
  refreshCapped(ctx, store).catch(() => console.error('Margins: cap refresh failed'));
  return ctx;
};
