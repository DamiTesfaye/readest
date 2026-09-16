import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { DocumentLoader } from '@/libs/document';
import type { BookDoc } from '@/libs/document';
import type { Renderer } from '@/types/view';

const EPUB_URL = new URL('../fixtures/data/sample-alice.epub', import.meta.url).href;

let book: BookDoc;

const loadEPUB = async () => {
  const resp = await fetch(EPUB_URL);
  const buffer = await resp.arrayBuffer();
  const file = new File([buffer], 'sample-alice.epub', { type: 'application/epub+zip' });
  const loader = new DocumentLoader(file);
  const { book } = await loader.open();
  return book;
};

/**
 * Wait for the paginator to emit 'stabilized'.
 * MUST be called BEFORE the action that triggers stabilization.
 */
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

/** Wait for fill to complete by polling until getContents count stabilizes. */
const waitForFillComplete = async (el: Renderer, timeout = 10000) => {
  const start = Date.now();
  let lastCount = -1;
  let stableFor = 0;
  while (Date.now() - start < timeout) {
    const count = el.getContents().length;
    if (count === lastCount) {
      stableFor += 100;
      if (stableFor >= 500) return;
    } else {
      stableFor = 0;
      lastCount = count;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
};

/**
 * Widen the window between a view being appended and its document loading,
 * so a layout change can be landed reliably while the view is in flight.
 */
const withDeferredIframeLoad = async <T>(ms: number, fn: () => Promise<T>): Promise<T> => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc')!;
  Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      return descriptor.get!.call(this);
    },
    set(this: HTMLIFrameElement, value: string) {
      const iframe = this;
      setTimeout(() => descriptor.set!.call(iframe, value), ms);
    },
  });
  try {
    return await fn();
  } finally {
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', descriptor);
  }
};

describe('Paginator adjacent section layout (browser)', () => {
  let paginator: Renderer;

  beforeAll(async () => {
    book = await loadEPUB();
    await import('foliate-js/paginator.js');
  }, 30000);

  const createPaginator = () => {
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

  it('columnizes a section that loads across a layout change at the new column size', async () => {
    paginator = createPaginator();
    paginator.open(book);
    const index = book.sections!.findIndex((s) => s.linear !== 'no');

    let resized = false;
    await withDeferredIframeLoad(300, async () => {
      const container = paginator.shadowRoot!.getElementById('container')!;
      let added = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          added += record.addedNodes.length;
          if (added >= 2 && !resized) {
            resized = true;
            paginator.setAttribute('max-inline-size', '300px');
          }
        }
      });
      observer.observe(container, { childList: true });
      try {
        const stabilized = waitForStabilized(paginator);
        await paginator.goTo({ index });
        await stabilized;
        await waitForFillComplete(paginator);
      } finally {
        observer.disconnect();
      }
    });

    expect(resized).toBe(true);

    const contents = paginator.getContents();
    expect(contents.length).toBeGreaterThan(1);

    const columnSize = paginator.size / (paginator.columnCount ?? 1);
    for (const { doc } of contents) {
      const width = doc.documentElement.getBoundingClientRect().width;
      expect(Math.abs(width - columnSize)).toBeLessThan(1);
    }
  }, 30000);
});
