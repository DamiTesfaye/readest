import { sentenceRangeAt } from '@/app/reader/utils/transientHighlight';
import { getWordRangeAt, snapRangeToWords } from '@/utils/sel';
import { AGGREGATE_MAX, PASSAGE_MAX, QUOTE_MAX, quoteCost, scalars } from './payload';
import type { LayerRow } from './store';
import type { Anchor } from './types';

export type ClipUnit = 'passage' | 'line' | 'word';

export type QuotaState =
  | { kind: 'uncapped' }
  | { kind: 'ok' }
  | { kind: 'long' }
  | { kind: 'near'; used: number }
  | { kind: 'over'; used: number };

const NEAR_AT = 2400;
const UNCLIPPABLE = 'img, svg, math, video';

export const snapClip = (range: Range, unit: ClipUnit): Range | null => {
  try {
    if (unit === 'word') return getWordRangeAt(range.startContainer, range.startOffset);
    const doc = range.startContainer.ownerDocument;
    if (unit === 'line') return doc ? sentenceRangeAt(doc, range.cloneRange()) : null;
    const r = range.cloneRange();
    snapRangeToWords(r);
    return r;
  } catch {
    return null;
  }
};

export const clipTooLong = (range: Range): boolean => scalars(range.toString()) > PASSAGE_MAX;

const translationScalars = (payload: unknown): number => {
  const elements = (payload as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return 0;
  return elements.reduce<number>((sum, e) => {
    const { kind, text } = (e ?? {}) as { kind?: unknown; text?: unknown };
    return kind === 'translation' && typeof text === 'string' ? sum + scalars(text) : sum;
  }, 0);
};

export const marginCost = (anchor: Anchor, payload: unknown, capped: boolean): number =>
  quoteCost(anchor.quote) + (capped ? translationScalars(payload) : 0);

export const usedOn = (layers: LayerRow[], capped: boolean, excludeId?: string): number =>
  layers
    .filter((l) => !l.deleted && l.id !== excludeId)
    .reduce((sum, l) => sum + marginCost(l.anchor, l.payload, capped), 0);

export const quotaState = (o: {
  capped: boolean;
  used: number;
  cost: number;
  quoteChars: number;
}): QuotaState => {
  if (!o.capped) return { kind: 'uncapped' };
  if (o.used + o.cost > AGGREGATE_MAX) return { kind: 'over', used: o.used };
  if (o.used >= NEAR_AT) return { kind: 'near', used: o.used };
  if (o.quoteChars > QUOTE_MAX) return { kind: 'long' };
  return { kind: 'ok' };
};

const elementOf = (node: Node): Element | null =>
  node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

export const canClip = (o: {
  format: string | undefined;
  range: Range | null | undefined;
  index: number | undefined;
}): boolean => {
  const { format, range, index } = o;
  if (format === 'PDF' || !range || index === undefined || range.collapsed) return false;
  if (range.startContainer.ownerDocument !== range.endContainer.ownerDocument) return false;
  if (!range.toString().trim()) return false;
  return ![range.startContainer, range.endContainer].some((n) =>
    elementOf(n)?.closest(UNCLIPPABLE),
  );
};
