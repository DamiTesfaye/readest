import type { BridgeContext } from '@/services/margins/anchorBridge';
import { rangeToCanonical } from '@/services/margins/anchorBridge';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayWindowText {
  start: number;
  end: number;
  text: string;
}

export interface StyleRunJson {
  start: number;
  end: number;
  italic: boolean;
  bold: boolean;
  sizeRatio: number;
  align: 'start' | 'center' | 'end' | 'justify' | null;
}

export interface PageSpecJson {
  width: number;
  height: number;
  columns: number;
  gutter: number;
  body: {
    family: string;
    size: number;
    lineHeight: number;
    justify: boolean;
    rtl: boolean;
    paraSpace: number;
    indent: number;
  };
  window: string;
  windowStart: number;
  runs: StyleRunJson[];
  fixed: [number, number, number, number][];
}

export const utf8Slice = (bytes: Uint8Array, start: number, end: number) =>
  new TextDecoder().decode(bytes.subarray(start, end));

export const playWindow = async (
  ctx: BridgeContext,
  index: number,
  range: Range,
): Promise<PlayWindowText> => {
  const [start, end] = await rangeToCanonical(ctx, index, range);
  const section = await ctx.core.canonicalSection(ctx.book.hash, index);
  return { start, end, text: utf8Slice(new TextEncoder().encode(section.text), start, end) };
};

export const pageBox = (range: Range, frame: DOMRect, origin = { left: 0, top: 0 }): Box => {
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const left = origin.left + Math.min(...rects.map((r) => r.left));
  const top = origin.top + Math.min(...rects.map((r) => r.top));
  const right = origin.left + Math.max(...rects.map((r) => r.right));
  return {
    x: left - frame.left,
    y: top - frame.top,
    width: right - left,
    height: frame.bottom - top,
  };
};

const REJECT = ['ruby', 'table', 'svg', 'math'] as const;

export const fallbackReason = (args: {
  range: Range;
  vertical: boolean;
  fixedLayout: boolean;
}): string | null => {
  if (args.fixedLayout) return 'fixed-layout';
  if (args.vertical) return 'vertical';
  const fragment = args.range.cloneContents();
  return REJECT.find((tag) => fragment.querySelector(tag)) ?? null;
};

const px = (v: string) => parseFloat(v) || 0;

export const runAlign = (v: string): StyleRunJson['align'] =>
  v === 'center'
    ? 'center'
    : v === 'right' || v === 'end'
      ? 'end'
      : v === 'justify'
        ? 'justify'
        : null;

export const pageSpec = (a: {
  doc: Document;
  range: Range;
  box: Box;
  columns: number;
  window: PlayWindowText;
  family: string;
  scale: number;
  runs: StyleRunJson[];
  fixed: [number, number, number, number][];
}): PageSpecJson => {
  const view = a.doc.defaultView!;
  const block =
    a.range.startContainer.parentElement?.closest('p,div,blockquote,li,h1,h2,h3,h4,h5,h6') ??
    a.doc.body;
  const s = view.getComputedStyle(block);
  const size = px(s.fontSize);
  return {
    width: a.box.width,
    height: a.box.height,
    columns: a.columns,
    gutter: a.columns > 1 ? px(view.getComputedStyle(a.doc.documentElement).columnGap) : 0,
    body: {
      family: a.family,
      size: size * a.scale,
      lineHeight: s.lineHeight === 'normal' ? size * 1.2 : px(s.lineHeight),
      justify: s.textAlign === 'justify',
      rtl: s.direction === 'rtl',
      paraSpace: px(s.marginBlockEnd),
      indent: px(s.textIndent),
    },
    window: a.window.text,
    windowStart: a.window.start,
    runs: a.runs,
    fixed: a.fixed,
  };
};
