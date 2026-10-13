import * as CFI from 'foliate-js/epubcfi.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentLoader, type BookDoc } from '@/libs/document';
import type { BridgeContext } from '@/services/margins/anchorBridge';
import { WebDatabaseService } from '@/services/database/webDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { getMarginsCore } from '@/services/margins/marginsClient';
import { loadPlayEngine, type PlayGlue } from '@/services/margins/play/engine';
import { enterPlay } from '@/services/margins/play/surfaceSession';
import { MarginsStore } from '@/services/margins/store';
import { buildTextMap } from '@/services/margins/textMap';
import type { SectionInput } from '@/services/margins/types';
import type { Book } from '@/types/book';
import type { Renderer } from '@/types/view';

const QUOTE = 'Begin the morning by saying to thyself';

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

const structureHash = (doc: Document) => {
  const parts: string[] = [];
  const walk = doc.createTreeWalker(
    doc.documentElement,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  for (let n: Node | null = walk.currentNode; n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) parts.push(`#${n.nodeValue}`);
    else {
      const el = n as Element;
      parts.push(
        `<${el.tagName}${[...el.attributes]
          .filter((a) => a.name !== 'style')
          .map((a) => ` ${a.name}=${a.value}`)
          .join('')}>`,
      );
    }
  }
  return parts.join('|');
};

describe('play surface', () => {
  const books = new Map<string, BookDoc>();
  const core = getMarginsCore();
  let wrapper: HTMLElement | null = null;

  const close = () => {
    (wrapper?.firstElementChild as Renderer | null)?.destroy?.();
    wrapper?.remove();
    wrapper = null;
  };

  const load = async (file: string) => {
    const hit = books.get(file);
    if (hit) return hit;
    const url = new URL(`../../../fixtures/data/${file}`, import.meta.url).href;
    const buffer = await (await fetch(url)).arrayBuffer();
    const bookDoc = (await new DocumentLoader(new File([buffer], file)).open()).book as BookDoc;
    const book = {
      hash: `play-${file}`,
      primaryLanguage: 'en',
    } as unknown as Book;
    await core.loadBook(book.hash, await buildTextMap(bookDoc, book, memoryStore()));
    books.set(file, bookDoc);
    return bookDoc;
  };

  beforeAll(async () => {
    await import('foliate-js/paginator.js');
  });

  afterEach(close);

  const openMeditations = async ({
    file = 'meditations-gutenberg.epub',
    fontSize = 16,
    columns = 1,
    inFamily = false,
  } = {}) => {
    close();
    const bookDoc = await load(file);
    const book = {
      hash: `play-${file}`,
      primaryLanguage: 'en',
    } as unknown as Book;
    let index = -1;
    for (const [i, s] of bookDoc.sections.entries()) {
      if ((await s.createDocument()).documentElement.textContent?.includes(QUOTE)) {
        index = i;
        break;
      }
    }
    if (index < 0) throw new Error('quote not in book');
    wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      width: '1200px',
      height: '800px',
      position: 'absolute',
      left: '0',
      top: '0',
    });
    document.body.appendChild(wrapper);
    const el = document.createElement('foliate-paginator') as Renderer;
    Object.assign(el.style, {
      width: '1200px',
      height: '800px',
      position: 'absolute',
    });
    el.setAttribute('max-column-count', String(columns));
    el.setAttribute('max-inline-size', columns > 1 ? '560px' : '1200px');
    wrapper.appendChild(el);
    el.open(bookDoc);
    el.setStyles?.(`html { font-size: ${fontSize}px !important; }`);
    let range = null as Range | null;
    el.addEventListener('relocate', ((e: CustomEvent) => {
      if (e.detail?.index === index && e.detail.range && !e.detail.range.collapsed)
        range = e.detail.range;
    }) as EventListener);
    await el.goTo({ index, anchor: (doc: Document) => textRange(doc, QUOTE) });
    const contents = el.getContents().find((c) => c.index === index);
    if (!contents?.doc || !range) throw new Error('section not rendered');
    const ctx: BridgeContext = {
      book,
      bookDoc,
      core,
      ready: Promise.resolve(),
      capped: true,
      getCFI: (i, r) => CFI.joinIndir(bookDoc.sections[i]!.cfi, CFI.fromRange(r)),
      liveDoc: (i) => (i === index ? contents.doc : null),
      inFamily: () => inFamily,
    };
    return {
      host: wrapper,
      renderer: el,
      ctx,
      index,
      range,
      doc: contents.doc,
    };
  };

  it('a11y gate: the section is unchanged before, during and after play', async () => {
    const s = await openMeditations();
    const before = structureHash(s.doc);
    const play = await enterPlay({ ...s, reduced: true });
    play.tools.addShape('circle');
    play.tools.shake();
    await play.frame();
    expect(structureHash(s.doc)).toBe(before);
    expect(play.canvas.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(s.renderer).opacity).toBe('0');
    expect(getComputedStyle(s.renderer).visibility).toBe('visible');
    expect(document.querySelector('[aria-live]')?.textContent).toContain('the text is unchanged');
    expect(document.querySelector('button[aria-label^="Circle shape"]')).not.toBeNull();
    play.exit();
    expect(structureHash(s.doc)).toBe(before);
    expect(getComputedStyle(s.renderer).opacity).toBe('1');
    expect(s.host.querySelector('canvas')).toBeNull();
  }, 60000);

  it('dragging a circle through 20 positions gives at least 10 layouts', async () => {
    const play = await enterPlay({
      ...(await openMeditations()),
      reduced: true,
    });
    const id = play.tools.addShape('circle');
    const layouts = new Set<string>();
    for (let k = 0; k < 20; k++) {
      play.moveShapeTo(id, 60 + 12 * k, 80 + 20 * k);
      await play.frame();
      layouts.add(play.layoutKey());
    }
    expect(layouts.size).toBeGreaterThanOrEqual(10);
    play.exit();
  }, 60000);

  it('shake then undo restores glyph targets exactly', async () => {
    const play = await enterPlay({
      ...(await openMeditations()),
      reduced: true,
    });
    await play.frame();
    const before = play.targets();
    play.tools.shake();
    await play.frame();
    expect(play.targets()).not.toEqual(before);
    play.tools.undo();
    await play.frame();
    expect(play.targets()).toEqual(before);
    play.exit();
  }, 60000);

  it('fps: 300 frames with a drifting shape stay under the CI budget', async () => {
    const play = await enterPlay({
      ...(await openMeditations()),
      reduced: false,
    });
    play.tools.addShape('circle');
    play.tools.setShapeMotion('drift');
    for (let i = 0; i < 300; i++) await play.frame();
    const t = [...play.frameTimes].sort((a, b) => a - b);
    const p95 = t[Math.floor(t.length * 0.95)]!;
    console.info(`play p95 frame ${p95.toFixed(2)} ms`);
    expect(p95).toBeLessThanOrEqual(33);
    play.exit();
  }, 60000);

  it('warm entry is under 300 ms', async () => {
    const s = await openMeditations();
    (await enterPlay({ ...s, reduced: true })).exit();
    const t0 = performance.now();
    const play = await enterPlay({ ...s, reduced: true });
    await play.frame();
    const ms = performance.now() - t0;
    console.info(`play warm entry ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(300);
    play.exit();
  }, 60000);

  it('exits_on_relocate_and_resize', async () => {
    const s = await openMeditations();
    const play = await enterPlay({ ...s, reduced: true });
    s.renderer.dispatchEvent(
      new CustomEvent('relocate', { detail: { reason: 'anchor', range: s.range.cloneRange() } }),
    );
    expect(play.active()).toBe(true);
    s.renderer.dispatchEvent(new CustomEvent('relocate', { detail: {} }));
    expect(play.active()).toBe(false);
    const again = await enterPlay({ ...s, reduced: true });
    window.dispatchEvent(new Event('resize'));
    expect(again.active()).toBe(false);
    expect(getComputedStyle(s.renderer).opacity).toBe('1');
  }, 60000);
  const layerStore = async () => {
    const db = await WebDatabaseService.open(`play-replay-${Date.now()}-${Math.random()}`);
    await migrate(db, getMigrations('margins'));
    return MarginsStore.from(db);
  };

  it('replays at font 24 in two columns with the same words detached', async () => {
    const store = await layerStore();
    const play = await enterPlay({ ...(await openMeditations()), reduced: true, store });
    const id = play.tools.addShape('circle');
    play.moveShapeTo(id, 600, 720);
    play.tools.shake();
    await play.frame();
    const kept = await play.tools.keep('Sun and a loose sentence');
    const detached = play.detachedText();
    play.exit();
    if (!kept.ok) throw new Error(`keep refused: ${kept.reason}`);
    expect(detached).not.toBe('');
    const row = await store.getLayer(kept.layerId);
    expect(row).toMatchObject({ kind: 'play', contract: 'displace' });
    const again = await enterPlay({
      ...(await openMeditations({ fontSize: 24, columns: 2 })),
      reduced: true,
      store,
      layerId: kept.layerId,
    });
    expect(again.detachedText()).toBe(detached);
    expect(again.shapeCount()).toBe(1);
    again.exit();
  }, 60000);

  it('a Gutenberg play Margin replays on the Standard Ebooks file with no span on wrong text', async () => {
    const store = await layerStore();
    const play = await enterPlay({ ...(await openMeditations()), reduced: true, store });
    play.tools.shake();
    await play.frame();
    const kept = await play.tools.keep('A loose sentence');
    const detached = play.detachedText();
    play.exit();
    if (!kept.ok) throw new Error(`keep refused: ${kept.reason}`);
    const again = await enterPlay({
      ...(await openMeditations({ file: 'meditations-se.epub', inFamily: true })),
      reduced: true,
      store,
      layerId: kept.layerId,
    });
    expect(['', detached]).toContain(again.detachedText());
    again.exit();
  }, 60000);

  it('a replayed drift stays paused under reduced motion', async () => {
    const store = await layerStore();
    const play = await enterPlay({ ...(await openMeditations()), reduced: true, store });
    play.tools.addShape('circle');
    play.tools.setShapeMotion('drift');
    const kept = await play.tools.keep('A drifting sun');
    play.exit();
    if (!kept.ok) throw new Error(`keep refused: ${kept.reason}`);
    const again = await enterPlay({
      ...(await openMeditations()),
      reduced: true,
      store,
      layerId: kept.layerId,
    });
    expect(again.tools.state.shapeMotion).toBe('none');
    again.exit();
  }, 60000);

  it('a compose failure mid-session exits play and drops the engine', async () => {
    const s = await openMeditations();
    (await enterPlay({ ...s, reduced: true })).exit();
    const shared = loadPlayEngine();
    const engine = await shared;
    const real = engine.glue;
    let composes = 0;
    const failing = new Proxy(real, {
      get: (t, k) =>
        k === 'compose'
          ? () => {
              if (++composes > 1) throw new Error('unreachable');
              return t.compose();
            }
          : Reflect.get(t, k),
    }) as PlayGlue;
    const spy = vi.spyOn(engine, 'glue', 'get').mockReturnValue(failing);
    const play = await enterPlay({ ...s, reduced: true });
    play.tools.addShape('circle');
    await play.frame();
    spy.mockRestore();
    expect(play.active()).toBe(false);
    expect(getComputedStyle(s.renderer).opacity).toBe('1');
    expect(loadPlayEngine()).not.toBe(shared);
  }, 60000);
});
