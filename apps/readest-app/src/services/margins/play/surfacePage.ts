import type { CustomFont } from '@/styles/fonts';
import type { Renderer } from '@/types/view';
import type { BridgeContext } from '../anchorBridge';
import { FACE_MAX, loadPlayEngine, type PlayEngine } from './engine';
import { resolvePlayFont, STAND_IN_FACES, standInFor } from './fonts';
import { fallbackReason, pageBox, pageSpec, playWindow, styleRuns, type Box } from './window';

export class PlayUnavailable extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`play unavailable: ${reason}`);
    this.reason = reason;
  }
}

export interface EnterPlayArgs {
  host: HTMLElement;
  renderer: Renderer;
  ctx: BridgeContext;
  index: number;
  range: Range;
  reduced: boolean;
  customFonts?: CustomFont[];
  layerId?: string;
  onExit?: () => void;
}

export type Page = Awaited<ReturnType<typeof preparePage>>;

const BLOCK = 'p,div,blockquote,li,h1,h2,h3,h4,h5,h6';
const VENDOR_FONTS = '/vendor/margin-play/fonts';

const fetchBytes = (url: string) =>
  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`font ${r.status}`);
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b));

const registered = new Set<string>();

const xHeight = (doc: Document, font: string) => {
  const c = doc.createElement('canvas').getContext('2d');
  if (!c) return 0;
  c.font = `100px ${font}`;
  return c.measureText('x').actualBoundingBoxAscent;
};

const standInScale = async (doc: Document, cssFamily: string, key: string, bytes: Uint8Array) => {
  const name = `MarginPlay-${key}`;
  if (!registered.has(name)) {
    document.fonts.add(await new FontFace(name, new Uint8Array(bytes)).load());
    registered.add(name);
  }
  const ratio = xHeight(doc, cssFamily) / xHeight(document, `"${name}"`);
  return Number.isFinite(ratio) && ratio > 0.5 && ratio < 2 ? ratio : 1;
};

const loadFont = async (
  engine: PlayEngine,
  doc: Document,
  cssFamily: string,
  customFonts: CustomFont[],
  styled: boolean,
) => {
  const add = async (fonts: CustomFont[]) => {
    const f = await resolvePlayFont({
      cssFamily,
      customFonts: fonts,
      fetchBytes,
    });
    if (f.bytes.length > FACE_MAX) throw new PlayUnavailable('font');
    if (f.tier === 'standIn' && styled) {
      for (const key of STAND_IN_FACES[standInFor(cssFamily)].slice(1))
        await engine.addFont(key, await fetchBytes(`${VENDOR_FONTS}/${key}.ttf`));
    }
    return { ...f, family: await engine.addFont(f.key, f.bytes) };
  };
  const font =
    (await add(customFonts).catch((e: unknown) => {
      if (e instanceof PlayUnavailable) throw e;
      return null;
    })) ??
    (await add([]).catch(() => {
      throw new PlayUnavailable('font');
    }));
  const scale =
    font.tier === 'standIn' ? await standInScale(doc, cssFamily, font.key, font.bytes) : 1;
  return { family: font.family, tier: font.tier, scale };
};

const pageImages = (doc: Document, origin: { left: number; top: number }, box: Box) =>
  [...doc.images]
    .map((img) => {
      const r = img.getBoundingClientRect();
      return {
        img,
        x: r.left + origin.left - box.x,
        y: r.top + origin.top - box.y,
        w: r.width,
        h: r.height,
      };
    })
    .filter(
      (i) =>
        i.w > 0 && i.h > 0 && i.x < box.width && i.x + i.w > 0 && i.y < box.height && i.y + i.h > 0,
    );

export const preparePage = async (a: EnterPlayArgs) => {
  const { host, renderer, ctx, index, range } = a;
  const doc = range.startContainer.ownerDocument;
  const view = doc?.defaultView;
  if (!doc || !view || range.collapsed) throw new PlayUnavailable('range');
  const block = range.startContainer.parentElement?.closest(BLOCK) ?? doc.body;
  const style = view.getComputedStyle(block);
  const reason = fallbackReason({
    range,
    vertical: style.writingMode.startsWith('vertical'),
    fixedLayout: ctx.bookDoc.rendition?.layout === 'pre-paginated',
  });
  if (reason) throw new PlayUnavailable(reason);
  const hostRect = host.getBoundingClientRect();
  const frame = view.frameElement?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
  };
  const box = pageBox(range, hostRect, frame);
  const finite = [box.x, box.y, box.width, box.height].every(Number.isFinite);
  if (!finite || box.width <= 0 || box.height <= 0) throw new PlayUnavailable('range');
  const engine = await loadPlayEngine().catch(() => {
    console.error('Margins: play engine failed to load');
    throw new PlayUnavailable('engine');
  });
  const win = await playWindow(ctx, index, range).catch(() => {
    throw new PlayUnavailable('range');
  });
  if (win.end <= win.start) throw new PlayUnavailable('range');
  const runs = await styleRuns(ctx, index, range, win);
  const font = await loadFont(
    engine,
    doc,
    style.fontFamily,
    a.customFonts ?? [],
    runs.some((r) => r.italic || r.bold),
  );
  if (!engine.glue.covers(font.family, win.text)) throw new PlayUnavailable('script');
  const origin = {
    left: frame.left - hostRect.left,
    top: frame.top - hostRect.top,
  };
  const images = pageImages(doc, origin, box);
  const spec = pageSpec({
    doc,
    range,
    box,
    columns: renderer.columnCount ?? 1,
    window: win,
    family: font.family,
    scale: font.scale,
    runs,
    fixed: images.map((i) => [i.x, i.y, i.x + i.w, i.y + i.h]),
  });
  try {
    engine.glue.set_page(JSON.stringify(spec));
    engine.glue.set_shapes('[]');
    engine.glue.set_removed(new Uint32Array(0));
    engine.glue.compose();
  } catch {
    console.error('Margins: play compose failed');
    throw new PlayUnavailable('engine');
  }
  const bg = view.getComputedStyle(doc.body).backgroundColor;
  return {
    engine,
    win,
    box,
    em: spec.body.size,
    font: font.tier,
    color: style.color,
    bg,
    images,
  };
};
