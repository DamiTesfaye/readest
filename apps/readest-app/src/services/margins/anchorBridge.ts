import * as CFI from 'foliate-js/epubcfi.js';
import type { BookDoc } from '@/libs/document';
import { resolveCfi } from '@/services/annotation/providers/readest';
import type { Book } from '@/types/book';
import type { MarginsCore } from './marginsClient';
import { firstIndex, walkSection } from './textMap';
import type { Anchor } from './types';

export interface BridgeContext {
  book: Book;
  bookDoc: BookDoc;
  core: MarginsCore;
  ready: Promise<void>;
  capped: boolean;
  getCFI: (index: number, range: Range) => string;
  liveDoc: (index: number) => Document | null;
  inFamily: (textId: string | null) => boolean;
}

export interface AnchorPlacement {
  range: Range | null;
  sectionIndex: number | null;
  step: 1 | 2 | 3 | null;
  confidence: number;
  reason?: string;
  notInThisVersion?: { near: Range | null; at: number | null };
  canonical?: [number, number];
}

type RawSection = { doc: Document; nodes: Node[]; canonical: Uint8Array };

const rawSections = new WeakMap<BridgeContext, Map<number, Promise<RawSection>>>();

const rawSection = (ctx: BridgeContext, index: number): Promise<RawSection> => {
  let cache = rawSections.get(ctx);
  if (!cache) rawSections.set(ctx, (cache = new Map()));
  let pending = cache.get(index);
  if (!pending) {
    const section = ctx.bookDoc.sections[index];
    if (!section) throw new Error(`no section ${index}`);
    pending = section.createDocument().then(async (doc) => ({
      doc,
      nodes: (await walkSection(doc, ctx.book)).nodes,
      canonical: new TextEncoder().encode(
        (await ctx.core.canonicalSection(ctx.book.hash, index)).text,
      ),
    }));
    cache.set(index, pending);
  }
  return pending;
};

const isText = (node: Node) =>
  node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;

const carry = (from: Node, offset: number, to: Document) => {
  const probe = from.ownerDocument!.createRange();
  probe.setStart(from, offset);
  probe.collapse(true);
  const range = CFI.toRange(to, CFI.parse(CFI.fromRange(probe)));
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
};

const mapWithin = async (
  core: MarginsCore,
  fromText: string,
  toText: string,
  base: number,
  offset: number,
) =>
  base +
  (fromText === toText.slice(base)
    ? offset
    : await core.mapOffset(fromText, toText.slice(base), offset));

const isMark = (text: string, at: number) =>
  at >= 0 && at < text.length && /\p{M}/u.test(text[at]!);

const offMarks = (text: string, at: number, forward: boolean) => {
  let i = at;
  if (forward) while (isMark(text, i)) i++;
  else while (i > 0 && isMark(text, i)) i--;
  return i;
};

const isSpace = (byte: number | undefined) => byte === 0x20 || byte === 0x0a;

const liveToCanonical = async (
  ctx: BridgeContext,
  index: number,
  container: Node,
  offset: number,
  isEnd: boolean,
): Promise<number> => {
  const raw = await rawSection(ctx, index);
  const text = isText(container);
  const child = text ? null : (container.childNodes[offset] ?? null);
  const point = carry(child ?? container, 0, raw.doc);
  if (!point) throw new Error('selection does not map to the raw section');
  let run = raw.nodes.indexOf(point.node);
  let utf16: number;
  if (run >= 0 && text) {
    utf16 = await mapWithin(
      ctx.core,
      container.nodeValue ?? '',
      point.node.nodeValue ?? '',
      point.offset,
      offset,
    );
  } else if (run >= 0) {
    utf16 = point.offset;
  } else {
    const at = raw.doc.createRange();
    if (text || child) at.setStart(point.node, point.offset);
    else {
      at.selectNodeContents(point.node);
      at.collapse(false);
    }
    const next = firstIndex(raw.nodes, (n) => at.comparePoint(n, 0) >= 0);
    if (raw.nodes.length === 0) throw new Error('section has no text');
    if ((isEnd && next > 0) || next === raw.nodes.length) {
      run = next - 1;
      utf16 = raw.nodes[run]!.nodeValue?.length ?? 0;
    } else {
      run = next;
      utf16 = 0;
    }
  }
  utf16 = offMarks(raw.nodes[run]!.nodeValue ?? '', utf16, isEnd);
  return ctx.core.fromRaw(ctx.book.hash, index, run, utf16);
};

export const rangeToCanonical = async (ctx: BridgeContext, index: number, range: Range) => {
  const start = await liveToCanonical(ctx, index, range.startContainer, range.startOffset, false);
  const end = await liveToCanonical(ctx, index, range.endContainer, range.endOffset, true);
  const { canonical } = await rawSection(ctx, index);
  let [s, e] = [start, Math.max(start, end)];
  while (s < e && isSpace(canonical[s])) s++;
  while (e > s && isSpace(canonical[e - 1])) e--;
  return [s, e] as const;
};

const canonicalToLive = async (
  ctx: BridgeContext,
  index: number,
  live: Document,
  canonByte: number,
  isEnd = false,
) => {
  const raw = await rawSection(ctx, index);
  const found = await ctx.core.toRaw(ctx.book.hash, index, canonByte);
  const rawNode = raw.nodes[found.run];
  if (!rawNode) return null;
  const rawText = rawNode.nodeValue ?? '';
  let utf16 = found.utf16;
  if (isEnd) while (utf16 > 0 && /\s/.test(rawText[utf16 - 1]!)) utf16--;
  const point = carry(rawNode, 0, live);
  if (!point) return null;
  if (!isText(point.node)) return point;
  const offset = await mapWithin(
    ctx.core,
    rawNode.nodeValue ?? '',
    point.node.nodeValue ?? '',
    point.offset,
    utf16,
  );
  return { node: point.node, offset };
};

export const liveRange = async (
  ctx: BridgeContext,
  section: number,
  start: number,
  end: number,
): Promise<Range | null> => {
  const live = ctx.liveDoc(section);
  if (!live) return null;
  const from = await canonicalToLive(ctx, section, live, start);
  const to = await canonicalToLive(ctx, section, live, end, true);
  if (!from || !to) return null;
  const range = live.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
};

export const createAnchor = async (
  ctx: BridgeContext,
  liveRange: Range,
  sectionIndex: number,
): Promise<Anchor> => {
  await ctx.ready;
  const cfi = ctx.getCFI(sectionIndex, liveRange);
  const [start, end] = await rangeToCanonical(ctx, sectionIndex, liveRange);
  return ctx.core.buildAnchor(ctx.book.hash, {
    section: sectionIndex,
    start,
    end,
    capped: ctx.capped,
    file: { fileHash: ctx.book.hash, cfi },
  });
};

export const createAnchorAt = async (
  ctx: BridgeContext,
  sectionIndex: number,
  start: number,
  end: number,
): Promise<Anchor> => {
  await ctx.ready;
  const range = await liveRange(ctx, sectionIndex, start, end);
  return ctx.core.buildAnchor(ctx.book.hash, {
    section: sectionIndex,
    start,
    end,
    capped: ctx.capped,
    file: range ? { fileHash: ctx.book.hash, cfi: ctx.getCFI(sectionIndex, range) } : undefined,
  });
};

const sameFileSpan = async (
  ctx: BridgeContext,
  anchor: Anchor,
): Promise<[number, number, number] | null> => {
  const hint = anchor.hint.file;
  if (!hint || hint.fileHash !== ctx.book.hash) return null;
  const resolved = resolveCfi(ctx.bookDoc, hint.cfi);
  if (!resolved?.anchor || !ctx.bookDoc.sections[resolved.index]) return null;
  try {
    const doc = ctx.liveDoc(resolved.index) ?? (await rawSection(ctx, resolved.index)).doc;
    const range = resolved.anchor(doc);
    if (typeof range === 'number' || !range) return null;
    const [start, end] = await rangeToCanonical(ctx, resolved.index, range);
    return [resolved.index, start, end];
  } catch {
    return null;
  }
};

export const resolveAnchor = async (
  ctx: BridgeContext,
  anchor: Anchor,
): Promise<AnchorPlacement> => {
  await ctx.ready;
  const otherFileInFamily =
    anchor.hint.file?.fileHash !== ctx.book.hash && ctx.inFamily(anchor.textId);
  const result = await ctx.core.resolve(
    ctx.book.hash,
    anchor,
    await sameFileSpan(ctx, anchor),
    otherFileInFamily,
  );
  if (result.result === 'detached') {
    return { range: null, sectionIndex: null, step: null, confidence: 0, reason: result.reason };
  }
  if (result.result === 'notInThisVersion') {
    const [section, at] = result.near ?? [null, 0];
    const live = section === null ? null : ctx.liveDoc(section);
    const point = live && section !== null ? await canonicalToLive(ctx, section, live, at) : null;
    let near: Range | null = null;
    if (live && point) {
      near = live.createRange();
      near.setStart(point.node, point.offset);
      near.collapse(true);
    }
    return {
      range: null,
      sectionIndex: section,
      step: null,
      confidence: result.confidence,
      notInThisVersion: { near, at: section === null ? null : at },
    };
  }
  return {
    sectionIndex: result.section,
    step: result.step,
    confidence: result.confidence,
    canonical: [result.start, result.end],
    range: await liveRange(ctx, result.section, result.start, result.end),
  };
};
