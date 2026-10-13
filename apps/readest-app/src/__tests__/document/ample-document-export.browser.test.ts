import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { DocumentLoader } from '@/libs/document';
import type { BookDoc, TOCItem } from '@/libs/document';
import type { Renderer } from '@/types/view';
import meta from '../fixtures/data/ample-alice-export.meta.json';

const EPUB_URL = new URL('../fixtures/data/ample-alice-export.epub', import.meta.url).href;

let book: BookDoc;

const loadEPUB = async () => {
  const resp = await fetch(EPUB_URL);
  const buffer = await resp.arrayBuffer();
  const file = new File([buffer], 'ample-alice-export.epub', { type: 'application/epub+zip' });
  const { book } = await new DocumentLoader(file).open();
  return book;
};

const waitForStabilized = (el: HTMLElement, timeout = 10000) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('stabilized timeout')), timeout);
    el.addEventListener(
      'stabilized',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

describe('AmpleDocument EPUB export in foliate-js (browser)', () => {
  let paginator: Renderer;
  let currentIndex = -1;

  beforeAll(async () => {
    book = await loadEPUB();
    await import('foliate-js/paginator.js');
  }, 30000);

  afterEach(async () => {
    if (paginator) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        paginator.destroy();
      } catch {
        /* iframe body may already be torn down */
      }
      paginator.remove();
    }
  });

  const createPaginator = () => {
    currentIndex = -1;
    const el = document.createElement('foliate-paginator') as Renderer;
    Object.assign(el.style, {
      width: '800px',
      height: '600px',
      position: 'absolute',
      left: '0',
      top: '0',
    });
    document.body.appendChild(el);
    return el;
  };

  const flatToc = (items = book.toc ?? []): TOCItem[] =>
    items.flatMap((item) => [item, ...flatToc(item.subitems ?? [])]);

  const tocItemFor = (title: string) => flatToc().find((item) => item.label?.trim() === title);

  const resolveToc = (href: string) => {
    const [path, anchor] = book.splitTOCHref(href) as [string, string];
    return { index: book.sections.findIndex((section) => section.id === path), anchor };
  };

  type GoToTarget = Parameters<Renderer['goTo']>[0];
  const goTo = async (target: { index: number; anchor?: string }) => {
    const sameSection = target.index === currentIndex;
    const settled = sameSection
      ? new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      : waitForStabilized(paginator);
    await paginator.goTo(target as unknown as GoToTarget);
    await settled;
    currentIndex = target.index;
    const contents = paginator.getContents();
    return (contents.find((content) => content.index === target.index) ?? contents[0]!).doc;
  };

  it('opens with the metadata and the full table of contents the pipeline produced', () => {
    expect(book.sections.length).toBeGreaterThan(1);
    expect(book.metadata.title).toBe(meta.title);
    expect(book.toc?.length).toBeGreaterThan(0);
    const labels = flatToc().map((item) => item.label?.trim());
    expect(labels.length).toBe(meta.toc.length);
    for (const entry of meta.toc) {
      expect(labels, `${entry.title} missing from the reader's TOC`).toContain(entry.title);
    }
  });

  it('paginates a chapter across more than one page', async () => {
    paginator = createPaginator();
    paginator.open(book);
    const chapter = meta.toc.find((entry) => entry.title.startsWith('CHAPTER I.'))!;
    const tocItem = tocItemFor(chapter.title)!;
    expect(tocItem).toBeTruthy();
    const doc = await goTo(resolveToc(tocItem.href));

    expect(doc.body.textContent?.trim().length).toBeGreaterThan(0);
    expect(paginator.viewSize).toBeGreaterThan(paginator.size);
  });

  it('navigates every TOC entry to the block id the AmpleDocument names', async () => {
    paginator = createPaginator();
    paginator.open(book);
    await goTo({ index: 0 });

    for (const entry of meta.toc) {
      const tocItem = tocItemFor(entry.title);
      expect(tocItem, `no TOC item labelled ${entry.title}`).toBeTruthy();
      const { index, anchor } = resolveToc(tocItem!.href);
      expect(anchor).toBe(entry.target_block_id);
      expect(index).toBeGreaterThanOrEqual(0);

      const doc = await goTo({ index, anchor });
      const target = doc.getElementById(entry.target_block_id);
      expect(target, `${entry.target_block_id} missing from section ${index}`).toBeTruthy();
      expect(target!.textContent?.trim()).toBe(entry.title);
      expect(target!.tagName.toLowerCase()).toBe(`h${Math.min(entry.level, 6)}`);
    }
  }, 90000);

  it('renders only AmpleDocument block ids, and no furniture', async () => {
    paginator = createPaginator();
    paginator.open(book);
    const contentIds = new Set(meta.content_block_ids);

    for (const index of [0, 1, 2]) {
      const doc = await goTo({ index });
      const ids = Array.from(doc.querySelectorAll('[id^="b_"]')).map((el) => el.id);
      const views = paginator
        .getContents()
        .map((c) => String(c.index))
        .join('/');
      const body = doc.body?.textContent?.trim().slice(0, 40);
      expect(
        ids.length,
        `section ${index} rendered no ids; views=${views} body=${body}`,
      ).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(contentIds.has(id), `${id} is not a content block of the AmpleDocument`).toBe(true);
        expect(meta.furniture_block_ids).not.toContain(id);
      }
    }
  }, 30000);
});
