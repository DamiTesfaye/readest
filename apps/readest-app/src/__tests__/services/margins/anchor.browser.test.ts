import * as CFI from 'foliate-js/epubcfi.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DocumentLoader, type BookDoc } from '@/libs/document';
import {
  createAnchor,
  createAnchorAt,
  rangeToCanonical,
  resolveAnchor,
  type BridgeContext,
} from '@/services/margins/anchorBridge';
import { getMarginsCore } from '@/services/margins/marginsClient';
import type { MarginsStore } from '@/services/margins/store';
import { buildTextMap } from '@/services/margins/textMap';
import type { SectionInput } from '@/services/margins/types';
import type { Book } from '@/types/book';
import type { Renderer } from '@/types/view';

const ALICE_URL = new URL('../../fixtures/data/sample-alice.epub', import.meta.url).href;
const QUOTE = 'Alice was beginning to get very tired of sitting by her sister';

const memoryStore = () => {
  const maps = new Map<string, SectionInput[]>();
  return {
    getTextMap: async (h: string) => maps.get(h) ?? null,
    putTextMap: async (h: string, s: SectionInput[]) => void maps.set(h, s),
  } as unknown as MarginsStore;
};

const textRange = (doc: Document, text: string) => {
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.nodeValue!.indexOf(text);
    if (at < 0) continue;
    const range = doc.createRange();
    range.setStart(n, at);
    range.setEnd(n, at + text.length);
    return range;
  }
  throw new Error(`not found: ${text}`);
};

describe('margins anchor across re-open', () => {
  let bookDoc: BookDoc;
  let paginator: Renderer | null = null;
  const book = { hash: 'alice-browser', primaryLanguage: 'en' } as unknown as Book;
  const core = getMarginsCore();

  const closePaginator = () => {
    paginator?.destroy();
    paginator?.remove();
    paginator = null;
  };

  beforeAll(async () => {
    const buffer = await (await fetch(ALICE_URL)).arrayBuffer();
    const file = new File([buffer], 'sample-alice.epub', { type: 'application/epub+zip' });
    bookDoc = (await new DocumentLoader(file).open()).book as BookDoc;
    await import('foliate-js/paginator.js');
    await core.loadBook(book.hash, await buildTextMap(bookDoc, book, memoryStore()));
  }, 30000);

  afterEach(closePaginator);

  const sectionIndex = async () => {
    for (const [i, s] of bookDoc.sections.entries()) {
      if ((await s.createDocument()).documentElement.textContent?.includes(QUOTE)) return i;
    }
    throw new Error('quote not in book');
  };

  const openAt = async (index: number, fontSize: number, columns: number) => {
    closePaginator();
    const el = document.createElement('foliate-paginator') as Renderer;
    Object.assign(el.style, { width: '1200px', height: '800px', position: 'absolute' });
    el.setAttribute('max-column-count', String(columns));
    el.setAttribute('max-inline-size', columns > 1 ? '560px' : '1200px');
    document.body.appendChild(el);
    paginator = el;
    el.open(bookDoc);
    el.setStyles?.(`html { font-size: ${fontSize}px !important; }`);
    await el.goTo({ index });
    const contents = el.getContents().find((c) => c.index === index);
    if (!contents?.doc) throw new Error('section not rendered');
    const ctx: BridgeContext = {
      book,
      bookDoc,
      core,
      ready: Promise.resolve(),
      capped: true,
      getCFI: (i, r) => CFI.joinIndir(bookDoc.sections[i]!.cfi, CFI.fromRange(r)),
      liveDoc: (i) => (i === index ? contents.doc : null),
      inFamily: () => false,
    };
    return { ctx, doc: contents.doc };
  };

  it('resolves to the same text at font size 16, 24 and in two columns', async () => {
    const index = await sectionIndex();
    const first = await openAt(index, 16, 1);
    const anchor = await createAnchor(first.ctx, textRange(first.doc, QUOTE), index);
    expect(anchor.quote).toEqual({ exact: QUOTE });

    const results: [string | undefined, number | null][] = [];
    const widths: number[] = [];
    for (const [fontSize, columns] of [
      [16, 1],
      [24, 1],
      [16, 2],
    ] as const) {
      const { ctx, doc } = await openAt(index, fontSize, columns);
      expect(getComputedStyle(doc.documentElement).fontSize).toBe(`${fontSize}px`);
      widths.push(parseFloat(getComputedStyle(doc.documentElement).columnWidth));
      const placed = await resolveAnchor(ctx, anchor);
      results.push([placed.range?.toString(), placed.step]);
    }
    expect(results).toEqual([
      [QUOTE, 1],
      [QUOTE, 1],
      [QUOTE, 1],
    ]);
    expect(widths[2]).toBeLessThan(widths[0]! / 1.5);
  }, 60000);

  it('anchors canonical offsets that resolve at step 1', async () => {
    const index = await sectionIndex();
    const { ctx, doc } = await openAt(index, 16, 1);
    const [start, end] = await rangeToCanonical(ctx, index, textRange(doc, QUOTE));
    const anchor = await createAnchorAt(ctx, index, start, end);
    expect(anchor.quote).toEqual({ exact: QUOTE });
    const placed = await resolveAnchor(ctx, anchor);
    expect([placed.range?.toString(), placed.step]).toEqual([QUOTE, 1]);
  }, 60000);
});
