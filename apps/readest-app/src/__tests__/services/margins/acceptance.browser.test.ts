import * as CFI from 'foliate-js/epubcfi.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cdp } from 'vitest/browser';
import { MARGINS_MOTION_CSS } from '@/app/reader/components/margins/ElementView';
import { DocumentLoader, type BookDoc } from '@/libs/document';
import {
  createAnchor,
  liveRange,
  resolveAnchor,
  type BridgeContext,
} from '@/services/margins/anchorBridge';
import { getMarginsCore } from '@/services/margins/marginsClient';
import {
  createPainter,
  POSTS_KEY_PREFIX,
  placementOf,
  type PainterOverlayer,
} from '@/services/margins/painter';
import type { LayerRow, MarginsStore } from '@/services/margins/store';
import { buildTextMap } from '@/services/margins/textMap';
import type { SectionInput } from '@/services/margins/types';
import type { Book } from '@/types/book';
import type { Renderer } from '@/types/view';

const ALICE_URL = new URL('../../fixtures/data/sample-alice.epub', import.meta.url).href;
const TOTAL = 500;
const EVERY_NTH_WORD = 40;
const SECTION_MARGINS = 50;

const memoryStore = () => {
  const maps = new Map<string, SectionInput[]>();
  return {
    getTextMap: async (h: string) => maps.get(h) ?? null,
    putTextMap: async (h: string, s: SectionInput[]) => void maps.set(h, s),
  } as unknown as MarginsStore;
};

const ON_CI = Boolean(process.env['CI']);
const DRAW_50_BUDGET_MS = ON_CI ? 24 : 8;
const BADGE_BUDGET_MS = ON_CI ? 6 : 2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

const wordRanges = (doc: Document) => {
  const ranges: Range[] = [];
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let count = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    for (const m of n.nodeValue!.matchAll(/[\p{L}\p{N}]+/gu)) {
      if (++count % EVERY_NTH_WORD !== 0) continue;
      const r = doc.createRange();
      r.setStart(n, m.index!);
      r.setEnd(n, m.index! + m[0].length);
      ranges.push(r);
    }
  }
  return ranges;
};

const a11yText = (root: Node): string => {
  const out: string[] = [];
  const visit = (node: Node) => {
    if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return;
    if (node.nodeType === Node.TEXT_NODE) out.push(node.nodeValue ?? '');
    if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot);
    if (node instanceof HTMLIFrameElement && node.contentDocument) visit(node.contentDocument);
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(root);
  return out.join('');
};

describe('margins acceptance gates (M-R2)', () => {
  let bookDoc: BookDoc;
  let paginator: Renderer | null = null;
  const book = { hash: 'alice-accept', primaryLanguage: 'en' } as unknown as Book;
  const core = getMarginsCore();
  const rows: LayerRow[] = [];
  const bySection = new Map<number, LayerRow[]>();
  let busiest = 0;

  const closePaginator = () => {
    paginator?.destroy();
    paginator?.remove();
    paginator = null;
  };

  const ctxFor = (liveDoc: (i: number) => Document | null): BridgeContext => ({
    book,
    bookDoc,
    core,
    ready: Promise.resolve(),
    capped: false,
    getCFI: (i, r) => CFI.joinIndir(bookDoc.sections[i]!.cfi, CFI.fromRange(r)),
    liveDoc,
    inFamily: () => false,
  });

  const openAt = async (index: number, overlay = true) => {
    closePaginator();
    const el = document.createElement('foliate-paginator') as Renderer;
    Object.assign(el.style, { width: '1200px', height: '800px', position: 'absolute' });
    el.setAttribute('max-column-count', '1');
    if (overlay) {
      el.addEventListener('create-overlayer', (e) => {
        const { doc, attach } = (e as CustomEvent).detail;
        attach(new Overlayer(doc));
      });
    }
    document.body.appendChild(el);
    paginator = el;
    el.open(bookDoc);
    await el.goTo({ index });
    const contents = el.getContents().find((c) => c.index === index);
    if (!contents?.doc) throw new Error('section not rendered');
    const ctx = ctxFor((i) => el.getContents().find((c) => c.index === i)?.doc ?? null);
    const painter = createPainter({
      resolve: async (r) => placementOf(await resolveAnchor(ctx, r.anchor)),
      liveRange: (s, a, b) => liveRange(ctx, s, a, b),
    });
    return { el, ctx, doc: contents.doc, overlayer: contents.overlayer as Overlayer, painter };
  };

  beforeAll(async () => {
    const buffer = await (await fetch(ALICE_URL)).arrayBuffer();
    const file = new File([buffer], 'sample-alice.epub', { type: 'application/epub+zip' });
    bookDoc = (await new DocumentLoader(file).open()).book as BookDoc;
    await import('foliate-js/paginator.js');
    await core.loadBook(book.hash, await buildTextMap(bookDoc, book, memoryStore()));
    const build = ctxFor(() => null);
    for (const [index, section] of bookDoc.sections.entries()) {
      if (rows.length >= TOTAL) break;
      const doc = await section.createDocument();
      for (const range of wordRanges(doc)) {
        if (rows.length >= TOTAL) break;
        const row: LayerRow = {
          id: `m${rows.length}`,
          fileHash: book.hash,
          textId: null,
          anchor: await createAnchor(build, range, index),
          kind: 'clip',
          payload: {},
          rev: 1,
          deleted: false,
          updatedAt: 1,
        };
        rows.push(row);
        bySection.set(index, [...(bySection.get(index) ?? []), row]);
      }
    }
    busiest = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length)[0]![0];
  }, 180000);

  afterEach(closePaginator);

  it('resolves 500 Margins in at most 3 s with no task over 50 ms', async ({ annotate }) => {
    expect(rows).toHaveLength(TOTAL);
    const { painter } = await openAt(busiest);
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: false });
    const slices: number[] = [];
    const start = performance.now();
    let last = start;
    await painter.resolveAll(rows, () => {
      const now = performance.now();
      slices.push(now - last);
      last = now;
    });
    const total = performance.now() - start;
    await new Promise((r) => setTimeout(r, 50));
    observer.disconnect();
    await annotate(
      `[margins-perf] resolveAll 500: ${total.toFixed(0)} ms; batches ${slices.length}, ` +
        `max batch ${Math.max(...slices).toFixed(1)} ms, median batch ${median(slices).toFixed(1)} ms; ` +
        `long tasks ${JSON.stringify(longTasks.map((d) => Math.round(d)))}`,
    );
    const placed = [...painter.placements().values()].filter((p) => p.kind === 'placed');
    expect(placed.length).toBe(TOTAL);
    expect(total).toBeLessThanOrEqual(3000);
    expect(longTasks.filter((d) => d > 50)).toEqual([]);
  }, 60000);

  it(`draws a section with 50 Margins in at most ${DRAW_50_BUDGET_MS} ms (median of 10)`, async ({
    annotate,
  }) => {
    const fifty = bySection.get(busiest)!.slice(0, SECTION_MARGINS);
    expect(fifty).toHaveLength(SECTION_MARGINS);
    const { painter, overlayer } = await openAt(busiest);
    await painter.resolveAll(fifty);
    const times: number[] = [];
    let keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      keys = await painter.drawSection(busiest, overlayer as unknown as PainterOverlayer, 'full');
      times.push(performance.now() - t);
    }
    await annotate(
      `[margins-perf] drawSection 50: median ${median(times).toFixed(2)} ms; ` +
        `all ${JSON.stringify(times.map((t) => +t.toFixed(2)))}; keys ${keys.length}`,
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(median(times)).toBeLessThanOrEqual(DRAW_50_BUDGET_MS);
  }, 60000);

  it(`badges add at most ${BADGE_BUDGET_MS} ms to drawing a 50-cluster section (median of 10)`, async ({
    annotate,
  }) => {
    const fifty = bySection.get(busiest)!.slice(0, SECTION_MARGINS);
    const { painter, overlayer } = await openAt(busiest);
    await painter.resolveAll(fifty);
    const layer = overlayer as unknown as PainterOverlayer;
    const timeDraws = async () => {
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const t = performance.now();
        await painter.drawSection(busiest, layer, 'full');
        times.push(performance.now() - t);
      }
      return median(times);
    };
    const without = await timeDraws();
    const clusters = fifty.flatMap((r) => {
      const p = painter.placements().get(r.id);
      return p?.kind === 'placed'
        ? [
            {
              start: p.start,
              end: p.end,
              count: 3,
              key: `${POSTS_KEY_PREFIX}${busiest}:${p.start}:${p.end}`,
            },
          ]
        : [];
    });
    expect(clusters).toHaveLength(SECTION_MARGINS);
    painter.setPostClusters(busiest, clusters);
    const withBadges = await timeDraws();
    await annotate(
      `[margins-perf] badges: drawSection median without ${without.toFixed(2)} ms, ` +
        `with 50 clusters ${withBadges.toFixed(2)} ms`,
    );
    expect(withBadges - without).toBeLessThanOrEqual(BADGE_BUDGET_MS);
  }, 60000);

  it('adds at most 2 ms to a page turn (median of 20)', async ({ annotate }) => {
    const fifty = bySection.get(busiest)!.slice(0, SECTION_MARGINS);
    const turns = async (el: Renderer) => {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t = performance.now();
        await (i % 2 === 0 ? el.next() : el.prev());
        times.push(performance.now() - t);
      }
      return median(times);
    };
    const bare = await openAt(busiest, false);
    const without = await turns(bare.el);
    const withPainter = await openAt(busiest);
    await withPainter.painter.resolveAll(fifty);
    await withPainter.painter.drawSection(
      busiest,
      withPainter.overlayer as unknown as PainterOverlayer,
      'full',
    );
    const withMargins = await turns(withPainter.el);
    await annotate(
      `[margins-perf] page turn median: without ${without.toFixed(2)} ms, with ${withMargins.toFixed(2)} ms`,
    );
    expect(withMargins - without).toBeLessThanOrEqual(2);
  }, 60000);

  it('keeps the page text and the accessibility text unchanged with 20 Margins drawn', async () => {
    const twenty = bySection.get(busiest)!.slice(0, 20);
    const { el, doc, overlayer, painter } = await openAt(busiest);
    const text = doc.body.textContent;
    const a11y = a11yText(el);
    await painter.resolveAll(twenty);
    const keys = await painter.drawSection(
      busiest,
      overlayer as unknown as PainterOverlayer,
      'full',
    );
    expect(keys.length).toBeGreaterThan(0);
    const svg = overlayer.element as SVGSVGElement;
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(0);
    expect(doc.body.textContent).toBe(text);
    expect(a11yText(el)).toBe(a11y);
  }, 60000);

  it('runs no Margin motion under prefers-reduced-motion', async () => {
    const session = cdp() as unknown as {
      send(method: string, params: unknown): Promise<unknown>;
    };
    const style = document.createElement('style');
    style.textContent = MARGINS_MOTION_CSS;
    document.head.append(style);
    const els = ['rise', 'drift', 'breathe'].map((m) => {
      const el = document.createElement('div');
      el.className = `margins-motion-${m}`;
      document.body.append(el);
      return el;
    });
    const running = () => els.reduce((n, el) => n + el.getAnimations().length, 0);
    try {
      await session.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
      });
      expect(running()).toBe(3);
      await session.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      expect(running()).toBe(0);
    } finally {
      await session.send('Emulation.setEmulatedMedia', { features: [] });
      for (const el of els) el.remove();
      style.remove();
    }
  });
});
