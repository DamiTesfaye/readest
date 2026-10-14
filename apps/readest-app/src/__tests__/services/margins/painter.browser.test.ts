import * as CFI from 'foliate-js/epubcfi.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DocumentLoader, type BookDoc } from '@/libs/document';
import {
  createAnchor,
  liveRange,
  resolveAnchor,
  type BridgeContext,
} from '@/services/margins/anchorBridge';
import { getMarginsCore } from '@/services/margins/marginsClient';
import { createPainter, placementOf, type PainterOverlayer } from '@/services/margins/painter';
import type { LayerRow, MarginsStore } from '@/services/margins/store';
import { buildTextMap } from '@/services/margins/textMap';
import type { Anchor, SectionInput } from '@/services/margins/types';
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

const paragraphRanges = (doc: Document, count: number) =>
  Array.from(doc.querySelectorAll('p'))
    .map((p) => p.firstChild)
    .filter((n): n is Text => n?.nodeType === Node.TEXT_NODE && n.nodeValue!.trim().length > 30)
    .slice(0, count)
    .map((n) => {
      const start = n.nodeValue!.search(/\S/);
      const range = doc.createRange();
      range.setStart(n, start);
      range.setEnd(n, start + 20);
      return range;
    });

const row = (id: string, anchor: Anchor): LayerRow => ({
  id,
  fileHash: 'alice-painter',
  textId: null,
  anchor,
  kind: 'clip',
  payload: {},
  rev: 1,
  deleted: false,
  updatedAt: 1,
});

describe('margins painter in the paginator', () => {
  let bookDoc: BookDoc;
  let paginator: Renderer | null = null;
  const book = { hash: 'alice-painter', primaryLanguage: 'en' } as unknown as Book;
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
    el.addEventListener('create-overlayer', (e) => {
      const { doc, attach } = (e as CustomEvent).detail;
      attach(new Overlayer(doc));
    });
    document.body.appendChild(el);
    paginator = el;
    el.open(bookDoc);
    el.setStyles?.(`html { font-size: ${fontSize}px !important; }`);
    await el.goTo({ index });
    const contents = el.getContents().find((c) => c.index === index);
    if (!contents?.doc || !contents.overlayer) throw new Error('section not rendered');
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
    const painter = createPainter({
      resolve: async (r) => placementOf(await resolveAnchor(ctx, r.anchor)),
      liveRange: (s, a, b) => liveRange(ctx, s, a, b),
    });
    return { ctx, doc: contents.doc, overlayer: contents.overlayer as Overlayer, painter };
  };

  it('draws 20 Margins without touching the book text and keeps markers on their text', async () => {
    const index = await sectionIndex();
    const first = await openAt(index, 16, 1);
    const ranges = [textRange(first.doc, QUOTE), ...paragraphRanges(first.doc, 19)];
    expect(ranges).toHaveLength(20);
    const rows: LayerRow[] = [];
    for (const [i, r] of ranges.entries()) {
      rows.push(row(`m${i}`, await createAnchor(first.ctx, r, index)));
    }

    const before = first.doc.body.textContent;
    await first.painter.resolveAll(rows);
    const keys = await first.painter.drawSection(
      index,
      first.overlayer as unknown as PainterOverlayer,
      'full',
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(first.doc.body.textContent).toBe(before);
    const svg = first.overlayer.element;
    expect(svg.style.pointerEvents).toBe('none');
    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      expect(n.parentElement?.localName).toBe('text');
      expect(n.nodeValue).toMatch(/^\d+$/);
    }

    for (const [fontSize, columns] of [
      [16, 1],
      [24, 1],
      [16, 2],
    ] as const) {
      const { doc, overlayer, painter } = await openAt(index, fontSize, columns);
      await painter.resolveAll([rows[0]!]);
      expect(painter.placements().get('m0')?.kind).toBe('placed');
      await painter.drawSection(index, overlayer as unknown as PainterOverlayer, 'full');
      const rects = textRange(doc, QUOTE).getClientRects();
      const start = rects[0]!;
      const markers = Array.from(
        (overlayer.element as SVGSVGElement).querySelectorAll('circle'),
      ).map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
      expect(
        markers.some(([cx, cy]) => Math.abs(cx! - start.left) < 2 && Math.abs(cy! - start.top) < 2),
      ).toBe(true);
    }
  }, 90000);
});
