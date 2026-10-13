import { describe, expect, it } from 'vitest';
import {
  canClip,
  clipTooLong,
  marginCost,
  quotaState,
  snapClip,
  usedOn,
} from '@/services/margins/clip';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const doc = new DOMParser().parseFromString(
  '<p>It was late. The King spoke slowly, and the Queen frowned.</p><p>天気がいい。散歩しよう。</p><p>A <img alt="x"> figure</p>',
  'text/html',
);
const at = (text: string, from: number, to: number) => {
  const node = [...doc.querySelectorAll('p')]
    .map((p) => p.firstChild!)
    .find((n) => n.nodeValue!.includes(text))!;
  const r = doc.createRange();
  const i = node.nodeValue!.indexOf(text);
  r.setStart(node, i + from);
  r.setEnd(node, i + to);
  return r;
};

const layer = (id: string, exact: string, deleted = false, text = ''): LayerRow => ({
  id,
  fileHash: 'h',
  textId: 'txt_1',
  anchor: { quote: { exact } } as Anchor,
  kind: text ? 'translation' : 'clip',
  payload: { elements: text ? [{ kind: 'translation', text }] : [] },
  rev: null,
  deleted,
});

describe('clip', () => {
  it('snaps a passage to whole words without touching the input', () => {
    const r = at('King spoke', 1, 7);
    expect(snapClip(r, 'passage')!.toString()).toBe('King spoke');
    expect(r.toString()).toBe('ing sp');
  });

  it('line is the sentence at the start, CJK included', () => {
    expect(snapClip(at('King', 0, 2), 'line')!.toString()).toBe(
      'The King spoke slowly, and the Queen frowned.',
    );
    expect(snapClip(at('散歩', 0, 1), 'line')!.toString()).toBe('散歩しよう。');
  });

  it('word is the word at the start, also at a block end', () => {
    expect(snapClip(at('frowned', 2, 3), 'word')!.toString()).toBe('frowned');
  });

  it('flags a passage over 3,000 scalars', () => {
    const long = new DOMParser().parseFromString(`<p>${'𝔄'.repeat(3001)}</p>`, 'text/html');
    const r = long.createRange();
    r.selectNodeContents(long.querySelector('p')!);
    expect(clipTooLong(r)).toBe(true);
    expect(clipTooLong(at('King', 0, 4))).toBe(false);
  });

  it('quota states', () => {
    expect(quotaState({ capped: false, used: 9999, cost: 300, quoteChars: 900 })).toEqual({
      kind: 'uncapped',
    });
    expect(quotaState({ capped: true, used: 2900, cost: 101, quoteChars: 10 })).toEqual({
      kind: 'over',
      used: 2900,
    });
    expect(quotaState({ capped: true, used: 2450, cost: 10, quoteChars: 10 })).toEqual({
      kind: 'near',
      used: 2450,
    });
    expect(quotaState({ capped: true, used: 0, cost: 300, quoteChars: 900 })).toEqual({
      kind: 'long',
    });
    expect(quotaState({ capped: true, used: 0, cost: 10, quoteChars: 10 })).toEqual({ kind: 'ok' });
  });

  it('cost adds translations on capped texts only', () => {
    const anchor = { quote: { exact: 'abc' } } as Anchor;
    const payload = {
      elements: [
        { kind: 'translation', text: 'éé' },
        { kind: 'note', text: 'zzz' },
      ],
    };
    expect(marginCost(anchor, payload, true)).toBe(5);
    expect(marginCost(anchor, payload, false)).toBe(3);
  });

  it('sums live Margins and can leave one out', () => {
    const rows = [layer('a', 'abc'), layer('b', 'de', false, 'xyz'), layer('c', 'zzzz', true)];
    expect(usedOn(rows, true)).toBe(8);
    expect(usedOn(rows, true, 'b')).toBe(3);
    expect(usedOn(rows, false)).toBe(5);
  });

  it('canClip refuses PDFs, images and collapsed ranges', () => {
    const r = at('King', 0, 4);
    expect(canClip({ format: 'EPUB', range: r, index: 3 })).toBe(true);
    expect(canClip({ format: 'PDF', range: r, index: 3 })).toBe(false);
    expect(canClip({ format: 'EPUB', range: at('King', 0, 0), index: 3 })).toBe(false);
    expect(canClip({ format: 'EPUB', range: r, index: undefined })).toBe(false);
    expect(canClip({ format: 'EPUB', range: null, index: 3 })).toBe(false);
    const img = doc.createRange();
    img.selectNode(doc.querySelector('img')!);
    expect(canClip({ format: 'EPUB', range: img, index: 3 })).toBe(false);
  });
});
